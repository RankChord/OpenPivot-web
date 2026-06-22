import type { RustHttpAdapter } from "../adapters/rustHttpAdapter";
import type { Conversation, FriendRequest, Message, UserSummary } from "../types";
import type {
  CollaborationFlow,
  CollaborationSpace,
  ContactRequest,
  InboxItem,
  Participant,
  SpaceMessage
} from "./models";
import type { WorkspaceAdapter } from "./workspaceAdapter";

function userParticipant(user: UserSummary, relationship: Participant["relationship"] = "connected"): Participant {
  return {
    id: `user-${user.id}`,
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
      id: `user-${peerId}`,
      sourceId: peerId,
      kind: "unknown",
      displayName: `用户 ${peerId}`,
      title: relationship === "pending_outbound" ? "联系请求已发送" : relationship === "connected" ? "已建立联系" : "等待建立联系",
      relationship,
      description: "来自真实后端的联系请求。"
    },
    message: request.message,
    status: request.status as ContactRequest["status"]
  };
}

function conversationPeerId(conversation: Conversation, currentUserId: number): number {
  return conversation.user_low_id === currentUserId ? conversation.user_high_id : conversation.user_low_id;
}

function conversationToSpace(conversation: Conversation, currentUserId: number, friends: UserSummary[]): CollaborationSpace {
  const peerId = conversationPeerId(conversation, currentUserId);
  const friend = friends.find((item) => item.id === peerId);
  const title = friend ? `与${friend.nickname || friend.username}的对话` : `与用户 ${peerId} 的对话`;
  return {
    id: `conversation-${conversation.id}`,
    sourceConversationId: conversation.id,
    kind: "direct",
    title,
    participantIds: [`user-${currentUserId}`, `user-${peerId}`],
    lastPreview: "真实后端会话",
    lastActivityAt: undefined,
    hasActiveFlow: false
  };
}

function messageToDomain(message: Message): SpaceMessage {
  return {
    id: String(message.id),
    spaceId: `conversation-${message.conversation_id}`,
    senderId: `user-${message.sender_id}`,
    kind: "message",
    blocks: [{ type: "text", text: message.content }],
    createdAt: message.created_at,
    deliveryState: "sent"
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

  private async sourceConversationId(spaceId: string): Promise<number> {
    const fromRoute = Number(spaceId.replace("conversation-", ""));
    if (Number.isFinite(fromRoute) && fromRoute > 0) return fromRoute;
    const spaces = await this.listSpaces();
    const space = spaces.find((item) => item.id === spaceId);
    if (!space?.sourceConversationId) throw new Error("没有找到协作空间");
    return space.sourceConversationId;
  }

  async listSpaces(): Promise<CollaborationSpace[]> {
    const [conversations, friends] = await Promise.all([
      this.rust.listConversations(),
      this.friendList()
    ]);
    return conversations.map((conversation) => conversationToSpace(conversation, this.currentUserId, friends));
  }

  async getSpace(spaceId: string): Promise<CollaborationSpace | null> {
    const spaces = await this.listSpaces();
    return spaces.find((space) => space.id === spaceId) || null;
  }

  async listMessages(spaceId: string): Promise<SpaceMessage[]> {
    const conversationId = await this.sourceConversationId(spaceId);
    const messages = await this.rust.listMessages(conversationId);
    return messages.map(messageToDomain);
  }

  async sendMessage(spaceId: string, content: string): Promise<SpaceMessage> {
    const conversationId = await this.sourceConversationId(spaceId);
    const message = await this.rust.sendMessage(conversationId, content);
    return messageToDomain(message);
  }

  async listParticipants(): Promise<Participant[]> {
    const [friends, requests] = await Promise.all([
      this.friendList(),
      this.contactRequests()
    ]);
    return this.mergeParticipants([
      {
        id: `user-${this.currentUserId}`,
        sourceId: this.currentUserId,
        kind: "unknown",
        displayName: "我",
        title: "当前账号",
        relationship: "self",
        description: "当前真实后端登录身份。"
      },
      ...friends.map((friend) => userParticipant(friend)),
      ...requests.map((request) => request.participant)
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

  async createDirectSpace(participantId: string): Promise<CollaborationSpace> {
    const sourceId = Number(participantId.replace("user-", ""));
    if (!Number.isFinite(sourceId) || sourceId <= 0) throw new Error("参与者缺少真实后端 ID");
    if (sourceId === this.currentUserId) throw new Error("不能和当前身份创建一对一协作空间");
    const participant = await this.getParticipant(participantId);
    if (participant?.relationship !== "connected") throw new Error("请先建立联系，再开始一对一协作空间");
    const conversation = await this.rust.createDirectConversation(sourceId);
    const friends = await this.friendList();
    return conversationToSpace(conversation, this.currentUserId, friends);
  }

  async listContactRequests(): Promise<ContactRequest[]> {
    return this.contactRequests();
  }

  async createContactRequest(participantId: string, message?: string): Promise<ContactRequest> {
    const sourceId = Number(participantId.replace("user-", ""));
    if (!Number.isFinite(sourceId) || sourceId <= 0) throw new Error("参与者缺少真实后端 ID");
    const participant = await this.getParticipant(participantId);
    const request = await this.rust.createFriendRequest({ userId: sourceId, message });
    const contactRequest: ContactRequest = {
      id: String(request.id),
      sourceId: request.id,
      participant: {
        id: `user-${sourceId}`,
        sourceId,
        kind: "unknown",
        displayName: participant?.displayName || `用户 ${sourceId}`,
        handle: participant?.handle,
        title: "联系请求已发送",
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

  async listFlows(): Promise<CollaborationFlow[]> {
    return [];
  }

  async getFlow(): Promise<CollaborationFlow | null> {
    return null;
  }

  async createFlow(): Promise<CollaborationFlow> {
    throw new Error("真实后端暂未接入协作流程。");
  }

  async createFlowFromMessage(): Promise<CollaborationFlow> {
    throw new Error("真实后端暂未接入协作流程。");
  }

  async inviteParticipantToSpace(): Promise<CollaborationSpace> {
    throw new Error("邀请参与者加入已有空间暂未接入当前后端协议。");
  }
}
