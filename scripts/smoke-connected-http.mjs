import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const moduleCache = new Map();

function loadTsModule(filePath) {
  const absolutePath = path.resolve(filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;

  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);

  const sandbox = {
    Headers,
    Response,
    URL,
    clearTimeout,
    console,
    exports: module.exports,
    fetch,
    module,
    require: (id) => {
      if (id.startsWith(".")) {
        const resolved = path.resolve(path.dirname(absolutePath), id);
        return loadTsModule(fs.existsSync(`${resolved}.ts`) ? `${resolved}.ts` : resolved);
      }
      return nodeRequire(id);
    },
    setTimeout
  };
  vm.runInNewContext(output, sandbox, { filename: absolutePath });
  return module.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      resolve(body ? JSON.parse(body) : {});
    });
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function text(res, status, payload) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(payload);
}

const state = {
  accessToken: "access-initial",
  conversationCreated: false,
  flows: {},
  friends: [],
  invalidMessageFetches: 0,
  incomingRequests: [
    { id: 10, requester_id: 2, addressee_id: 1, status: "pending", message: "我想加入协作。" }
  ],
  messages: [],
  nextFlowId: 31,
  nextMemberId: 1,
  nextMessageId: 1,
  nextSpaceId: 21,
  outgoingRequests: [],
  refreshToken: "refresh-initial",
  spaceMembers: {},
  spaceMessages: {},
  spaces: [],
  users: [
    { id: 1, username: "ling", nickname: "Ling" },
    { id: 2, username: "bob", nickname: "Bob" },
    { id: 3, username: "carol", nickname: "Carol" }
  ]
};

function authorized(req) {
  return req.headers.authorization === `Bearer ${state.accessToken}`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathName = url.pathname;
    const method = req.method || "GET";

    if (pathName === "/v1/system/health" && method === "GET") return text(res, 200, "ok");
    if (pathName === "/v1/auth/login" && method === "POST") {
      await readBody(req);
      state.accessToken = "access-login";
      state.refreshToken = "refresh-login";
      return json(res, 200, { access_token: state.accessToken, refresh_token: state.refreshToken, expires_in: 900 });
    }
    if (pathName === "/v1/auth/refresh" && method === "POST") {
      const body = await readBody(req);
      if (body.refresh_token !== state.refreshToken) return json(res, 401, { code: "unauthorized", message: "Invalid refresh token" });
      state.accessToken = "access-refresh";
      state.refreshToken = "refresh-refresh";
      return json(res, 200, { access_token: state.accessToken, refresh_token: state.refreshToken, expires_in: 900 });
    }
    if (pathName === "/v1/auth/logout" && method === "POST") {
      await readBody(req);
      res.writeHead(204);
      return res.end();
    }

    if (!authorized(req)) return json(res, 401, { code: "unauthorized", message: "Unauthorized" });

    if (pathName === "/v1/auth/me" && method === "GET") return json(res, 200, { user_id: 1 });
    if (pathName === "/v1/users/search" && method === "GET") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      return json(res, 200, state.users.filter((user) => user.id !== 1 && `${user.id} ${user.username} ${user.nickname}`.toLowerCase().includes(q)));
    }
    if (pathName === "/v1/friends" && method === "GET") return json(res, 200, state.friends);
    if (pathName === "/v1/friends/requests" && method === "GET") {
      return json(res, 200, [
        ...state.incomingRequests,
        ...state.outgoingRequests
      ].filter((request) => request.status === "pending"));
    }
    if (pathName === "/v1/friends/requests" && method === "POST") {
      const body = await readBody(req);
      const request = { id: 11 + state.outgoingRequests.length, requester_id: 1, addressee_id: body.user_id, status: "pending", message: body.message ?? null };
      state.outgoingRequests.push(request);
      return json(res, 200, request);
    }
    if (pathName === "/v1/friends/requests/10/accept" && method === "POST") {
      const request = state.incomingRequests[0];
      request.status = "accepted";
      state.friends = [state.users[1]];
      return json(res, 200, request);
    }
    if ((pathName === "/v1/spaces" || pathName === "/v1/spaces/") && method === "GET") {
      return json(res, 200, state.spaces);
    }
    if ((pathName === "/v1/spaces" || pathName === "/v1/spaces/") && method === "POST") {
      const body = await readBody(req);
      const space = { id: state.nextSpaceId++, name: body.name, space_type: "group", owner_id: 1 };
      state.spaces.push(space);
      state.spaceMembers[space.id] = [{ id: state.nextMemberId++, space_id: space.id, user_id: 1, role: "owner" }];
      state.spaceMessages[space.id] = [];
      state.flows[space.id] = [];
      return json(res, 200, space);
    }
    const membersMatch = pathName.match(/^\/v1\/spaces\/(\d+)\/members$/);
    if (membersMatch && method === "GET") {
      const spaceId = Number(membersMatch[1]);
      return json(res, 200, state.spaceMembers[spaceId] || []);
    }
    if (membersMatch && method === "POST") {
      const spaceId = Number(membersMatch[1]);
      const body = await readBody(req);
      const member = { id: state.nextMemberId++, space_id: spaceId, user_id: body.user_id, role: "member" };
      state.spaceMembers[spaceId] = [...(state.spaceMembers[spaceId] || []), member];
      return json(res, 200, member);
    }
    const spaceMessagesMatch = pathName.match(/^\/v1\/spaces\/(\d+)\/messages$/);
    if (spaceMessagesMatch && Number(spaceMessagesMatch[1]) === 999) {
      state.invalidMessageFetches += 1;
      return json(res, 500, { code: "invalid_space_leak", message: "Invalid space was requested" });
    }
    if (spaceMessagesMatch && method === "GET") {
      const spaceId = Number(spaceMessagesMatch[1]);
      return json(res, 200, state.spaceMessages[spaceId] || []);
    }
    if (spaceMessagesMatch && method === "POST") {
      const spaceId = Number(spaceMessagesMatch[1]);
      const body = await readBody(req);
      const message = { id: state.nextMessageId++, space_id: spaceId, sender_id: 1, content: body.content, created_at: "2026-06-24T00:01:00Z" };
      state.spaceMessages[spaceId] = [...(state.spaceMessages[spaceId] || []), message];
      return json(res, 200, message);
    }
    const flowsMatch = pathName.match(/^\/v1\/spaces\/(\d+)\/flows$/);
    if (flowsMatch && method === "GET") {
      const spaceId = Number(flowsMatch[1]);
      return json(res, 200, state.flows[spaceId] || []);
    }
    if (flowsMatch && method === "POST") {
      const spaceId = Number(flowsMatch[1]);
      const body = await readBody(req);
      const flow = { id: state.nextFlowId++, space_id: spaceId, name: body.name, description: body.description ?? null, created_by: 1 };
      state.flows[spaceId] = [...(state.flows[spaceId] || []), flow];
      return json(res, 200, flow);
    }
    const flowRunMatch = pathName.match(/^\/v1\/spaces\/(\d+)\/flows\/(\d+)\/runs$/);
    if (flowRunMatch && method === "POST") {
      await readBody(req);
      return json(res, 200, { run_id: 41, task_id: 51, status: "waiting_action" });
    }
    const completeTaskMatch = pathName.match(/^\/v1\/flow-tasks\/(\d+)\/complete$/);
    if (completeTaskMatch && method === "POST") {
      await readBody(req);
      const spaceId = state.spaces[0]?.id;
      if (spaceId) {
        state.spaceMessages[spaceId] = [
          ...(state.spaceMessages[spaceId] || []),
          { id: state.nextMessageId++, space_id: spaceId, sender_id: 1, content: "流程任务已完成：确认需求", created_at: "2026-06-24T00:02:00Z" }
        ];
      }
      return json(res, 200, { task_id: Number(completeTaskMatch[1]), run_id: 41, status: "completed" });
    }
    if (pathName === "/v1/conversations/direct" && method === "POST") {
      const body = await readBody(req);
      if (!state.friends.some((friend) => friend.id === body.user_id)) {
        return json(res, 403, { code: "forbidden", message: "Only friends can create direct conversations" });
      }
      state.conversationCreated = true;
      return json(res, 200, { id: 21, conversation_type: "direct", user_low_id: 1, user_high_id: body.user_id });
    }
    if (pathName === "/v1/conversations" && method === "GET") {
      return json(res, 200, state.conversationCreated ? [{ id: 21, conversation_type: "direct", user_low_id: 1, user_high_id: 2 }] : []);
    }
    if (pathName === "/v1/conversations/999/messages") {
      state.invalidMessageFetches += 1;
      return json(res, 500, { code: "invalid_space_leak", message: "Invalid conversation was requested" });
    }
    if (pathName === "/v1/conversations/21/messages" && method === "GET") return json(res, 200, state.messages);
    if (pathName === "/v1/conversations/21/messages" && method === "POST") {
      const body = await readBody(req);
      const message = { id: state.messages.length + 1, conversation_id: 21, sender_id: 1, content: body.content, created_at: "2026-06-23T00:01:00Z" };
      state.messages.push(message);
      return json(res, 200, message);
    }

    return json(res, 404, { code: "not_found", message: `${method} ${pathName}` });
  } catch (error) {
    return json(res, 500, { code: "server_error", message: error instanceof Error ? error.message : "Unknown error" });
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();

try {
  const { RustHttpAdapter } = loadTsModule("src/adapters/rustHttpAdapter.ts");
  const { MemoryRefreshTokenStore } = loadTsModule("src/adapters/tokenStore.ts");
  const { ConnectedWorkspaceAdapter } = loadTsModule("src/domain/connectedWorkspaceAdapter.ts");
  const { restoreConnectedSession } = loadTsModule("src/app/sessionBootstrap.ts");

  const store = new MemoryRefreshTokenStore();
  const adapter = new RustHttpAdapter({ baseUrl: `http://127.0.0.1:${address.port}`, refreshTokenStore: store });

  assert(await adapter.health() === "ok", "health endpoint should be reachable");
  const tokens = await adapter.login({ username: "ling", password: "password123" });
  assert(tokens.refreshToken === "refresh-login", "login should store refresh token");

  const restoredAdapter = new RustHttpAdapter({ baseUrl: `http://127.0.0.1:${address.port}`, refreshTokenStore: store });
  const restored = await restoreConnectedSession(restoredAdapter, store);
  assert(restored.session.status === "authenticated", "refresh token should restore an authenticated session");
  assert(restored.session.sourceUserId === 1, "restored session should load current user");

  const workspace = new ConnectedWorkspaceAdapter(restoredAdapter, restored.session.sourceUserId);
  const search = await workspace.searchParticipants("bob");
  assert(search[0].id === "user-2", "participant search should map users into participants");
  const stranger = (await workspace.searchParticipants("carol"))[0];
  assert(stranger?.relationship === "none", "search should expose non-contact participants without implying a relationship");
  assert((await workspace.getParticipant("user-3"))?.displayName === "Carol", "searched non-contact participant should be route-addressable");
  const outboundCarol = await workspace.createContactRequest("user-3", "hello");
  assert(outboundCarol.participant.relationship === "pending_outbound", "outbound request should cache pending participant state");
  assert((await workspace.getParticipant("user-3"))?.relationship === "pending_outbound", "pending outbound participant should remain route-addressable");
  assert(!(await workspace.listInboxItems()).some((item) => item.participantId === "user-3"), "pending outbound requests should not appear as inbox actions");

  const outbound = await workspace.createContactRequest("user-2", "希望建立联系。");
  assert(outbound.participant.id === "user-2", "outbound contact request should point at the target participant");
  assert(outbound.participant.relationship === "pending_outbound", "outbound contact request should expose pending state");

  const inbox = await workspace.listInboxItems();
  assert(inbox[0].requestId === "10", "incoming contact request should appear in inbox");
  const inboxParticipant = await workspace.getParticipant(inbox[0].participantId);
  assert(inboxParticipant?.relationship === "pending_inbound", "incoming contact request participant should be addressable from inbox context");
  let preAcceptDirectRejected = false;
  try {
    await workspace.createDirectSpace("user-2");
  } catch {
    preAcceptDirectRejected = true;
  }
  assert(preAcceptDirectRejected, "direct spaces should require an accepted relationship");
  await workspace.acceptContactRequest(inbox[0].requestId);

  const space = await workspace.createDirectSpace("user-2");
  assert(space.id === "space-21", "direct collaboration should create a stable backend space");
  const sent = await workspace.sendMessage(space.id, "Connected HTTP smoke");
  assert(sent.blocks[0].text === "Connected HTTP smoke", "sent connected message should use content blocks");
  const messages = await workspace.listMessages(space.id);
  assert(messages.at(-1)?.id === sent.id, "sent connected message should be readable from the selected space");
  let invalidSpaceRejected = false;
  try {
    await workspace.listMessages("space-999");
  } catch {
    invalidSpaceRejected = true;
  }
  assert(invalidSpaceRejected, "connected workspace should reject invalid space route ids");
  assert(state.invalidMessageFetches === 0, "invalid space route ids should not reach the backend messages endpoint");
  const flow = await workspace.createFlow({ spaceId: space.id, title: "需求确认流程" });
  assert(flow.spaceId === space.id, "connected flow should bind to the selected backend space");
  const run = await workspace.startFlowRun({ spaceId: space.id, flowId: flow.id, assigneeId: "user-2", taskTitle: "确认需求" });
  assert(run.taskId === "51", "connected flow run should expose backend task id");
  const completed = await workspace.completeFlowTask(run.taskId, "done");
  assert(completed.status === "completed", "connected flow task completion should use the backend task endpoint");
  const afterFlowMessages = await workspace.listMessages(space.id);
  assert(afterFlowMessages.some((message) => message.kind === "flow_event"), "completed backend flow task should appear as a space flow event");

  await restoredAdapter.logout();
  assert(store.get() === null, "logout should clear refresh token");

  console.log(JSON.stringify({
    flow: flow.id,
    inboxRequest: inbox[0].requestId,
    ok: true,
    sentMessage: sent.id,
    space: space.id
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
