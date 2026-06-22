import type { RefreshTokenStore } from "../types";

const KEY = "openpivot.web.refreshToken";

export class LocalRefreshTokenStore implements RefreshTokenStore {
  get(): string | null {
    return window.localStorage.getItem(KEY);
  }

  set(token: string): void {
    window.localStorage.setItem(KEY, token);
  }

  clear(): void {
    window.localStorage.removeItem(KEY);
  }
}

export class MemoryRefreshTokenStore implements RefreshTokenStore {
  private value: string | null = null;

  get(): string | null {
    return this.value;
  }

  set(token: string): void {
    this.value = token;
  }

  clear(): void {
    this.value = null;
  }
}
