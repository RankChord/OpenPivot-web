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

const React = nodeRequire("react");
const { QueryClient, QueryClientProvider } = nodeRequire("@tanstack/react-query");
const { MemoryRouter } = nodeRequire("react-router-dom");
const { cleanup, fireEvent, render, screen, waitFor } = nodeRequire("@testing-library/react");

const { NewMenu } = loadTsModule("src/app/AppShell.tsx");
const { default: AppRouter } = loadTsModule("src/app/AppRouter.tsx");
const { CreateFlowPage, FlowsOverviewPage } = loadTsModule("src/features/flows/FlowPages.tsx");
const { SpacesPage } = loadTsModule("src/features/spaces/SpacePages.tsx");
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
  listSpaces: async () => []
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
const flowFormWorkspace = {
  createFlow: async (input) => ({
    id: "ui-flow",
    spaceId: input.spaceId,
    status: "draft",
    steps: [],
    title: input.title || "UI smoke flow",
    trigger: "UI smoke trigger"
  }),
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
  React.createElement(CreateFlowPage, {
    app: createApp({ capabilities: demoCapabilities, mode: "demo", workspace: flowFormWorkspace })
  })
);
await screen.findByText("所属协作空间");
const createButton = screen.getByRole("button", { name: "创建流程草稿" });
assert(createButton.disabled, "Create flow button must stay disabled before a space is selected");
const releaseRadio = Array.from(document.querySelectorAll('input[name="spaceId"]')).find((input) => input.value === "release");
assert(releaseRadio, "Create flow page must list existing collaboration spaces");
fireEvent.click(releaseRadio);
await waitFor(() => assert(!createButton.disabled, "Create flow button must enable after selecting the owning space"));
view.dispose();

view = renderWithProviders(
  React.createElement(FlowsOverviewPage, {
    app: createApp({ capabilities: rustCapabilities, mode: "connected", workspace: connectedWorkspace })
  })
);
await screen.findByText("真实后端暂未接入流程");
assert(!document.querySelector('a[href="/flows/new"]'), "Connected flow overview must not expose unsupported global flow creation");
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

resetDemoWorkspace();
localStorage.setItem("openpivot.web.mode", "demo");
localStorage.setItem("openpivot.web.theme", "light");
view = renderWithProviders(React.createElement(AppRouter), { initialEntries: ["/inbox"] });

await screen.findByText("陈默等待你确认协议变更");
clickHref("/spaces/core");
await screen.findByPlaceholderText("给 OpenPivot 核心开发 发送消息...");
const messageText = `UI smoke message ${Date.now()}`;
fireEvent.change(screen.getByPlaceholderText("给 OpenPivot 核心开发 发送消息..."), { target: { value: messageText } });
fireEvent.click(screen.getByRole("button", { name: "发送" }));
await screen.findByText(messageText);

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
    "connected-spaces-empty-state-guides-to-participants",
    "demo-create-flow-requires-space",
    "demo-app-inbox-space-send-participants-flow-approval",
    "connected-flows-hide-unsupported-create"
  ]
}, null, 2));
process.exit(0);
