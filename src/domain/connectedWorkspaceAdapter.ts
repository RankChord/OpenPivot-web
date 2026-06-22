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

function requestToContactRequest(request: FriendRequest): ContactRequest {
  return {
    id: String(request.id),
    sourceId: request.id,
    participant: {
      id: `user-${request.requester_id}`,
      sourceId: request.requester_id,
      kind: "unknown",
      displayName: `用户 ${request.requester_id}`,
      title: "等待建立联系",
      relationship: "pending_inbound",
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
  constructor(private readonly rust: RustHttpAdapter, private readonly currentUserId: number) {}

  private async friendList(): Promise<UserSummary[]> {
    return this.rust.listFriends().catch(() => []);
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
    const friends = await this.friendList();
    return [
      {
        id: `user-${this.currentUserId}`,
        sourceId: this.currentUserId,
        kind: "unknown",
        displayName: "我",
        title: "当前账号",
        relationship: "self",
        description: "当前真实后端登录身份。"
      },
      ...friends.map((friend) => userParticipant(friend))
    ];
  }

  async getParticipant(participantId: string): Promise<Participant | null> {
    const participants = await this.listParticipants();
    return participants.find((participant) => participant.id === participantId) || null;
  }

  async searchParticipants(query: string): Promise<Participant[]> {
    const normalized = query.trim();
    if (!normalized) return this.listParticipants();
    const users = await this.rust.searchUsers(normalized);
    const friends = await this.friendList();
    const friendIds = new Set(friends.map((friend) => friend.id));
    return users.map((user) => userParticipant(user, friendIds.has(user.id) ? "connected" : "none"));
  }

  async createDirectSpace(participantId: string): Promise<CollaborationSpace> {
    const sourceId = Number(participantId.replace("user-", ""));
    if (!Number.isFinite(sourceId) || sourceId <= 0) throw new Error("参与者缺少真实后端 ID");
    const conversation = await this.rust.createDirectConversation(sourceId);
    const friends = await this.friendList();
    return conversationToSpace(conversation, this.currentUserId, friends);
  }

  async listContactRequests(): Promise<ContactRequest[]> {
    const requests = await this.rust.listFriendRequests();
    return requests.map(requestToContactRequest);
  }

  async createContactRequest(participantId: string, message?: string): Promise<ContactRequest> {
    const sourceId = Number(participantId.replace("user-", ""));
    if (!Number.isFinite(sourceId) || sourceId <= 0) throw new Error("参与者缺少真实后端 ID");
    const request = await this.rust.createFriendRequest({ userId: sourceId, message });
    return requestToContactRequest(request);
  }

  async acceptContactRequest(requestId: string): Promise<ContactRequest> {
    const request = await this.rust.acceptFriendRequest(Number(requestId));
    return requestToContactRequest(request);
  }

  async rejectContactRequest(requestId: string): Promise<ContactRequest> {
    const request = await this.rust.rejectFriendRequest(Number(requestId));
    return requestToContactRequest(request);
  }

  async listInboxItems(): Promise<InboxItem[]> {
    const requests = await this.listContactRequests();
    return requests.map((request) => ({
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

  async createFlowFromMessage(): Promise<CollaborationFlow> {
    throw new Error("真实后端暂未接入协作流程。");
  }
}
