import type { RustHttpAdapter } from "../adapters/rustHttpAdapter";
import type { SessionState } from "../domain/models";
import type { RefreshTokenStore } from "../types";

export interface SessionBootstrapResult {
  accessToken: string | null;
  session: SessionState;
}

export async function restoreConnectedSession(
  adapter: RustHttpAdapter,
  tokenStore: RefreshTokenStore
): Promise<SessionBootstrapResult> {
  if (!adapter.hasRefreshToken()) {
    return {
      accessToken: null,
      session: { status: "anonymous" }
    };
  }

  try {
    const tokens = await adapter.restoreSession();
    adapter.setAccessToken(tokens.accessToken);
    const me = await adapter.me();
    return {
      accessToken: tokens.accessToken,
      session: { status: "authenticated", userId: `user-${me.user_id}`, sourceUserId: me.user_id }
    };
  } catch {
    adapter.setAccessToken(null);
    tokenStore.clear();
    return {
      accessToken: null,
      session: { status: "anonymous" }
    };
  }
}
