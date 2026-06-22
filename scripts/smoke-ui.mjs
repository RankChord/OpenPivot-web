import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const moduleCache = new Map();

function loadTsModule(filePath) {
  const absolutePath = path.resolve(filePath);
  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports;
  if (absolutePath.endsWith(path.normalize("src/config.ts"))) {
    const module = {
      exports: {
        APP_COPY: {
          connectedOnlyNotice: "真实后端模式只展示当前 Rust 后端已经实现的能力。",
          demoLabel: "概念预览 · 演示数据",
          previewOnly: "仅作预览 · 执行引擎未接入"
        },
        defaultApiBaseUrl: () => ""
      }
    };
    moduleCache.set(absolutePath, module);
    return module.exports;
  }

  const source = fs.readFileSync(absolutePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(absolutePath, module);

  const sandbox = {
    clearTimeout,
    console,
    document: globalThis.document,
    exports: module.exports,
    localStorage: globalThis.localStorage,
    module,
    require: (id) => {
      if (id.startsWith(".")) {
        const resolved = path.resolve(path.dirname(absolutePath), id);
        for (const candidate of [`${resolved}.tsx`, `${resolved}.ts`, `${resolved}.js`, path.join(resolved, "index.tsx"), path.join(resolved, "index.ts")]) {
          if (fs.existsSync(candidate)) return loadTsModule(candidate);
        }
      }
      return nodeRequire(id);
    },
    setTimeout,
    window: globalThis.window || { setTimeout }
  };
  vm.runInNewContext(output, sandbox, { filename: absolutePath });
  return module.exports;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
  url: "http://127.0.0.1/"
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator
});
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement;
globalThis.Node = dom.window.Node;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.localStorage = dom.window.localStorage;
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
  this.setAttribute("data-scrolled-into-view", "true");
};

const React = nodeRequire("react");
const { QueryClient, QueryClientProvider } = nodeRequire("@tanstack/react-query");
const { MemoryRouter, Route, Routes } = nodeRequire("react-router-dom");
const { cleanup, fireEvent, render, screen, waitFor } = nodeRequire("@testing-library/react");

const { CommandPanel, NewMenu } = loadTsModule("src/app/AppShell.tsx");
const { default: AppRouter } = loadTsModule("src/app/AppRouter.tsx");
const { FlowsOverviewPage } = loadTsModule("src/features/flows/FlowPages.tsx");
const { SettingsPage } = loadTsModule("src/features/settings/SettingsPage.tsx");
const { CreateSpacePage, SpacesPage, SpaceFlowsPage } = loadTsModule("src/features/spaces/SpacePages.tsx");
const { demoCapabilities, rustCapabilities } = loadTsModule("src/domain/capabilities.ts");
const { DemoWorkspaceAdapter, resetDemoWorkspace } = loadTsModule("src/domain/demoWorkspaceAdapter.ts");

function createApp({ capabilities, mode, workspace }) {
  return {
    apiBaseUrl: "/v1",
    environment: { capabilities, currentUserId: "me", mode },
    logout: async () => undefined,
    mode,
    refreshWorkspace: () => undefined,
    requestMode: () => undefined,
    rustAdapter: {},
    session: { status: "authenticated", userId: "me" },
    setApiBaseUrl: () => undefined,
    setConnectedTokens: async () => undefined,
    setSession: () => undefined,
    setTheme: () => undefined,
    theme: "light",
    workspace,
    workspaceVersion: 0
  };
}

function renderWithProviders(element, options = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  const result = render(
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(MemoryRouter, { future: { v7_relativeSplatPath: true, v7_startTransition: true }, initialEntries: options.initialEntries }, element)
    )
  );
  return {
    ...result,
    dispose: () => {
      cleanup();
      queryClient.clear();
    }
  };
}

const connectedWorkspace = {
  listFlows: async () => [],
  listSpaces: async () => [],
  searchParticipants: async () => []
};

let view = renderWithProviders(
  React.createElement(NewMenu, {
    app: createApp({ capabilities: rustCapabilities, mode: "connected", workspace: connectedWorkspace }),
    onClose: () => undefined
  })
);
const disabledCreateSpace = screen.getByRole("button", { name: "新建协作空间" });
assert(disabledCreateSpace.disabled, "Connected new menu must disable unsupported group space creation");
assert(!document.querySelector('a[href="/spaces/new"]'), "Connected new menu must not expose /spaces/new as a clickable link");
assert(!document.body.textContent?.includes("与参与者开始对话"), "New menu must not promise a direct conversation action");
assert(document.body.textContent?.includes("查找参与者"), "New menu should route users to participant discovery");
view.dispose();

view = renderWithProviders(
  React.createElement(NewMenu, {
    app: createApp({ capabilities: demoCapabilities, mode: "demo", workspace: connectedWorkspace }),
    onClose: () => undefined
  })
);
assert(!document.querySelector('a[href="/flows/new"]'), "Demo new menu must not expose global flow creation");
assert(document.querySelector('a[href="/spaces"]')?.textContent?.includes("从空间创建协作流程"), "Demo new menu must route flow creation through spaces");
view.dispose();

view = renderWithProviders(
  React.createElement(CommandPanel, {
    app: createApp({ capabilities: rustCapabilities, mode: "connected", workspace: connectedWorkspace }),
    onClose: () => undefined
  })
);
const commandInput = document.querySelector(".command-input input");
assert(commandInput?.getAttribute("placeholder") === "搜索协作空间、参与者、协作流程或设置", "Command search placeholder must only advertise supported domains");
view.dispose();

let savedApiBaseUrl = "";
view = renderWithProviders(
  React.createElement(SettingsPage, {
    app: {
      ...createApp({ capabilities: rustCapabilities, mode: "connected", workspace: connectedWorkspace }),
      apiBaseUrl: "http://old.example/v1",
      setApiBaseUrl: (url) => {
        savedApiBaseUrl = url;
      }
    }
  })
);
assert(screen.getByRole("button", { name: "已保存" }).disabled, "Settings API save must be disabled when the address is unchanged");
fireEvent.change(screen.getByDisplayValue("http://old.example/v1"), { target: { value: "  http://new.example/v1///  " } });
const saveApiButton = screen.getByRole("button", { name: "保存" });
assert(!saveApiButton.disabled, "Settings API save must enable only after the address changes");
fireEvent.click(saveApiButton);
assert(savedApiBaseUrl === "http://new.example/v1", "Settings API save must pass a normalized backend address");
view.dispose();

view = renderWithProviders(
  React.createElement(SettingsPage, {
    app: createApp({ capabilities: demoCapabilities, mode: "demo", workspace: connectedWorkspace })
  })
);
const demoLogoutButton = screen.getByRole("button", { name: "无需退出" });
assert(demoLogoutButton.disabled, "Demo mode must not expose a fake logout action");
view.dispose();

view = renderWithProviders(
  React.createElement(SpacesPage, {
    app: createApp({ capabilities: rustCapabilities, mode: "connected", workspace: connectedWorkspace })
  })
);
await screen.findByText("查找参与者");
assert(document.querySelector('a[href="/participants"]'), "Connected empty spaces state must guide users to participants");
assert(!document.querySelector('a[href="/spaces/new"]'), "Connected spaces page must not expose unsupported group space creation");
view.dispose();

resetDemoWorkspace();
const demoWorkspace = new DemoWorkspaceAdapter();
assert((await demoWorkspace.listSpaces()).length > 0, "Demo workspace must provide spaces for UI smoke setup");

function pickerInputFor(text) {
  const row = Array.from(document.querySelectorAll(".picker-row")).find((item) => item.textContent?.includes(text));
  assert(row, `Expected picker row for ${text}`);
  return row.querySelector("input");
}

view = renderWithProviders(
  React.createElement(CreateSpacePage, {
    app: createApp({ capabilities: demoCapabilities, mode: "demo", workspace: demoWorkspace })
  })
);
await screen.findByText("Mira");
const pendingInput = pickerInputFor("Mira");
assert(pendingInput?.disabled, "Create space page must disable pending inbound participants");
const connectedInput = pickerInputFor("林舟");
assert(connectedInput && !connectedInput.disabled, "Create space page must allow connected participants");
const createSpaceButton = screen.getByRole("button", { name: "创建并进入空间" });
assert(createSpaceButton.disabled, "Create space button must wait for a name and connected participant");
fireEvent.change(screen.getByPlaceholderText("例如：发布协作室"), { target: { value: "UI smoke space" } });
fireEvent.click(connectedInput);
await waitFor(() => assert(!createSpaceButton.disabled, "Create space button must enable for a valid connected participant selection"));
view.dispose();

const spaceFlowWorkspace = {
  createFlow: async (input) => ({
    id: "ui-flow",
    spaceId: input.spaceId,
    status: "draft",
    steps: [],
    title: input.title || "UI smoke flow",
    trigger: "UI smoke trigger"
  }),
  getSpace: async (spaceId) => {
    assert(spaceId === "release", "Space flow page must verify the owning space");
    return {
      id: "release",
      kind: "multi",
      participantIds: ["me", "lin"],
      title: "发布协作室"
    };
  },
  listSpaces: async () => [
    {
      id: "release",
      kind: "multi",
      participantIds: ["me", "lin"],
      title: "发布协作室"
    }
  ]
};
view = renderWithProviders(
  React.createElement(Routes, null,
    React.createElement(Route, {
      path: "/spaces/:spaceId/flows",
      element: React.createElement(SpaceFlowsPage, {
        app: createApp({ capabilities: demoCapabilities, mode: "demo", workspace: {
          ...spaceFlowWorkspace,
          createFlow: async (input) => {
            assert(input.spaceId === "release", "Space flow creation must bind to the current space");
            return spaceFlowWorkspace.createFlow(input);
          },
          listFlows: async (spaceId) => {
            assert(spaceId === "release", "Space flow page must list flows for the current space");
            return [];
          }
        } })
      })
    }),
    React.createElement(Route, { path: "/spaces/:spaceId/flows/:flowId", element: React.createElement("p", null, "space-bound-flow-created") })
  ),
  { initialEntries: ["/spaces/release/flows"] }
);
await screen.findByText("流程属于当前协作空间，负责请求参与者并等待回复或审批。");
fireEvent.click(screen.getByRole("button", { name: "新建流程草稿" }));
await screen.findByText("space-bound-flow-created");
view.dispose();

view = renderWithProviders(
  React.createElement(FlowsOverviewPage, {
    app: createApp({ capabilities: rustCapabilities, mode: "connected", workspace: connectedWorkspace })
  })
);
await screen.findByText("真实后端暂未接入流程");
assert(!document.querySelector('a[href="/flows/new"]'), "Connected flow overview must not expose unsupported global flow creation");
view.dispose();

resetDemoWorkspace();
localStorage.setItem("openpivot.web.mode", "demo");
localStorage.setItem("openpivot.web.theme", "light");
view = renderWithProviders(React.createElement(AppRouter), { initialEntries: ["/participants/me"] });
const selfDirectButton = await screen.findByRole("button", { name: "开始一对一协作空间" });
const selfProfile = document.querySelector(".profile-static");
assert(selfDirectButton.disabled, "Participant self profile must not allow direct space creation");
assert(!selfProfile?.textContent?.includes("建立联系"), "Participant self profile must not offer a contact request");
view.dispose();

function clickHref(href) {
  const link = document.querySelector(`a[href="${href}"]`);
  assert(link, `Expected link ${href}`);
  fireEvent.click(link);
}

function clickLastButtonByText(text) {
  const buttons = Array.from(document.querySelectorAll("button")).filter((button) => button.textContent?.trim() === text && !button.disabled);
  assert(buttons.length > 0, `Expected enabled button ${text}`);
  fireEvent.click(buttons.at(-1));
}

function messageArticles(text) {
  return Array.from(document.querySelectorAll(".space-message")).filter((article) => article.textContent?.includes(text));
}

function findMessageArticle(text) {
  return messageArticles(text)[0];
}

resetDemoWorkspace();
localStorage.setItem("openpivot.web.mode", "demo");
localStorage.setItem("openpivot.web.theme", "light");
view = renderWithProviders(React.createElement(AppRouter), { initialEntries: ["/messages?chat=missing"] });
await waitFor(() => assert(!!document.querySelector('a[href="/inbox"][aria-current="page"]'), "Unknown legacy chat routes must return to inbox"));
assert(!document.querySelector(".message-column"), "Unknown legacy chat routes must not fall through to a space timeline");
view.dispose();

resetDemoWorkspace();
localStorage.setItem("openpivot.web.mode", "demo");
localStorage.setItem("openpivot.web.theme", "light");
view = renderWithProviders(React.createElement(AppRouter), { initialEntries: ["/spaces/missing/participants"] });
await screen.findByText("没有找到协作空间");
assert(document.querySelector('a[href="/spaces"]'), "Missing space participants routes must link back to the space list");
view.dispose();

resetDemoWorkspace();
localStorage.setItem("openpivot.web.mode", "demo");
localStorage.setItem("openpivot.web.theme", "light");
view = renderWithProviders(React.createElement(AppRouter), { initialEntries: ["/spaces/missing/flows"] });
await screen.findByText("没有找到协作空间");
assert(!Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "新建流程草稿"), "Missing space flow routes must not expose flow creation");
view.dispose();

resetDemoWorkspace();
localStorage.setItem("openpivot.web.mode", "demo");
localStorage.setItem("openpivot.web.theme", "light");
view = renderWithProviders(React.createElement(AppRouter), { initialEntries: ["/inbox"] });

await screen.findByText("陈默等待你确认协议变更");
assert(document.querySelector('a[href="/participants/mira"]'), "Inbox contact request must link to participant context");
assert(document.querySelector('a[href="/spaces/core#core-4"]'), "Inbox mention must link to the exact message context");
clickHref("/participants/mira");
await screen.findByText("Mira");
const pendingProfile = document.querySelector(".profile-static");
assert(pendingProfile?.textContent?.includes("请先处理联系请求"), "Pending inbound participant profile must point back to inbox handling");
assert(!Array.from(pendingProfile?.querySelectorAll("button") || []).some((button) => button.textContent?.trim() === "建立联系"), "Pending inbound participant profile must not offer a duplicate contact request");
clickHref("/inbox");
await screen.findByText("陈默等待你确认协议变更");
clickHref("/spaces/core#core-4");
await screen.findByPlaceholderText("给 OpenPivot 核心开发 发送消息...");
assert(document.getElementById("core-4")?.getAttribute("data-message-id") === "core-4", "Message context links must have matching DOM anchors");
await waitFor(() => assert(document.getElementById("core-4")?.getAttribute("data-scrolled-into-view") === "true", "Message context links must scroll to the target after async load"));
const messageText = `UI smoke message ${Date.now()}`;
fireEvent.change(screen.getByPlaceholderText("给 OpenPivot 核心开发 发送消息..."), { target: { value: messageText } });
fireEvent.click(screen.getByRole("button", { name: "发送" }));
await screen.findByText(messageText);
await waitFor(() => assert(findMessageArticle(messageText)?.getAttribute("data-delivery-state") === "sent", "First sent message should settle before the next send"));
const failedText = `失败测试 ${Date.now()}`;
fireEvent.change(screen.getByPlaceholderText("给 OpenPivot 核心开发 发送消息..."), { target: { value: failedText } });
fireEvent.click(screen.getByRole("button", { name: "发送" }));
await screen.findByText(failedText);
await screen.findByText(/发送失败/);
fireEvent.click(screen.getByRole("button", { name: "重试" }));
await waitFor(() => {
  const failedArticles = messageArticles(failedText);
  assert(failedArticles.length === 1, "Retried failed message should remain a single timeline entry");
  assert(failedArticles[0]?.getAttribute("data-delivery-state") === "sent", "Retried failed message should become sent");
});

clickHref("/spaces/core/participants");
await screen.findByText("产品负责人");
clickHref("/spaces/core");
await screen.findByText(messageText);
clickLastButtonByText("基于此消息创建协作流程");
await screen.findByText("基于消息的新流程");

clickHref("/inbox");
await screen.findByText("陈默等待你确认协议变更");
fireEvent.click(screen.getByRole("button", { name: "批准" }));
await waitFor(() => assert(!document.body.textContent?.includes("陈默等待你确认协议变更"), "Approval should leave the inbox after processing"));
clickHref("/spaces/core");
await screen.findByText("人工审批已通过，流程已写回协作空间。");
view.dispose();

console.log(JSON.stringify({
  ok: true,
  checks: [
    "connected-new-menu-gates-group-space",
    "new-menu-uses-participant-discovery-language",
    "new-menu-routes-flow-creation-through-spaces",
    "command-search-only-advertises-supported-domains",
    "settings-api-save-is-stateful",
    "demo-settings-hides-fake-logout",
    "connected-spaces-empty-state-guides-to-participants",
    "create-space-requires-connected-participants",
    "space-flow-create-binds-current-space",
    "participant-self-profile-disables-direct-space",
    "legacy-unknown-chat-returns-to-inbox",
    "missing-space-subroutes-stop-false-context",
    "inbox-message-context-links-have-anchors",
    "inbox-message-context-scrolls-after-load",
    "inbox-contact-request-links-to-participant",
    "demo-app-inbox-space-send-participants-flow-approval",
    "demo-failed-message-retry",
    "connected-flows-hide-unsupported-create"
  ]
}, null, 2));
process.exit(0);
