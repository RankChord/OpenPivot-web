import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadTsModule(path) {
  const source = fs.readFileSync(path, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  const sandbox = {
    clearTimeout,
    console,
    exports: module.exports,
    module,
    require: (id) => {
      throw new Error(`Unexpected runtime dependency while loading ${path}: ${id}`);
    },
    setTimeout,
    window: { setTimeout }
  };
  vm.runInNewContext(output, sandbox, { filename: path });
  return module.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const appShellSource = fs.readFileSync("src/app/AppShell.tsx", "utf8");
const appRouterSource = fs.readFileSync("src/app/AppRouter.tsx", "utf8");
const spacesPageSource = fs.readFileSync("src/features/spaces/SpacePages.tsx", "utf8");
assert(!appShellSource.includes("disabled-link"), "Unsupported create-space action must not be rendered as a disabled-looking link");
assert(appShellSource.includes('groupReason ? <button className="new-menu-action" disabled'), "New menu must render unsupported group space creation as a disabled button");
assert(spacesPageSource.includes('groupReason\n    ? <Link className="quiet-button" to="/participants">查找参与者</Link>'), "Spaces page must guide unsupported group creation to participant discovery");
assert(!spacesPageSource.includes("与参与者开始对话"), "Spaces page must not promise direct conversation creation from the global list");
assert(!fs.existsSync("src/adapters/demoAdapter.ts"), "Legacy demo adapter must be removed after the workspace model migration");
assert(appRouterSource.includes("const setApiBaseUrl = useCallback"), "API base URL save must be handled as app state, not a raw setter");
assert(appRouterSource.includes("queryClient.clear();\n    setWorkspaceVersion"), "API base URL changes must clear workspace query cache");
assert(appRouterSource.includes('if (mode === "connected")') && appRouterSource.includes('setSession({ status: "booting" })'), "Connected API base URL changes must re-enter session bootstrap");

const demoMod = loadTsModule("src/domain/demoWorkspaceAdapter.ts");
const connectedMod = loadTsModule("src/domain/connectedWorkspaceAdapter.ts");
const { DemoWorkspaceAdapter, resetDemoWorkspace } = demoMod;
const { ConnectedWorkspaceAdapter } = connectedMod;

resetDemoWorkspace();
const demo = new DemoWorkspaceAdapter();

const flow = await demo.createFlow({ spaceId: "release", title: "release-flow-smoke" });
assert(flow.spaceId === "release", "Demo flow must bind to the selected space");
assert(flow.status === "draft", "Demo flow must be created as a draft");
let missingSpaceFlowRejected = false;
try {
  await demo.createFlowFromMessage("missing-space", "missing-message");
} catch {
  missingSpaceFlowRejected = true;
}
assert(missingSpaceFlowRejected, "Demo flow creation from a message must reject missing spaces");
let missingMessageFlowRejected = false;
try {
  await demo.createFlowFromMessage("release", "missing-message");
} catch {
  missingMessageFlowRejected = true;
}
assert(missingMessageFlowRejected, "Demo flow creation from a message must reject missing trigger messages");
let selfDirectRejected = false;
try {
  await demo.createDirectSpace("me");
} catch {
  selfDirectRejected = true;
}
assert(selfDirectRejected, "Demo workspace must reject direct spaces with the current identity");
let pendingDirectRejected = false;
try {
  await demo.createDirectSpace("mira");
} catch {
  pendingDirectRejected = true;
}
assert(pendingDirectRejected, "Demo workspace must reject direct spaces before a relationship is connected");
let pendingSpaceRejected = false;
try {
  await demo.createSpace({ title: "pending-space", participantIds: ["mira"] });
} catch {
  pendingSpaceRejected = true;
}
assert(pendingSpaceRejected, "Demo workspace must reject group spaces with non-connected participants");

const updated = await demo.inviteParticipantToSpace("release", "forge");
assert(updated.participantIds.includes("forge"), "Inviting a participant must update the space membership");
const releaseMessages = await demo.listMessages("release");
const inviteEvent = releaseMessages.at(-1);
assert(inviteEvent?.kind === "system_event", "Inviting a participant must write a system event to the space timeline");
assert(inviteEvent?.blocks?.[0]?.type === "text", "Invite timeline event must render through message blocks");

const rustState = {
  flows: {
    9: [{ id: 7, space_id: 9, name: "Existing flow", description: "existing trigger", created_by: 1 }]
  },
  members: {
    9: [
      { id: 1, space_id: 9, user_id: 1, role: "owner" },
      { id: 2, space_id: 9, user_id: 2, role: "member" }
    ]
  },
  messages: {
    9: [{ id: 1, space_id: 9, sender_id: 2, content: "hi", created_at: "2026-06-23T00:00:00Z" }]
  },
  nextFlowId: 8,
  nextMemberId: 3,
  nextMessageId: 2,
  nextSpaceId: 10,
  spaces: [{ id: 9, name: "Bob 协作空间", space_type: "group", owner_id: 1 }]
};

const rust = {
  acceptFriendRequest: async () => ({ id: 3, requester_id: 2, addressee_id: 1, status: "accepted", message: "hello" }),
  createFriendRequest: async ({ userId, message }) => ({ id: 3, requester_id: 1, addressee_id: userId, status: "pending", message: message ?? null }),
  createFlow: async (spaceId, input) => {
    const flow = { id: rustState.nextFlowId++, space_id: spaceId, name: input.name, description: input.description ?? null, created_by: 1 };
    rustState.flows[spaceId] = [...(rustState.flows[spaceId] || []), flow];
    return flow;
  },
  createSpace: async ({ name }) => {
    const space = { id: rustState.nextSpaceId++, name, space_type: "group", owner_id: 1 };
    rustState.spaces.push(space);
    rustState.members[space.id] = [{ id: rustState.nextMemberId++, space_id: space.id, user_id: 1, role: "owner" }];
    rustState.messages[space.id] = [];
    rustState.flows[space.id] = [];
    return space;
  },
  addSpaceMember: async (spaceId, userId) => {
    const member = { id: rustState.nextMemberId++, space_id: spaceId, user_id: userId, role: "member" };
    rustState.members[spaceId] = [...(rustState.members[spaceId] || []), member];
    return member;
  },
  createSpaceMessage: async (spaceId, content) => {
    const message = { id: rustState.nextMessageId++, space_id: spaceId, sender_id: 1, content, created_at: "2026-06-23T00:01:00Z" };
    rustState.messages[spaceId] = [...(rustState.messages[spaceId] || []), message];
    return message;
  },
  completeFlowTask: async (taskId) => ({ task_id: taskId, run_id: 31, status: "completed" }),
  listFlows: async (spaceId) => rustState.flows[spaceId] || [],
  listFriendRequests: async () => [{ id: 4, requester_id: 4, addressee_id: 1, status: "pending", message: "please connect" }],
  listFriends: async () => [{ id: 2, username: "bob", nickname: "Bob" }],
  listSpaceMembers: async (spaceId) => rustState.members[spaceId] || [],
  listSpaceMessages: async (spaceId) => rustState.messages[spaceId] || [],
  listSpaces: async () => rustState.spaces,
  rejectFriendRequest: async () => ({ id: 3, requester_id: 2, addressee_id: 1, status: "rejected", message: "hello" }),
  searchUsers: async (query) => query === "carol" || query === "3"
    ? [{ id: 3, username: "carol", nickname: "Carol" }]
    : [{ id: 2, username: "bob", nickname: "Bob" }],
  startFlowRun: async () => ({ run_id: 31, task_id: 32, status: "waiting_action" })
};

const connected = new ConnectedWorkspaceAdapter(rust, 1);
const pendingParticipant = await connected.getParticipant("user-4");
assert(pendingParticipant?.relationship === "pending_inbound", "Connected incoming contact request participant must be addressable before becoming a contact");
const carol = (await connected.searchParticipants("carol"))[0];
assert(carol?.id === "user-3" && carol.relationship === "none", "Connected search must expose non-contact participants as participants");
const loadedCarol = await connected.getParticipant("user-3");
assert(loadedCarol?.displayName === "Carol", "Connected searched participant must remain addressable by route");
let directCarolRejected = false;
try {
  await connected.createDirectSpace("user-3");
} catch {
  directCarolRejected = true;
}
assert(directCarolRejected, "Connected direct spaces require an established relationship");
const outboundCarol = await connected.createContactRequest("user-3", "hello");
assert(outboundCarol.participant.relationship === "pending_outbound", "Connected contact request should cache pending outbound relationship");
assert((await connected.getParticipant("user-3"))?.relationship === "pending_outbound", "Connected pending outbound participant must remain addressable");
const restoredRelationships = new ConnectedWorkspaceAdapter({
  ...rust,
  listFriendRequests: async () => [
    { id: 5, requester_id: 1, addressee_id: 3, status: "pending", message: "outbound" },
    { id: 6, requester_id: 4, addressee_id: 1, status: "pending", message: "inbound" }
  ]
}, 1);
assert((await restoredRelationships.getParticipant("user-3"))?.relationship === "pending_outbound", "Connected outbound requests must restore as pending outbound after reload");
assert((await restoredRelationships.getParticipant("user-4"))?.relationship === "pending_inbound", "Connected inbound requests must restore as pending inbound after reload");
const restoredInbox = await restoredRelationships.listInboxItems();
assert(restoredInbox.some((item) => item.participantId === "user-4"), "Connected inbound requests must appear in the inbox");
assert(!restoredInbox.some((item) => item.participantId === "user-3"), "Connected outbound requests must not appear as inbox actions");
const connectedRelationshipWins = new ConnectedWorkspaceAdapter({
  ...rust,
  listFriendRequests: async () => [{ id: 7, requester_id: 1, addressee_id: 2, status: "pending", message: "stale outbound" }],
  listFriends: async () => [{ id: 2, username: "bob", nickname: "Bob" }]
}, 1);
assert((await connectedRelationshipWins.getParticipant("user-2"))?.relationship === "connected", "Connected relationships must win over stale pending requests");
const spaces = await connected.listSpaces();
assert(spaces[0].id === "space-9", "Connected backend space must map to a stable space URL");
assert(spaces[0].kind === "direct", "Connected two-member backend space must map to a direct collaboration space");
let invalidSpaceMessagesCalled = false;
const invalidSpaceAdapter = new ConnectedWorkspaceAdapter({
  ...rust,
  listSpaceMessages: async () => {
    invalidSpaceMessagesCalled = true;
    return [];
  }
}, 1);
let invalidSpaceRejected = false;
try {
  await invalidSpaceAdapter.listMessages("space-999");
} catch {
  invalidSpaceRejected = true;
}
assert(invalidSpaceRejected, "Connected messages must reject space ids outside the resolved space list");
assert(!invalidSpaceMessagesCalled, "Connected invalid space ids must not hit the backend messages endpoint");
const sent = await connected.sendMessage("space-9", "connected smoke");
assert(sent.spaceId === "space-9", "Connected send must map the backend message into the current space");
assert(sent.blocks[0].text === "connected smoke", "Connected sent text must render through message blocks");
const directSpace = await connected.createDirectSpace("user-2");
assert(directSpace.id.startsWith("space-"), "Connected direct collaboration must create a real backend space");
assert(directSpace.participantIds.includes("user-2"), "Connected direct collaboration must add the selected participant as a space member");
const connectedFlow = await connected.createFlow({ spaceId: "space-9", title: "需求确认流程" });
assert(connectedFlow.spaceId === "space-9", "Connected flow creation must bind to the real backend space");
const listedFlows = await connected.listFlows("space-9");
assert(listedFlows.some((candidate) => candidate.id === connectedFlow.id), "Connected flow list must include newly created backend flows");
const run = await connected.startFlowRun({ spaceId: "space-9", flowId: connectedFlow.id, assigneeId: "user-2", taskTitle: "确认需求" });
assert(run.taskId === "32" && run.status === "waiting_action", "Connected flow run must expose backend task id and status");
const completed = await connected.completeFlowTask(run.taskId, "done");
assert(completed.status === "completed", "Connected flow task completion must call the backend task endpoint");

console.log(JSON.stringify({
  connectedSpace: spaces[0].id,
  connectedFlow: connectedFlow.id,
  demoFlow: flow.id,
  invitedSpace: updated.id,
  ok: true,
  sentMessage: sent.id
}, null, 2));
