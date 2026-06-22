import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoCapabilities, rustCapabilities, unavailableReason } from "./capabilities";
import { ConnectedWorkspaceAdapter } from "./connectedWorkspaceAdapter";
import { DemoWorkspaceAdapter, resetDemoWorkspace } from "./demoWorkspaceAdapter";
import type { RustHttpAdapter } from "../adapters/rustHttpAdapter";
import type { Conversation, Message, UserSummary } from "../types";

function connectedStub() {
  const conversations: Conversation[] = [
    { id: 7, conversation_type: "direct", user_low_id: 1, user_high_id: 2 }
  ];
  const friends: UserSummary[] = [
    { id: 2, username: "bob", nickname: "Bob" }
  ];
  const messages: Message[] = [
    { id: 11, conversation_id: 7, sender_id: 2, content: "hello", created_at: "2026-06-22T10:00:00Z" }
  ];
  return {
    listConversations: vi.fn(async () => conversations),
    listFriends: vi.fn(async () => friends),
    listMessages: vi.fn(async () => messages),
    sendMessage: vi.fn(async (conversationId: number, content: string) => ({
      id: 12,
      conversation_id: conversationId,
      sender_id: 1,
      content,
      created_at: "2026-06-22T10:01:00Z"
    })),
    searchUsers: vi.fn(async () => friends),
    listFriendRequests: vi.fn(async () => []),
    createFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    rejectFriendRequest: vi.fn(),
    createDirectConversation: vi.fn(async () => conversations[0])
  } as unknown as RustHttpAdapter;
}

describe("workspace domain model", () => {
  beforeEach(() => resetDemoWorkspace());

  it("maps a backend direct conversation into a collaboration space", async () => {
    const adapter = new ConnectedWorkspaceAdapter(connectedStub(), 1);
    const spaces = await adapter.listSpaces();

    expect(spaces[0]).toMatchObject({
      id: "conversation-7",
      sourceConversationId: 7,
      kind: "direct",
      title: "与Bob的对话",
      participantIds: ["user-1", "user-2"]
    });
  });

  it("uses the same message model regardless of sender kind", async () => {
    const adapter = new DemoWorkspaceAdapter();
    const messages = await adapter.listMessages("core");

    expect(messages.every((message) => Array.isArray(message.blocks))).toBe(true);
    expect(messages.some((message) => message.senderId === "lin")).toBe(true);
    expect(messages.some((message) => message.senderId === "orion")).toBe(true);
    expect(messages.every((message) => !("type" in message && ["human", "agent"].includes(String(message.type))))).toBe(true);
  });

  it("allows flow request steps to target any participant kind through participantId", async () => {
    const adapter = new DemoWorkspaceAdapter();
    const [flow] = await adapter.listFlows("core");
    const participants = await adapter.listParticipants();
    const humanStep = flow.steps.find((step) => step.participantId === "lin");
    const agentStep = flow.steps.find((step) => step.participantId === "orion");

    expect(humanStep?.kind).toBe("request_participant");
    expect(agentStep?.kind).toBe("request_participant");
    expect(participants.find((participant) => participant.id === humanStep?.participantId)?.kind).toBe("human");
    expect(participants.find((participant) => participant.id === agentStep?.participantId)?.kind).toBe("agent");
  });

  it("keeps demo spaces separate from connected backend spaces", async () => {
    const demo = new DemoWorkspaceAdapter();
    const connected = new ConnectedWorkspaceAdapter(connectedStub(), 1);

    expect((await demo.listSpaces()).some((space) => space.id === "core")).toBe(true);
    expect((await connected.listSpaces()).some((space) => space.id === "core")).toBe(false);
  });

  it("gates unsupported connected capabilities with clear reasons", () => {
    expect(demoCapabilities.collaborationFlows).toBe(true);
    expect(rustCapabilities.collaborationFlows).toBe(false);
    expect(unavailableReason("collaborationFlows", rustCapabilities)).toContain("真实后端");
  });

  it("does not drop demo messages after sending", async () => {
    const adapter = new DemoWorkspaceAdapter();
    const before = await adapter.listMessages("lin");
    const sent = await adapter.sendMessage("lin", "这条消息应该进入时间线");
    const after = await adapter.listMessages("lin");

    expect(sent.deliveryState).toBe("sent");
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)?.blocks[0]).toMatchObject({ type: "text", text: "这条消息应该进入时间线" });
  });

  it("accepts and rejects contact requests with explicit state changes", async () => {
    const adapter = new DemoWorkspaceAdapter();
    const [request] = await adapter.listContactRequests();
    const accepted = await adapter.acceptContactRequest(request.id);
    const outbound = await adapter.createContactRequest("mira", "重新建立联系");
    const rejected = await adapter.rejectContactRequest(outbound.id);

    expect(accepted.status).toBe("accepted");
    expect(rejected.status).toBe("rejected");
  });

  it("keeps inbox approval actions synchronized with the owning flow", async () => {
    const adapter = new DemoWorkspaceAdapter();
    const approval = (await adapter.listInboxItems()).find((item) => item.kind === "approval");

    expect(approval).toBeDefined();
    await adapter.completeInboxItem(approval!.id, "approve");

    const flow = await adapter.getFlow("core", "dev-flow");
    const messages = await adapter.listMessages("core");

    expect(flow?.status).toBe("completed");
    expect(flow?.waitingStepId).toBeUndefined();
    expect(flow?.steps.find((step) => step.id === approval!.stepId)?.status).toBe("completed");
    expect(messages.at(-1)?.blocks[0]).toMatchObject({ type: "text", text: "人工审批已通过，流程已写回协作空间。" });
  });

  it("pauses the owning flow when an inbox approval is rejected", async () => {
    const adapter = new DemoWorkspaceAdapter();
    const approval = (await adapter.listInboxItems()).find((item) => item.kind === "approval");

    expect(approval).toBeDefined();
    await adapter.completeInboxItem(approval!.id, "reject");

    const flow = await adapter.getFlow("core", "dev-flow");
    expect(flow?.status).toBe("paused");
    expect(flow?.waitingStepId).toBeUndefined();
    expect(flow?.steps.find((step) => step.id === approval!.stepId)?.status).toBe("failed");
  });
});
