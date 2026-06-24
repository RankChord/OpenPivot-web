import {
  OpenPivotApiError,
  type AuthTokens,
  type Conversation,
  type CompleteFlowTaskResponse,
  type FlowResponse,
  type FriendRequest,
  type Message,
  type OpenPivotAdapter,
  type RefreshTokenStore,
  type SpaceMemberResponse,
  type SpaceProtocolMessage,
  type SpaceResponse,
  type StartFlowRunResponse,
  type UserSummary
} from "../types";

interface RustHttpAdapterOptions {
  baseUrl: string;
  refreshTokenStore: RefreshTokenStore;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class RustHttpAdapter implements OpenPivotAdapter {
  readonly mode = "connected" as const;
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshTokenStore: RefreshTokenStore;
  private refreshPromise: Promise<TokenResponse> | null = null;

  constructor(options: RustHttpAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.refreshTokenStore = options.refreshTokenStore;
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  hasRefreshToken(): boolean {
    return !!this.refreshTokenStore.get();
  }

  async restoreSession(): Promise<AuthTokens> {
    const response = await this.performRefresh();
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in
    };
  }

  clearSession(): void {
    this.accessToken = null;
    this.refreshTokenStore.clear();
  }

  async health(): Promise<string> {
    return this.requestText("/system/health", { auth: false });
  }

  async register(input: { username: string; password: string; nickname: string }): Promise<UserSummary> {
    return this.requestJson("/auth/register", {
      method: "POST",
      body: input,
      auth: false
    });
  }

  async login(input: { username: string; password: string }): Promise<AuthTokens> {
    const response = await this.requestJson<TokenResponse>("/auth/login", {
      method: "POST",
      body: input,
      auth: false
    });
    this.accessToken = response.access_token;
    this.refreshTokenStore.set(response.refresh_token);
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in
    };
  }

  async logout(): Promise<void> {
    const refreshToken = this.refreshTokenStore.get();
    if (refreshToken) {
      await this.requestJson("/auth/logout", {
        method: "POST",
        body: { refresh_token: refreshToken },
        auth: false
      }).catch(() => undefined);
    }
    this.clearSession();
  }

  me(): Promise<{ user_id: number }> {
    return this.requestJson("/auth/me");
  }

  searchUsers(q: string): Promise<UserSummary[]> {
    return this.requestJson(`/users/search?q=${encodeURIComponent(q)}`);
  }

  async listFriends(): Promise<UserSummary[]> {
    return this.requestJsonWithSlashFallback("/friends");
  }

  listFriendRequests(): Promise<FriendRequest[]> {
    return this.requestJson("/friends/requests");
  }

  createFriendRequest(input: { userId: number; message?: string }): Promise<FriendRequest> {
    return this.requestJson("/friends/requests", {
      method: "POST",
      body: { user_id: input.userId, message: input.message || null }
    });
  }

  acceptFriendRequest(id: number): Promise<FriendRequest> {
    return this.requestJson(`/friends/requests/${id}/accept`, { method: "POST" });
  }

  rejectFriendRequest(id: number): Promise<FriendRequest> {
    return this.requestJson(`/friends/requests/${id}/reject`, { method: "POST" });
  }

  async listConversations(): Promise<Conversation[]> {
    return this.requestJsonWithSlashFallback("/conversations");
  }

  createDirectConversation(userId: number): Promise<Conversation> {
    return this.requestJson("/conversations/direct", {
      method: "POST",
      body: { user_id: userId }
    });
  }

  listMessages(conversationId: number): Promise<Message[]> {
    return this.requestJson(`/conversations/${conversationId}/messages`);
  }

  sendMessage(conversationId: number, content: string): Promise<Message> {
    return this.requestJson(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: { content }
    });
  }

  createSpace(input: { name: string }): Promise<SpaceResponse> {
    return this.requestJson("/spaces/", {
      method: "POST",
      body: input
    });
  }

  async listSpaces(): Promise<SpaceResponse[]> {
    return this.requestJsonWithSlashFallback("/spaces");
  }

  addSpaceMember(spaceId: number, userId: number): Promise<SpaceMemberResponse> {
    return this.requestJson(`/spaces/${spaceId}/members`, {
      method: "POST",
      body: { user_id: userId }
    });
  }

  listSpaceMembers(spaceId: number): Promise<SpaceMemberResponse[]> {
    return this.requestJson(`/spaces/${spaceId}/members`);
  }

  createSpaceMessage(spaceId: number, content: string): Promise<SpaceProtocolMessage> {
    return this.requestJson(`/spaces/${spaceId}/messages`, {
      method: "POST",
      body: { content }
    });
  }

  listSpaceMessages(spaceId: number): Promise<SpaceProtocolMessage[]> {
    return this.requestJson(`/spaces/${spaceId}/messages`);
  }

  createFlow(spaceId: number, input: { name: string; description?: string | null }): Promise<FlowResponse> {
    return this.requestJson(`/spaces/${spaceId}/flows`, {
      method: "POST",
      body: {
        name: input.name,
        description: input.description ?? null
      }
    });
  }

  listFlows(spaceId: number): Promise<FlowResponse[]> {
    return this.requestJson(`/spaces/${spaceId}/flows`);
  }

  startFlowRun(spaceId: number, flowId: number, input: { assigneeId: number; taskTitle: string; taskDescription?: string | null }): Promise<StartFlowRunResponse> {
    return this.requestJson(`/spaces/${spaceId}/flows/${flowId}/runs`, {
      method: "POST",
      body: {
        assignee_id: input.assigneeId,
        task_title: input.taskTitle,
        task_description: input.taskDescription ?? null
      }
    });
  }

  completeFlowTask(taskId: number, result: string): Promise<CompleteFlowTaskResponse> {
    return this.requestJson(`/flow-tasks/${taskId}/complete`, {
      method: "POST",
      body: { result }
    });
  }

  private async requestJsonWithSlashFallback<T>(path: string): Promise<T> {
    try {
      return await this.requestJson<T>(path);
    } catch (error) {
      if (error instanceof OpenPivotApiError && error.status === 404 && !path.endsWith("/")) {
        return this.requestJson<T>(`${path}/`);
      }
      throw error;
    }
  }

  private async requestText(path: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.request(path, options);
    return response.text();
  }

  private async requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.request(path, options);
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private async request(path: string, options: RequestOptions = {}, retry = true): Promise<Response> {
    const headers = new Headers(options.headers);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (options.auth !== false && this.accessToken) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }

    const response = await fetch(`${this.baseUrl}/v1${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    if (response.status === 401 && retry && options.auth !== false && this.refreshTokenStore.get()) {
      await this.refreshAccessToken();
      return this.request(path, options, false);
    }

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    return response;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
  }

  private async performRefresh(): Promise<TokenResponse> {
    const refreshToken = this.refreshTokenStore.get();
    if (!refreshToken) throw new OpenPivotApiError(401, { code: "unauthorized", message: "Missing refresh token" });

    const response = await fetch(`${this.baseUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!response.ok) {
      this.clearSession();
      throw await this.toApiError(response);
    }

    const payload = (await response.json()) as TokenResponse;
    this.accessToken = payload.access_token;
    this.refreshTokenStore.set(payload.refresh_token);
    return payload;
  }

  private async toApiError(response: Response): Promise<OpenPivotApiError> {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return new OpenPivotApiError(response.status, await response.json().catch(() => undefined));
    }
    return new OpenPivotApiError(response.status, await response.text().catch(() => response.statusText));
  }
}

interface RequestOptions {
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
  auth?: boolean;
}
