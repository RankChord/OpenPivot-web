export type ProductMode = "connected" | "demo";

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

export interface SpaceResponse {
  id: number;
  name: string;
  space_type?: "group" | "workflow" | string;
  type?: "group" | "workflow" | string;
  owner_id: number;
}

export interface SpaceMemberResponse {
  id: number;
  space_id: number;
  user_id: number;
  role: "owner" | "admin" | "member" | string;
}

export interface SpaceProtocolMessage {
  id: number;
  space_id: number;
  sender_id: number;
  content: string;
  created_at: string;
}

export interface FlowResponse {
  id: number;
  space_id: number;
  name: string;
  description: string | null;
  created_by: number;
}

export interface StartFlowRunResponse {
  run_id: number;
  task_id: number;
  status: "waiting_action" | string;
}

export interface CompleteFlowTaskResponse {
  task_id: number;
  run_id: number;
  status: "completed" | string;
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
  createSpace(input: { name: string }): Promise<SpaceResponse>;
  listSpaces(): Promise<SpaceResponse[]>;
  addSpaceMember(spaceId: number, userId: number): Promise<SpaceMemberResponse>;
  listSpaceMembers(spaceId: number): Promise<SpaceMemberResponse[]>;
  createSpaceMessage(spaceId: number, content: string): Promise<SpaceProtocolMessage>;
  listSpaceMessages(spaceId: number): Promise<SpaceProtocolMessage[]>;
  createFlow(spaceId: number, input: { name: string; description?: string | null }): Promise<FlowResponse>;
  listFlows(spaceId: number): Promise<FlowResponse[]>;
  startFlowRun(spaceId: number, flowId: number, input: { assigneeId: number; taskTitle: string; taskDescription?: string | null }): Promise<StartFlowRunResponse>;
  completeFlowTask(taskId: number, result: string): Promise<CompleteFlowTaskResponse>;
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
