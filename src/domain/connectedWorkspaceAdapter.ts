import type { RustHttpAdapter } from "../adapters/rustHttpAdapter";
import type { FlowResponse, FriendRequest, SpaceProtocolMessage, SpaceResponse, UserSummary } from "../types";
import type {
  CollaborationFlow,
  CollaborationSpace,
  ContactRequest,
  FlowRunStartResult,
  FlowTaskCompleteResult,
  InboxItem,
  Participant,
  SpaceMessage
} from "./models";
import type { WorkspaceAdapter } from "./workspaceAdapter";

function participantIdFromSource(sourceId: number): string {
  return `user-${sourceId}`;
}

function spaceIdFromSource(sourceId: number): string {
  return `space-${sourceId}`;
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

function userParticipant(user: UserSummary, relationship: Participant["relationship"] = "connected"): Participant {
  return {
    id: participantIdFromSource(user.id),
    sourceId: user.id,
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
    status: request.status as ContactRequest["status"]
  };
}

function spaceType(space: SpaceResponse): string {
  return space.space_type || space.type || "group";
}

function messageToDomain(message: SpaceProtocolMessage): SpaceMessage {
  return {
    id: String(message.id),
    spaceId: spaceIdFromSource(message.space_id),
    senderId: participantIdFromSource(message.sender_id),
    kind: message.content.startsWith("流程任务已完成") ? "flow_event" : "message",
    blocks: [{ type: "text", text: message.content }],
    createdAt: message.created_at,
    deliveryState: "sent"
  };
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

  constructor(private readonly rust: RustHttpAdapter, private readonly currentUserId: number) {}

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

  private async sourceSpaceId(spaceId: string): Promise<number> {
    const space = await this.rawSpace(spaceId);
    if (!space) throw new Error("没有找到协作空间");
    return space.id;
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
      kind: participantIds.length <= 2 && spaceType(space) !== "workflow" ? "direct" : "multi",
      title: space.name,
      participantIds,
      lastPreview: lastMessage?.content || "真实协作空间",
      lastActivityAt: lastMessage?.created_at,
      hasActiveFlow: flows.length > 0
    };
  }

  private async sourceParticipantId(participantId: string): Promise<number> {
    const sourceId = sourceIdFromRoute(participantId, "user-");
    if (sourceId === this.currentUserId) throw new Error("不能对当前身份执行此操作");
    return sourceId;
  }

  async listSpaces(): Promise<CollaborationSpace[]> {
    const spaces = await this.rust.listSpaces();
    return Promise.all(spaces.map((space) => this.mapSpace(space)));
  }

  async getSpace(spaceId: string): Promise<CollaborationSpace | null> {
    const space = await this.rawSpace(spaceId);
    return space ? this.mapSpace(space) : null;
  }

  async listMessages(spaceId: string): Promise<SpaceMessage[]> {
    const sourceSpaceId = await this.sourceSpaceId(spaceId);
    const messages = await this.rust.listSpaceMessages(sourceSpaceId);
    return messages.map(messageToDomain);
  }

  async sendMessage(spaceId: string, content: string): Promise<SpaceMessage> {
    const sourceSpaceId = await this.sourceSpaceId(spaceId);
    const message = await this.rust.createSpaceMessage(sourceSpaceId, content);
    return messageToDomain(message);
  }

  async listParticipants(): Promise<Participant[]> {
    const [friends, requests, spaces] = await Promise.all([
      this.friendList(),
      this.contactRequests(),
      this.rust.listSpaces().catch(() => [])
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
    const memberParticipants = [...memberIds].map((memberId) => {
      if (memberId === this.currentUserId) {
        return {
          id: participantIdFromSource(this.currentUserId),
          sourceId: this.currentUserId,
          kind: "unknown" as const,
          displayName: "我",
          title: "当前账号",
          relationship: "self" as const,
          description: "当前真实后端登录身份。"
        };
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
      {
        id: participantIdFromSource(this.currentUserId),
        sourceId: this.currentUserId,
        kind: "unknown",
        displayName: "我",
        title: "当前账号",
        relationship: "self",
        description: "当前真实后端登录身份。"
      },
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

  async createSpace(input: { title: string; participantIds: string[] }): Promise<CollaborationSpace> {
    const title = input.title.trim();
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
    if (participant?.relationship !== "connected") throw new Error("请先建立联系，再开始一对一协作空间");
    const name = `与${participant?.displayName || `用户 ${sourceId}`}的协作空间`;
    const space = await this.rust.createSpace({ name });
    await this.rust.addSpaceMember(space.id, sourceId);
    return this.mapSpace(space);
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
