import type { RustHttpAdapter } from "../adapters/rustHttpAdapter";
import type { Conversation, FlowResponse, FriendRequest, Message, SpaceProtocolMessage, SpaceResponse, UserSummary } from "../types";
import type {
  CollaborationFlow,
  CollaborationSpace,
  ContactRequest,
  FlowRunStartResult,
  FlowTaskCompleteResult,
  InboxItem,
  Participant,
  SpaceMessage,
  UserProfile
} from "./models";
import type { WorkspaceAdapter } from "./workspaceAdapter";

function participantIdFromSource(sourceId: number): string {
  return `user-${sourceId}`;
}

function spaceIdFromSource(sourceId: number): string {
  return `space-${sourceId}`;
}

function conversationIdFromSource(sourceId: number): string {
  return `conversation-${sourceId}`;
}

function flowIdFromSource(sourceId: number): string {
  return `flow-${sourceId}`;
}

function sourceIdFromRoute(id: string, prefix: string): number {
  const normalized = id.startsWith(prefix) ? id.slice(prefix.length) : id;
  const sourceId = Number(normalized);
  if (!Number.isFinite(sourceId) || sourceId <= 0) throw new Error("缺少真实后端 ID");
  return sourceId;
}

function profileIdentityKind(identity: UserProfile["identity"] | undefined): Participant["kind"] {
  if (identity === "human") return "human";
  if (identity === "agent") return "agent";
  return "unknown";
}

function userParticipant(user: UserSummary, relationship: Participant["relationship"] = "connected"): Participant {
  return {
    id: participantIdFromSource(user.id),
    sourceId: user.id,
    displayId: user.username,
    kind: "unknown",
    displayName: user.nickname || user.username,
    handle: `@${user.username}`,
    title: "参与者",
    relationship,
    description: "来自真实后端的参与者。"
  };
}

function requestToContactRequest(request: FriendRequest, currentUserId: number): ContactRequest {
  const isOutbound = request.requester_id === currentUserId;
  const peerId = isOutbound ? request.addressee_id : request.requester_id;
  const relationship: Participant["relationship"] =
    request.status === "accepted"
      ? "connected"
      : request.status === "rejected" || request.status === "canceled"
        ? "none"
        : isOutbound
          ? "pending_outbound"
          : "pending_inbound";
  return {
    id: String(request.id),
    sourceId: request.id,
    participant: {
      id: participantIdFromSource(peerId),
      sourceId: peerId,
      kind: "unknown",
      displayName: `用户 ${peerId}`,
      title: relationship === "pending_outbound" ? "联系请求已发出" : relationship === "connected" ? "已建立联系" : "等待建立联系",
      relationship,
      description: "来自真实后端的联系请求。"
    },
    message: request.message,
    createdAt: request.created_at,
    status: request.status as ContactRequest["status"]
  };
}

function spaceType(space: SpaceResponse): string {
  return space.space_type || space.type || "group";
}

function backendMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (typeof content === "number" || typeof content === "boolean") return String(content);
  if (content == null) return "";
  if (Array.isArray(content)) return content.map(backendMessageText).filter(Boolean).join("\n");
  if (typeof content === "object") {
    const record = content as Record<string, unknown>;
    const preferred = ["text", "content", "message", "body", "source", "markdown"]
      .map((key) => record[key])
      .find((value) => value != null);
    if (preferred != null && preferred !== content) return backendMessageText(preferred);
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  return String(content);
}

function backendCreatedAt(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function messageToDomain(message: SpaceProtocolMessage): SpaceMessage {
  const content = backendMessageText(message.content);
  return {
    id: String(message.id),
    spaceId: spaceIdFromSource(message.space_id),
    senderId: participantIdFromSource(message.sender_id),
    kind: content.startsWith("流程任务已完成") ? "flow_event" : "message",
    blocks: [{ type: "text", text: content }],
    createdAt: backendCreatedAt(message.created_at),
    deliveryState: "sent"
  };
}

function conversationMessageToDomain(message: Message): SpaceMessage {
  const content = backendMessageText(message.content);
  return {
    id: String(message.id),
    spaceId: conversationIdFromSource(message.conversation_id),
    senderId: participantIdFromSource(message.sender_id),
    kind: "message",
    blocks: [{ type: "text", text: content }],
    createdAt: backendCreatedAt(message.created_at),
    deliveryState: "sent"
  };
}

function conversationPeerSourceId(conversation: Conversation, currentUserId: number): number {
  return conversation.user_low_id === currentUserId ? conversation.user_high_id : conversation.user_low_id;
}

function flowToDomain(flow: FlowResponse): CollaborationFlow {
  const trigger = flow.description || "手动启动协作流程";
  return {
    id: flowIdFromSource(flow.id),
    sourceFlowId: flow.id,
    spaceId: spaceIdFromSource(flow.space_id),
    title: flow.name,
    status: "draft",
    trigger,
    steps: [
      {
        id: `${flowIdFromSource(flow.id)}-trigger`,
        kind: "trigger",
        title: "手动启动",
        detail: trigger,
        status: "completed"
      },
      {
        id: `${flowIdFromSource(flow.id)}-task`,
        kind: "request_participant",
        title: "协作者操作",
        detail: "启动运行后会指派给空间成员处理。",
        status: "idle"
      },
      {
        id: `${flowIdFromSource(flow.id)}-notify`,
        kind: "post_to_space",
        title: "写回协作空间",
        detail: "任务完成后，后端会向协作空间写入通知消息。",
        status: "idle"
      },
      {
        id: `${flowIdFromSource(flow.id)}-finish`,
        kind: "finish",
        title: "结束",
        detail: "当前 MVP 会在任务完成后结束运行。",
        status: "idle"
      }
    ]
  };
}

export class ConnectedWorkspaceAdapter implements WorkspaceAdapter {
  private readonly participantCache = new Map<string, Participant>();

  constructor(private readonly rust: RustHttpAdapter, private readonly currentUserId: number, private readonly profile?: UserProfile, private readonly currentUsername?: string) {}

  private selfParticipant(): Participant {
    return {
      id: participantIdFromSource(this.currentUserId),
      sourceId: this.currentUserId,
      displayId: this.currentUsername,
      kind: profileIdentityKind(this.profile?.identity || "private"),
      displayName: this.profile?.displayName || "我",
      avatarUrl: this.profile?.avatarUrl || undefined,
      title: "当前账号",
      relationship: "self",
      description: this.profile?.bio || "当前真实后端登录身份。",
      region: this.profile?.region || undefined
    };
  }

  private async friendList(): Promise<UserSummary[]> {
    return this.rust.listFriends().catch(() => []);
  }

  private async contactRequests(): Promise<ContactRequest[]> {
    const requests = await this.rust.listFriendRequests().catch(() => []);
    return requests
      .filter((request) => request.status === "pending")
      .map((request) => requestToContactRequest(request, this.currentUserId));
  }

  private mergeParticipants(participants: Participant[]): Participant[] {
    const seen = new Set<string>();
    return participants.filter((participant) => {
      if (seen.has(participant.id)) return false;
      seen.add(participant.id);
      this.participantCache.set(participant.id, participant);
      return true;
    });
  }

  private cacheParticipants(participants: Participant[]): Participant[] {
    participants.forEach((participant) => this.participantCache.set(participant.id, participant));
    return participants;
  }

  private async rawSpace(spaceId: string): Promise<SpaceResponse | null> {
    const sourceId = sourceIdFromRoute(spaceId, "space-");
    const spaces = await this.rust.listSpaces();
    return spaces.find((space) => space.id === sourceId) || null;
  }

  private async rawConversation(spaceId: string): Promise<Conversation | null> {
    const sourceId = sourceIdFromRoute(spaceId, "conversation-");
    const conversations = await this.rust.listConversations();
    return conversations.find((conversation) => conversation.id === sourceId) || null;
  }

  private async sourceSpaceId(spaceId: string): Promise<number> {
    const space = await this.rawSpace(spaceId);
    if (!space) throw new Error("没有找到协作空间");
    return space.id;
  }

  private async sourceConversationId(spaceId: string): Promise<number> {
    const conversation = await this.rawConversation(spaceId);
    if (!conversation) throw new Error("没有找到一对一会话");
    return conversation.id;
  }

  private async memberSourceIds(spaceId: number, ownerId?: number): Promise<number[]> {
    const members = await this.rust.listSpaceMembers(spaceId).catch(() => []);
    const ids = new Set<number>(ownerId ? [ownerId] : []);
    members.forEach((member) => ids.add(member.user_id));
    return [...ids];
  }

  private async mapSpace(space: SpaceResponse): Promise<CollaborationSpace> {
    const [memberIds, messages, flows] = await Promise.all([
      this.memberSourceIds(space.id, space.owner_id),
      this.rust.listSpaceMessages(space.id).catch(() => []),
      this.rust.listFlows(space.id).catch(() => [])
    ]);
    const lastMessage = messages.at(-1);
    const participantIds = memberIds.map(participantIdFromSource);
    return {
      id: spaceIdFromSource(space.id),
      sourceSpaceId: space.id,
      displayId: space.display_id || undefined,
      kind: participantIds.length <= 2 && spaceType(space) !== "workflow" ? "direct" : "multi",
      title: space.name,
      avatarUrl: space.avatar_url || undefined,
      participantIds,
      description: space.description || undefined,
      announcement: space.announcement || undefined,
      lastPreview: lastMessage ? backendMessageText(lastMessage.content) : "真实协作空间",
      lastActivityAt: lastMessage ? backendCreatedAt(lastMessage.created_at) : undefined,
      hasActiveFlow: flows.length > 0
    };
  }

  private async mapConversation(conversation: Conversation): Promise<CollaborationSpace> {
    const peerSourceId = conversationPeerSourceId(conversation, this.currentUserId);
    const peerId = participantIdFromSource(peerSourceId);
    const peer = this.participantCache.get(peerId);
    const messages = await this.rust.listMessages(conversation.id).catch(() => []);
    const lastMessage = messages.at(-1);
    return {
      id: conversationIdFromSource(conversation.id),
      sourceConversationId: conversation.id,
      kind: "direct",
      title: peer ? peer.displayName : `用户 ${peerSourceId}`,
      participantIds: [participantIdFromSource(this.currentUserId), peerId],
      lastPreview: lastMessage ? backendMessageText(lastMessage.content) : "一对一会话",
      lastActivityAt: lastMessage ? backendCreatedAt(lastMessage.created_at) : undefined
    };
  }

  private async sourceParticipantId(participantId: string): Promise<number> {
    const sourceId = sourceIdFromRoute(participantId, "user-");
    if (sourceId === this.currentUserId) throw new Error("不能对当前身份执行此操作");
    return sourceId;
  }

  async listSpaces(): Promise<CollaborationSpace[]> {
    const [spaces, conversations, friends] = await Promise.all([
      this.rust.listSpaces(),
      this.rust.listConversations().catch(() => []),
      this.friendList()
    ]);
    this.cacheParticipants(friends.map((friend) => userParticipant(friend)));
    const mapped = await Promise.all([
      ...spaces.map((space) => this.mapSpace(space)),
      ...conversations.map((conversation) => this.mapConversation(conversation))
    ]);
    return mapped.sort((a, b) => Date.parse(b.lastActivityAt || "") - Date.parse(a.lastActivityAt || ""));
  }

  async getSpace(spaceId: string): Promise<CollaborationSpace | null> {
    if (spaceId.startsWith("conversation-")) {
      const conversation = await this.rawConversation(spaceId);
      return conversation ? this.mapConversation(conversation) : null;
    }
    const space = await this.rawSpace(spaceId);
    return space ? this.mapSpace(space) : null;
  }

  async listMessages(spaceId: string): Promise<SpaceMessage[]> {
    if (spaceId.startsWith("conversation-")) {
      const sourceConversationId = await this.sourceConversationId(spaceId);
      const messages = await this.rust.listMessages(sourceConversationId);
      return messages.map(conversationMessageToDomain);
    }
    const sourceSpaceId = await this.sourceSpaceId(spaceId);
    const messages = await this.rust.listSpaceMessages(sourceSpaceId);
    return messages.map(messageToDomain);
  }

  async sendMessage(spaceId: string, content: string): Promise<SpaceMessage> {
    if (spaceId.startsWith("conversation-")) {
      const sourceConversationId = await this.sourceConversationId(spaceId);
      const message = await this.rust.sendMessage(sourceConversationId, content);
      return conversationMessageToDomain(message);
    }
    const sourceSpaceId = await this.sourceSpaceId(spaceId);
    const message = await this.rust.createSpaceMessage(sourceSpaceId, content);
    return messageToDomain(message);
  }

  async listParticipants(): Promise<Participant[]> {
    const [friends, requests, spaces, conversations] = await Promise.all([
      this.friendList(),
      this.contactRequests(),
      this.rust.listSpaces().catch(() => []),
      this.rust.listConversations().catch(() => [])
    ]);
    const friendParticipants = friends.map((friend) => userParticipant(friend));
    const requestParticipants = requests.map((request) => request.participant);
    const knownBySource = new Map<number, Participant>();
    [
      ...friendParticipants,
      ...requestParticipants,
      ...this.participantCache.values()
    ].forEach((participant) => {
      if (participant.sourceId) knownBySource.set(participant.sourceId, participant);
    });
    const memberIds = new Set<number>();
    await Promise.all(spaces.map(async (space) => {
      (await this.memberSourceIds(space.id, space.owner_id)).forEach((memberId) => memberIds.add(memberId));
    }));
    conversations.forEach((conversation) => {
      memberIds.add(conversation.user_low_id);
      memberIds.add(conversation.user_high_id);
    });
    const memberParticipants = [...memberIds].map((memberId) => {
      if (memberId === this.currentUserId) {
        return this.selfParticipant();
      }
      return knownBySource.get(memberId) || {
        id: participantIdFromSource(memberId),
        sourceId: memberId,
        kind: "unknown" as const,
        displayName: `用户 ${memberId}`,
        title: "空间参与者",
        relationship: "connected" as const,
        description: "来自真实协作空间成员列表。"
      };
    });
    return this.mergeParticipants([
      this.selfParticipant(),
      ...friendParticipants,
      ...requestParticipants,
      ...memberParticipants
    ]);
  }

  async getParticipant(participantId: string): Promise<Participant | null> {
    const participants = await this.listParticipants();
    const listed = participants.find((participant) => participant.id === participantId);
    if (listed) return listed;
    const cached = this.participantCache.get(participantId);
    if (cached) return cached;
    const sourceId = Number(participantId.replace("user-", ""));
    if (!Number.isFinite(sourceId) || sourceId <= 0) return null;
    const users = await this.rust.searchUsers(String(sourceId)).catch(() => []);
    const user = users.find((candidate) => candidate.id === sourceId);
    if (!user) return null;
    const participant = userParticipant(user, "none");
    this.participantCache.set(participant.id, participant);
    return participant;
  }

  async searchParticipants(query: string): Promise<Participant[]> {
    const normalized = query.trim();
    if (!normalized) return this.listParticipants();
    const users = await this.rust.searchUsers(normalized);
    const [friends, requests] = await Promise.all([
      this.friendList(),
      this.contactRequests()
    ]);
    const friendIds = new Set(friends.map((friend) => friend.id));
    const requestRelationships = new Map(requests.map((request) => [request.participant.sourceId, request.participant.relationship]));
    return this.cacheParticipants(users.map((user) => userParticipant(user, friendIds.has(user.id) ? "connected" : requestRelationships.get(user.id) || "none")));
  }

  async createSpace(input: { title: string; participantIds: string[]; displayId?: string; avatarUrl?: string }): Promise<CollaborationSpace> {
    const title = input.title.trim();
    if (input.displayId?.trim()) throw new Error("当前后端还没有接入自定义空间 ID，暂时不能保存用户设置的空间 ID");
    if (input.avatarUrl?.trim()) throw new Error("当前后端还没有接入空间头像，暂时不能保存空间头像");
    if (!title) throw new Error("请填写协作空间名称");
    if (!input.participantIds.length) throw new Error("请至少选择一位参与者");
    const participants = await Promise.all(input.participantIds.map((participantId) => this.getParticipant(participantId)));
    const blocked = participants.find((participant) => participant?.relationship !== "connected");
    if (blocked) throw new Error("只能邀请已建立联系的参与者加入协作空间");
    const space = await this.rust.createSpace({ name: title });
    await Promise.all(input.participantIds.map(async (participantId) => {
      await this.rust.addSpaceMember(space.id, await this.sourceParticipantId(participantId));
    }));
    return this.mapSpace(space);
  }

  async createDirectSpace(participantId: string): Promise<CollaborationSpace> {
    const sourceId = await this.sourceParticipantId(participantId);
    const participant = await this.getParticipant(participantId);
    if (participant?.relationship !== "connected") throw new Error("请先建立联系，再开始一对一聊天");
    if (participant) this.participantCache.set(participant.id, participant);
    const conversation = await this.rust.createDirectConversation(sourceId);
    return this.mapConversation(conversation);
  }

  async listContactRequests(): Promise<ContactRequest[]> {
    return this.contactRequests();
  }

  async createContactRequest(participantId: string, message?: string): Promise<ContactRequest> {
    const sourceId = await this.sourceParticipantId(participantId);
    const participant = await this.getParticipant(participantId);
    const request = await this.rust.createFriendRequest({ userId: sourceId, message });
    const contactRequest: ContactRequest = {
      id: String(request.id),
      sourceId: request.id,
      participant: {
        id: participantIdFromSource(sourceId),
        sourceId,
        kind: "unknown",
        displayName: participant?.displayName || `用户 ${sourceId}`,
        handle: participant?.handle,
        title: "联系请求已发出",
        relationship: "pending_outbound",
        description: "来自真实后端的参与者。"
      },
      message: request.message,
      createdAt: request.created_at,
      status: request.status as ContactRequest["status"]
    };
    this.participantCache.set(contactRequest.participant.id, contactRequest.participant);
    return contactRequest;
  }

  async acceptContactRequest(requestId: string): Promise<ContactRequest> {
    const request = await this.rust.acceptFriendRequest(Number(requestId));
    const contactRequest = requestToContactRequest(request, this.currentUserId);
    this.participantCache.set(contactRequest.participant.id, contactRequest.participant);
    return contactRequest;
  }

  async rejectContactRequest(requestId: string): Promise<ContactRequest> {
    const request = await this.rust.rejectFriendRequest(Number(requestId));
    const contactRequest = requestToContactRequest(request, this.currentUserId);
    this.participantCache.set(contactRequest.participant.id, contactRequest.participant);
    return contactRequest;
  }

  async listInboxItems(): Promise<InboxItem[]> {
    const requests = await this.listContactRequests();
    return requests.filter((request) => request.participant.relationship === "pending_inbound").map((request) => ({
      id: `contact-${request.id}`,
      kind: "request",
      priority: "action",
      title: `${request.participant.displayName} 请求建立联系`,
      detail: request.message || "对方未填写说明。",
      createdAt: new Date().toISOString(),
      participantId: request.participant.id,
      requestId: request.id,
      status: "open"
    }));
  }

  async completeInboxItem(): Promise<void> {
    return undefined;
  }

  async listFlows(spaceId?: string): Promise<CollaborationFlow[]> {
    if (spaceId) {
      if (spaceId.startsWith("conversation-")) return [];
      const sourceSpaceId = await this.sourceSpaceId(spaceId);
      const flows = await this.rust.listFlows(sourceSpaceId);
      return flows.map(flowToDomain);
    }
    const spaces = await this.rust.listSpaces();
    const grouped = await Promise.all(spaces.map((space) => this.rust.listFlows(space.id).catch(() => [])));
    return grouped.flat().map(flowToDomain);
  }

  async getFlow(spaceId: string, flowId: string): Promise<CollaborationFlow | null> {
    const flows = await this.listFlows(spaceId);
    const sourceFlowId = Number(flowId.replace("flow-", ""));
    return flows.find((flow) => flow.id === flowId || flow.sourceFlowId === sourceFlowId) || null;
  }

  async createFlow(input: { spaceId: string; title?: string }): Promise<CollaborationFlow> {
    if (input.spaceId.startsWith("conversation-")) throw new Error("一对一聊天暂不支持创建协作流程");
    const sourceSpaceId = await this.sourceSpaceId(input.spaceId);
    const name = input.title?.trim() || "新的协作流程";
    const flow = await this.rust.createFlow(sourceSpaceId, {
      name,
      description: "开始 -> 协作者操作 -> 协作空间通知 -> 结束"
    });
    return flowToDomain(flow);
  }

  async createFlowFromMessage(spaceId: string, messageId: string): Promise<CollaborationFlow> {
    const messages = await this.listMessages(spaceId);
    const message = messages.find((item) => item.id === messageId);
    if (!message) throw new Error("没有找到触发消息");
    const textBlock = message.blocks.find((block) => block.type === "text" || block.type === "markdown");
    const text = textBlock && "text" in textBlock ? textBlock.text : textBlock && "source" in textBlock ? textBlock.source : "空间消息";
    return this.createFlow({
      spaceId,
      title: `基于消息：${text.slice(0, 18)}`
    });
  }

  async startFlowRun(input: { spaceId: string; flowId: string; assigneeId: string; taskTitle: string; taskDescription?: string }): Promise<FlowRunStartResult> {
    const [sourceSpaceId, flow] = await Promise.all([
      this.sourceSpaceId(input.spaceId),
      this.getFlow(input.spaceId, input.flowId)
    ]);
    if (!flow?.sourceFlowId) throw new Error("没有找到协作流程");
    const assigneeId = await this.sourceParticipantId(input.assigneeId);
    const result = await this.rust.startFlowRun(sourceSpaceId, flow.sourceFlowId, {
      assigneeId,
      taskTitle: input.taskTitle,
      taskDescription: input.taskDescription || null
    });
    return {
      runId: String(result.run_id),
      taskId: String(result.task_id),
      status: result.status
    };
  }

  async completeFlowTask(taskId: string, result: string): Promise<FlowTaskCompleteResult> {
    const sourceTaskId = sourceIdFromRoute(taskId, "task-");
    const response = await this.rust.completeFlowTask(sourceTaskId, result);
    return {
      runId: String(response.run_id),
      taskId: String(response.task_id),
      status: response.status
    };
  }

  async inviteParticipantToSpace(spaceId: string, participantId: string): Promise<CollaborationSpace> {
    const [sourceSpaceId, sourceParticipantId] = await Promise.all([
      this.sourceSpaceId(spaceId),
      this.sourceParticipantId(participantId)
    ]);
    const participant = await this.getParticipant(participantId);
    if (participant?.relationship !== "connected") throw new Error("只能邀请已建立联系的参与者加入协作空间");
    await this.rust.addSpaceMember(sourceSpaceId, sourceParticipantId);
    const space = await this.getSpace(spaceId);
    if (!space) throw new Error("没有找到协作空间");
    return space;
  }
}
