import { demoActors, demoConversation } from "../data/demo";
import type {
  AuthTokens,
  Conversation,
  FriendRequest,
  Message,
  OpenPivotAdapter,
  UserSummary
} from "../types";

export class DemoAdapter implements OpenPivotAdapter {
  readonly mode = "demo" as const;
  private currentUserId = 100;
  private friends: UserSummary[] = [
    { id: 101, username: "lin", nickname: "林舟" },
    { id: 102, username: "chen", nickname: "陈默" },
    { id: 103, username: "atlas", nickname: "星图前端" }
  ];
  private requests: FriendRequest[] = [
    {
      id: 1,
      requester_id: 104,
      addressee_id: 100,
      status: "pending",
      message: "我可以加入发布协作室吗？"
    }
  ];
  private conversations: Conversation[] = [{ id: 9001, conversation_type: "direct", user_low_id: 100, user_high_id: 101 }];
  private messages: Message[] = demoConversation.messages.map((message, index) => ({
    id: index + 1,
    conversation_id: 9001,
    sender_id: message.actorId === "lin" ? 101 : 100,
    content: message.content,
    created_at: message.createdAt
  }));

  async health(): Promise<string> {
    return "演示模式";
  }

  async register(input: { username: string; password: string; nickname: string }): Promise<UserSummary> {
    return { id: this.currentUserId, username: input.username, nickname: input.nickname };
  }

  async login(): Promise<AuthTokens> {
    return { accessToken: "demo-access", refreshToken: "demo-refresh", expiresIn: 3600 };
  }

  async logout(): Promise<void> {
    return undefined;
  }

  async me(): Promise<{ user_id: number }> {
    return { user_id: this.currentUserId };
  }

  async searchUsers(q: string): Promise<UserSummary[]> {
    const query = q.toLowerCase();
    return demoActors
      .filter((actor) => actor.displayName.toLowerCase().includes(query) || actor.handle?.includes(query))
      .map((actor, index) => ({
        id: 200 + index,
        username: actor.handle?.replace("@", "") || actor.id,
        nickname: actor.displayName
      }));
  }

  async listFriends(): Promise<UserSummary[]> {
    return this.friends;
  }

  async listFriendRequests(): Promise<FriendRequest[]> {
    return this.requests.filter((request) => request.status === "pending");
  }

  async createFriendRequest(input: { userId: number; message?: string }): Promise<FriendRequest> {
    return {
      id: Date.now(),
      requester_id: this.currentUserId,
      addressee_id: input.userId,
      status: "pending",
      message: input.message || null
    };
  }

  async acceptFriendRequest(id: number): Promise<FriendRequest> {
    const request = this.requests.find((item) => item.id === id);
    if (!request) throw new Error("未找到好友申请");
    request.status = "accepted";
    this.friends.push({ id: request.requester_id, username: `user${request.requester_id}`, nickname: `用户 ${request.requester_id}` });
    return request;
  }

  async rejectFriendRequest(id: number): Promise<FriendRequest> {
    const request = this.requests.find((item) => item.id === id);
    if (!request) throw new Error("未找到好友申请");
    request.status = "rejected";
    return request;
  }

  async listConversations(): Promise<Conversation[]> {
    return this.conversations;
  }

  async createDirectConversation(userId: number): Promise<Conversation> {
    const existing = this.conversations.find((conversation) => conversation.user_high_id === userId || conversation.user_low_id === userId);
    if (existing) return existing;
    const conversation = { id: Date.now(), conversation_type: "direct", user_low_id: this.currentUserId, user_high_id: userId };
    this.conversations.unshift(conversation);
    return conversation;
  }

  async listMessages(conversationId: number): Promise<Message[]> {
    return this.messages.filter((message) => message.conversation_id === conversationId);
  }

  async sendMessage(conversationId: number, content: string): Promise<Message> {
    const message = {
      id: Date.now(),
      conversation_id: conversationId,
      sender_id: this.currentUserId,
      content,
      created_at: new Date().toISOString()
    };
    this.messages.push(message);
    return message;
  }
}
