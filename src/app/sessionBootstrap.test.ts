import { describe, expect, it, vi } from "vitest";
import type { RustHttpAdapter } from "../adapters/rustHttpAdapter";
import { MemoryRefreshTokenStore } from "../adapters/tokenStore";
import { restoreConnectedSession } from "./sessionBootstrap";

function adapterStub(overrides: Partial<RustHttpAdapter> = {}) {
  return {
    hasRefreshToken: vi.fn(() => true),
    restoreSession: vi.fn(async () => ({ accessToken: "access-1", refreshToken: "refresh-2", expiresIn: 900 })),
    setAccessToken: vi.fn(),
    me: vi.fn(async () => ({ user_id: 42 })),
    ...overrides
  } as unknown as RustHttpAdapter;
}

describe("session bootstrap", () => {
  it("enters anonymous state when there is no refresh token", async () => {
    const adapter = adapterStub({ hasRefreshToken: vi.fn(() => false) });
    const store = new MemoryRefreshTokenStore();

    const result = await restoreConnectedSession(adapter, store);

    expect(result).toEqual({ accessToken: null, session: { status: "anonymous" } });
    expect(adapter.restoreSession).not.toHaveBeenCalled();
  });

  it("restores an authenticated session through refresh token and me", async () => {
    const adapter = adapterStub();
    const store = new MemoryRefreshTokenStore();
    store.set("refresh-1");

    const result = await restoreConnectedSession(adapter, store);

    expect(adapter.setAccessToken).toHaveBeenCalledWith("access-1");
    expect(adapter.me).toHaveBeenCalled();
    expect(result).toEqual({
      accessToken: "access-1",
      session: { status: "authenticated", userId: "user-42", sourceUserId: 42 }
    });
  });

  it("clears invalid credentials and returns anonymous when refresh fails", async () => {
    const adapter = adapterStub({
      restoreSession: vi.fn(async () => {
        throw new Error("expired");
      })
    });
    const store = new MemoryRefreshTokenStore();
    store.set("bad-refresh");

    const result = await restoreConnectedSession(adapter, store);

    expect(store.get()).toBeNull();
    expect(adapter.setAccessToken).toHaveBeenCalledWith(null);
    expect(result).toEqual({ accessToken: null, session: { status: "anonymous" } });
  });
});
