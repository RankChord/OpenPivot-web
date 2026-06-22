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
const spacesPageSource = fs.readFileSync("src/features/spaces/SpacePages.tsx", "utf8");
assert(!appShellSource.includes("disabled-link"), "Unsupported create-space action must not be rendered as a disabled-looking link");
assert(appShellSource.includes('groupReason ? <button className="new-menu-action" disabled'), "New menu must render unsupported group space creation as a disabled button");
assert(spacesPageSource.includes('groupReason\n    ? <Link className="quiet-button" to="/participants">查找参与者</Link>'), "Spaces page must guide unsupported group creation to participant discovery");
assert(!spacesPageSource.includes("与参与者开始对话"), "Spaces page must not promise direct conversation creation from the global list");
assert(!fs.readFileSync("src/adapters/demoAdapter.ts", "utf8").includes("好友申请"), "Legacy demo adapter must use contact request language");

const demoMod = loadTsModule("src/domain/demoWorkspaceAdapter.ts");
const connectedMod = loadTsModule("src/domain/connectedWorkspaceAdapter.ts");
const { DemoWorkspaceAdapter, resetDemoWorkspace } = demoMod;
const { ConnectedWorkspaceAdapter } = connectedMod;

resetDemoWorkspace();
const demo = new DemoWorkspaceAdapter();

const flow = await demo.createFlow({ spaceId: "release", title: "release-flow-smoke" });
assert(flow.spaceId === "release", "Demo flow must bind to the selected space");
assert(flow.status === "draft", "Demo flow must be created as a draft");
let selfDirectRejected = false;
try {
  await demo.createDirectSpace("me");
} catch {
  selfDirectRejected = true;
}
assert(selfDirectRejected, "Demo workspace must reject direct spaces with the current identity");

const updated = await demo.inviteParticipantToSpace("release", "forge");
assert(updated.participantIds.includes("forge"), "Inviting a participant must update the space membership");
const releaseMessages = await demo.listMessages("release");
const inviteEvent = releaseMessages.at(-1);
assert(inviteEvent?.kind === "system_event", "Inviting a participant must write a system event to the space timeline");
assert(inviteEvent?.blocks?.[0]?.type === "text", "Invite timeline event must render through message blocks");

const rust = {
  acceptFriendRequest: async () => ({ id: 3, requester_id: 2, addressee_id: 1, status: "accepted", message: "hello" }),
  createDirectConversation: async () => ({ id: 9, conversation_type: "direct", user_low_id: 1, user_high_id: 2 }),
  createFriendRequest: async () => ({ id: 3, requester_id: 1, addressee_id: 2, status: "pending", message: "hello" }),
  listConversations: async () => [{ id: 9, conversation_type: "direct", user_low_id: 1, user_high_id: 2 }],
  listFriendRequests: async () => [],
  listFriends: async () => [{ id: 2, username: "bob", nickname: "Bob" }],
  listMessages: async (conversationId) => [{ id: 1, conversation_id: conversationId, sender_id: 2, content: "hi", created_at: "2026-06-23T00:00:00Z" }],
  rejectFriendRequest: async () => ({ id: 3, requester_id: 2, addressee_id: 1, status: "rejected", message: "hello" }),
  searchUsers: async () => [{ id: 2, username: "bob", nickname: "Bob" }],
  sendMessage: async (conversationId, content) => ({ id: 2, conversation_id: conversationId, sender_id: 1, content, created_at: "2026-06-23T00:01:00Z" })
};

const connected = new ConnectedWorkspaceAdapter(rust, 1);
const spaces = await connected.listSpaces();
assert(spaces[0].id === "conversation-9", "Connected direct conversation must map to a stable space URL");
assert(spaces[0].kind === "direct", "Connected direct conversation must map to a direct collaboration space");
const sent = await connected.sendMessage("conversation-9", "connected smoke");
assert(sent.spaceId === "conversation-9", "Connected send must map the backend message into the current space");
assert(sent.blocks[0].text === "connected smoke", "Connected sent text must render through message blocks");

console.log(JSON.stringify({
  connectedSpace: spaces[0].id,
  demoFlow: flow.id,
  invitedSpace: updated.id,
  ok: true,
  sentMessage: sent.id
}, null, 2));
