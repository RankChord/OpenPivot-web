import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoCapabilities, rustCapabilities, unavailableReason } from "./capabilities";
import { ConnectedWorkspaceAdapter } from "./connectedWorkspaceAdapter";
import { DemoWorkspaceAdapter, resetDemoWorkspace } from "./demoWorkspaceAdapter";
import type { RustHttpAdapter } from "../adapters/rustHttpAdapter";
import type { FlowResponse, SpaceMemberResponse, SpaceProtocolMessage, SpaceResponse, UserSummary } from "../types";

function connectedStub() {
  const spaces: SpaceResponse[] = [
    { id: 7, name: "Bob 协作空间", space_type: "group", owner_id: 1 }
  ];
  const members: SpaceMemberResponse[] = [
    { id: 1, space_id: 7, user_id: 1, role: "owner" },
    { id: 2, space_id: 7, user_id: 2, role: "member" }
  ];
  const friends: UserSummary[] = [
    { id: 2, username: "bob", nickname: "Bob" }
  ];
  const messages: SpaceProtocolMessage[] = [
    { id: 11, space_id: 7, sender_id: 2, content: "hello", created_at: "2026-06-22T10:00:00Z" }
  ];
  const flows: FlowResponse[] = [];
  return {
    listFriends: vi.fn(async () => friends),
    listSpaces: vi.fn(async () => spaces),
    listSpaceMembers: vi.fn(async () => members),
    listSpaceMessages: vi.fn(async () => messages),
    createSpaceMessage: vi.fn(async (spaceId: number, content: string) => ({
      id: 12,
      space_id: spaceId,
      sender_id: 1,
      content,
      created_at: "2026-06-22T10:01:00Z"
    })),
    listFlows: vi.fn(async () => flows),
    createFlow: vi.fn(async (spaceId: number, input: { name: string; description?: string | null }) => ({
      id: 31,
      space_id: spaceId,
      name: input.name,
      description: input.description ?? null,
      created_by: 1
    })),
    searchUsers: vi.fn(async () => friends),
    listFriendRequests: vi.fn(async () => []),
    createFriendRequest: vi.fn(),
    acceptFriendRequest: vi.fn(),
    rejectFriendRequest: vi.fn(),
    createSpace: vi.fn(async ({ name }: { name: string }) => ({ id: 8, name, space_type: "group", owner_id: 1 })),
    addSpaceMember: vi.fn(async (spaceId: number, userId: number) => ({ id: 3, space_id: spaceId, user_id: userId, role: "member" }))
  } as unknown as RustHttpAdapter;
}

describe("workspace domain model", () => {
  beforeEach(() => resetDemoWorkspace());

  it("maps a backend collaboration space into the workspace model", async () => {
    const adapter = new ConnectedWorkspaceAdapter(connectedStub(), 1);
    const spaces = await adapter.listSpaces();

    expect(spaces[0]).toMatchObject({
      id: "space-7",
      sourceSpaceId: 7,
      kind: "direct",
      title: "Bob 协作空间",
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

  it("enables backend-supported collaboration capabilities without enabling fake approvals", () => {
    expect(demoCapabilities.collaborationFlows).toBe(true);
    expect(rustCapabilities.groupSpaces).toBe(true);
    expect(rustCapabilities.collaborationFlows).toBe(true);
    expect(rustCapabilities.flowRuns).toBe(true);
    expect(rustCapabilities.spaceInvites).toBe(true);
    expect(rustCapabilities.approvals).toBe(false);
    expect(unavailableReason("approvals", rustCapabilities)).toBeTruthy();
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

  it("creates a global flow only after selecting its owning space", async () => {
    const adapter = new DemoWorkspaceAdapter();

    const flow = await adapter.createFlow({ spaceId: "release", title: "发布确认流程" });
    const releaseFlows = await adapter.listFlows("release");
    const releaseMessages = await adapter.listMessages("release");

    expect(flow).toMatchObject({
      spaceId: "release",
      title: "发布确认流程",
      status: "draft"
    });
    expect(releaseFlows.some((item) => item.id === flow.id)).toBe(true);
    expect(releaseMessages.at(-1)?.blocks[0]).toMatchObject({ type: "text", text: "新的协作流程草稿已绑定到此空间。" });
  });

  it("invites a connected participant into an existing collaboration space", async () => {
    const adapter = new DemoWorkspaceAdapter();

    const updated = await adapter.inviteParticipantToSpace("release", "forge");
    const messages = await adapter.listMessages("release");

    expect(updated.participantIds).toContain("forge");
    expect(updated.kind).toBe("multi");
    expect(updated.lastPreview).toBe("砺锋后端 已加入协作空间。");
    expect(messages.at(-1)?.blocks[0]).toMatchObject({ type: "text", text: "砺锋后端 已加入协作空间。" });
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
