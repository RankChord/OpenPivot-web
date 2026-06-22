import { describe, expect, it } from "vitest";
import { DemoAdapter } from "./demoAdapter";

describe("DemoAdapter", () => {
  it("returns concept actors through user search without using backend data", async () => {
    const adapter = new DemoAdapter();
    const results = await adapter.searchUsers("Atlas");

    expect(results[0]).toMatchObject({
      username: "atlas",
      nickname: "星图前端"
    });
  });
});
