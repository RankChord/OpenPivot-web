export type ProductMode = "connected" | "demo";

export type ActorKind = "human" | "agent" | "unknown";

export type ActorRole = "owner" | "admin" | "member";

export interface Actor {
  id: string;
  kind: ActorKind;
  displayName: string;
  handle?: string;
  role?: ActorRole;
  description?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserSummary {
  id: number;
  username: string;
  nickname: string;
}

export interface FriendRequest {
  id: number;
  requester_id: number;
  addressee_id: number;
  status: "pending" | "accepted" | "rejected" | "canceled" | string;
  message: string | null;
}

export interface Conversation {
  id: number;
  conversation_type: "direct" | string;
  user_low_id: number;
  user_high_id: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  created_at: string;
}

export interface DemoMessage {
  id: string;
  actorId: string;
  content: string;
  createdAt: string;
  replyToId?: string;
  reaction?: string;
}

export interface DemoConversation {
  id: string;
  title: string;
  actorIds: string[];
  messages: DemoMessage[];
}

export interface WorkflowNode {
  id: string;
  label: string;
  actorId?: string;
  type: "trigger" | "human" | "agent" | "parallel" | "conditional" | "retry" | "timeout" | "approval";
  status: "preview" | "waiting" | "ready";
}

export interface OpenPivotAdapter {
  mode: ProductMode;
  health(): Promise<string>;
  register(input: { username: string; password: string; nickname: string }): Promise<UserSummary>;
  login(input: { username: string; password: string }): Promise<AuthTokens>;
  logout(): Promise<void>;
  me(): Promise<{ user_id: number }>;
  searchUsers(q: string): Promise<UserSummary[]>;
  listFriends(): Promise<UserSummary[]>;
  listFriendRequests(): Promise<FriendRequest[]>;
  createFriendRequest(input: { userId: number; message?: string }): Promise<FriendRequest>;
  acceptFriendRequest(id: number): Promise<FriendRequest>;
  rejectFriendRequest(id: number): Promise<FriendRequest>;
  listConversations(): Promise<Conversation[]>;
  createDirectConversation(userId: number): Promise<Conversation>;
  listMessages(conversationId: number): Promise<Message[]>;
  sendMessage(conversationId: number, content: string): Promise<Message>;
}

export interface RefreshTokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
}

export class OpenPivotApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, body?: ApiErrorBody | string) {
    const message = typeof body === "string" ? body : body?.message;
    super(message || `HTTP ${status}`);
    this.status = status;
    this.code = typeof body === "string" ? "request_failed" : body?.code || "request_failed";
  }
}
