import { describe, expect, it, vi } from "vitest";
import { RustHttpAdapter } from "./rustHttpAdapter";
import { MemoryRefreshTokenStore } from "./tokenStore";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
}

describe("RustHttpAdapter", () => {
  it("refreshes once for concurrent 401 responses and retries original requests", async () => {
    const store = new MemoryRefreshTokenStore();
    store.set("old-refresh");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/auth/refresh")) {
        return jsonResponse({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 900 });
      }
      if (url.endsWith("/v1/auth/me")) {
        const callCount = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/v1/auth/me")).length;
        if (callCount <= 2) {
          return jsonResponse({ code: "unauthorized", message: "Unauthorized" }, { status: 401 });
        }
        return jsonResponse({ user_id: 42 });
      }
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new RustHttpAdapter({ baseUrl: "http://example.test", refreshTokenStore: store });
    adapter.setAccessToken("expired-access");

    const [a, b] = await Promise.all([adapter.me(), adapter.me()]);

    expect(a.user_id).toBe(42);
    expect(b.user_id).toBe(42);
    expect(store.get()).toBe("new-refresh");
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/v1/auth/refresh"))).toHaveLength(1);
  });
});
