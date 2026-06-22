import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AtSign,
  Bell,
  ChevronRight,
  Code2,
  Command,
  GitBranch,
  Inbox,
  LogOut,
  MessageCircle,
  Moon,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Sun,
  Users,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import { DemoWorkspaceAdapter } from "./domain/demoWorkspaceAdapter";
import { ConnectedWorkspaceAdapter } from "./domain/connectedWorkspaceAdapter";
import { environmentForMode, unavailableReason } from "./domain/capabilities";
import type {
  CollaborationFlow,
  CollaborationSpace,
  ContactRequest,
  InboxItem,
  MessageBlock,
  Participant,
  ProductCapabilities,
  SessionState,
  SpaceMessage,
  WorkspaceEnvironment
} from "./domain/models";
import type { WorkspaceAdapter } from "./domain/workspaceAdapter";
import { RustHttpAdapter } from "./adapters/rustHttpAdapter";
import { LocalRefreshTokenStore } from "./adapters/tokenStore";
import { defaultApiBaseUrl } from "./config";
import type { AuthTokens, ProductMode } from "./types";

type ThemeMode = "light" | "dark";

interface AppContextValue {
  mode: ProductMode;
  requestMode: (mode: ProductMode) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  apiBaseUrl: string;
  setApiBaseUrl: (url: string) => void;
  session: SessionState;
  setSession: (session: SessionState) => void;
  workspaceVersion: number;
  refreshWorkspace: () => void;
  workspace: WorkspaceAdapter | null;
  environment: WorkspaceEnvironment;
  rustAdapter: RustHttpAdapter;
  setConnectedTokens: (tokens: AuthTokens, username?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const tokenStore = new LocalRefreshTokenStore();

function invalidateWorkspaceQueries(queryClient: QueryClient, mode: ProductMode) {
  return queryClient.invalidateQueries({ queryKey: ["workspace", mode], refetchType: "all" });
}

function applyInboxApprovalToFlowCache(flow: CollaborationFlow | null | undefined, stepId: string, action: "approve" | "reject" | "dismiss") {
  if (!flow) return flow;
  const steps = flow.steps.map((step) => ({ ...step }));
  const stepIndex = steps.findIndex((step) => step.id === stepId);
  if (stepIndex < 0) return flow;

  if (action === "reject") {
    steps[stepIndex].status = "failed";
    return { ...flow, status: "paused" as const, waitingStepId: undefined, steps };
  }

  steps[stepIndex].status = "completed";
  const nextStep = steps[stepIndex + 1];
  if (nextStep) nextStep.status = "completed";
  const status = steps.every((step) => step.status === "completed") ? "completed" as const : flow.status;
  return { ...flow, status, waitingStepId: undefined, steps };
}

function App() {
  const queryClient = useQueryClient();
  const [mode, setModeState] = useState<ProductMode>(() => (localStorage.getItem("openpivot.web.mode") as ProductMode) || "demo");
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("openpivot.web.theme") as ThemeMode) || "light");
  const [apiBaseUrl, setApiBaseUrl] = useState(() => localStorage.getItem("openpivot.web.apiBaseUrl") || defaultApiBaseUrl());
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState>(() => mode === "demo"
    ? { status: "authenticated", userId: "me", username: "Ling" }
    : { status: "booting" });
  const [workspaceVersion, setWorkspaceVersion] = useState(0);

  const rustAdapter = useMemo(() => {
    const adapter = new RustHttpAdapter({ baseUrl: apiBaseUrl, refreshTokenStore: tokenStore });
    adapter.setAccessToken(accessToken);
    return adapter;
  }, [apiBaseUrl, accessToken]);

  useEffect(() => {
    localStorage.setItem("openpivot.web.mode", mode);
    localStorage.setItem("openpivot.web.theme", theme);
    localStorage.setItem("openpivot.web.visualSystem", "marvis");
    localStorage.setItem("openpivot.web.apiBaseUrl", apiBaseUrl);
    document.documentElement.dataset.theme = theme;
  }, [mode, theme, apiBaseUrl]);

  useEffect(() => {
    let canceled = false;
    if (mode === "demo") {
      setAccessToken(null);
      setSession({ status: "authenticated", userId: "me", username: "Ling" });
      return;
    }

    const boot = async () => {
      const adapter = new RustHttpAdapter({ baseUrl: apiBaseUrl, refreshTokenStore: tokenStore });
      if (!adapter.hasRefreshToken()) {
        if (!canceled) setSession({ status: "anonymous" });
        return;
      }

      if (!canceled) setSession({ status: "booting" });
      try {
        const tokens = await adapter.restoreSession();
        adapter.setAccessToken(tokens.accessToken);
        const me = await adapter.me();
        if (!canceled) {
          setAccessToken(tokens.accessToken);
          setSession({ status: "authenticated", userId: `user-${me.user_id}`, sourceUserId: me.user_id });
        }
      } catch (error) {
        tokenStore.clear();
        if (!canceled) {
          setAccessToken(null);
          setSession({ status: "anonymous" });
        }
        console.warn("Failed to restore session", error);
      }
    };

    void boot();
    return () => {
      canceled = true;
    };
  }, [mode, apiBaseUrl]);

  const workspace = useMemo<WorkspaceAdapter | null>(() => {
    if (mode === "demo") return new DemoWorkspaceAdapter();
    if (session.status !== "authenticated" || !session.sourceUserId) return null;
    return new ConnectedWorkspaceAdapter(rustAdapter, session.sourceUserId);
  }, [mode, rustAdapter, session]);

  const currentUserId = session.status === "authenticated" ? session.userId : "anonymous";
  const environment = useMemo(() => environmentForMode(mode, currentUserId), [mode, currentUserId]);

  const requestMode = useCallback((nextMode: ProductMode) => {
    if (nextMode === mode) return;
    const ok = window.confirm("切换数据环境会离开当前环境，并清空当前页面缓存。继续吗？");
    if (!ok) return;
    queryClient.clear();
    setWorkspaceVersion((current) => current + 1);
    setAccessToken(null);
    setModeState(nextMode);
    setSession(nextMode === "demo" ? { status: "authenticated", userId: "me", username: "Ling" } : { status: "booting" });
  }, [mode, queryClient]);

  const refreshWorkspace = useCallback(() => {
    setWorkspaceVersion((current) => current + 1);
  }, []);

  const setConnectedTokens = useCallback(async (tokens: AuthTokens, username?: string) => {
    setAccessToken(tokens.accessToken);
    rustAdapter.setAccessToken(tokens.accessToken);
    const me = await rustAdapter.me();
    setSession({ status: "authenticated", userId: `user-${me.user_id}`, username, sourceUserId: me.user_id });
    refreshWorkspace();
    await queryClient.invalidateQueries();
  }, [queryClient, refreshWorkspace, rustAdapter]);

  const logout = useCallback(async () => {
    try {
      await rustAdapter.logout();
    } finally {
      tokenStore.clear();
      setAccessToken(null);
      setSession(mode === "demo" ? { status: "authenticated", userId: "me", username: "Ling" } : { status: "anonymous" });
      refreshWorkspace();
      queryClient.clear();
    }
  }, [mode, queryClient, refreshWorkspace, rustAdapter]);

  const app: AppContextValue = {
    mode,
    requestMode,
    theme,
    setTheme,
    apiBaseUrl,
    setApiBaseUrl,
    session,
    setSession,
    workspaceVersion,
    refreshWorkspace,
    workspace,
    environment,
    rustAdapter,
    setConnectedTokens,
    logout
  };

  return (
    <Routes>
      <Route element={<Shell app={app} />}>
        <Route index element={<Navigate to="/inbox" replace />} />
        <Route path="/inbox" element={<RequireWorkspace app={app}><InboxPage app={app} /></RequireWorkspace>} />
        <Route path="/spaces" element={<RequireWorkspace app={app}><SpacesPage app={app} /></RequireWorkspace>} />
        <Route path="/spaces/new" element={<RequireWorkspace app={app}><CreateSpacePage app={app} /></RequireWorkspace>} />
        <Route path="/spaces/:spaceId" element={<RequireWorkspace app={app}><SpaceTimelinePage app={app} /></RequireWorkspace>} />
        <Route path="/spaces/:spaceId/participants" element={<RequireWorkspace app={app}><SpaceParticipantsPage app={app} /></RequireWorkspace>} />
        <Route path="/spaces/:spaceId/flows" element={<RequireWorkspace app={app}><SpaceFlowsPage app={app} /></RequireWorkspace>} />
        <Route path="/spaces/:spaceId/flows/:flowId" element={<RequireWorkspace app={app}><FlowDetailPage app={app} /></RequireWorkspace>} />
        <Route path="/participants" element={<RequireWorkspace app={app}><ParticipantsPage app={app} /></RequireWorkspace>} />
        <Route path="/participants/:participantId" element={<RequireWorkspace app={app}><ParticipantDetailPage app={app} /></RequireWorkspace>} />
        <Route path="/flows" element={<RequireWorkspace app={app}><FlowsOverviewPage app={app} /></RequireWorkspace>} />
        <Route path="/settings" element={<SettingsPage app={app} />} />
        <Route path="/login" element={<AuthPage app={app} kind="login" />} />
        <Route path="/register" element={<AuthPage app={app} kind="register" />} />
        <Route path="/messages" element={<LegacyMessagesRedirect />} />
        <Route path="/workflows" element={<Navigate to="/flows" replace />} />
        <Route path="/contacts" element={<Navigate to="/participants" replace />} />
        <Route path="/requests" element={<Navigate to="/inbox" replace />} />
        <Route path="/connections" element={<Navigate to="/settings" replace />} />
        <Route path="*" element={<Navigate to="/inbox" replace />} />
      </Route>
    </Routes>
  );
}

function RequireWorkspace({ app, children }: { app: AppContextValue; children: ReactNode }) {
  if (app.mode === "connected") {
    if (app.session.status === "booting") return <BootingPage />;
    if (app.session.status !== "authenticated") return <AuthRequired app={app} />;
  }
  return <>{children}</>;
}

function Shell({ app }: { app: AppContextValue }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="op-shell">
      <UnifiedSidebar app={app} onOpenCommand={() => setCommandOpen(true)} newOpen={newOpen} setNewOpen={setNewOpen} />
      <main className="op-main">
        <Outlet />
      </main>
      <MobileNav />
      {commandOpen && <CommandPanel app={app} onClose={() => setCommandOpen(false)} />}
    </div>
  );
}

function UnifiedSidebar({ app, onOpenCommand, newOpen, setNewOpen }: {
  app: AppContextValue;
  onOpenCommand: () => void;
  newOpen: boolean;
  setNewOpen: (open: boolean) => void;
}) {
  const spacesQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "spaces"],
    queryFn: () => app.workspace!.listSpaces(),
    enabled: !!app.workspace
  });
  const inboxQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "inbox"],
    queryFn: () => app.workspace!.listInboxItems(),
    enabled: !!app.workspace,
    refetchInterval: app.mode === "connected" ? 8000 : false
  });
  const spaces = spacesQuery.data || [];
  const pinned = spaces.filter((space) => space.pinned);
  const recent = [...spaces].sort((a, b) => String(b.lastActivityAt || "").localeCompare(String(a.lastActivityAt || ""))).slice(0, 6);
  const actionCount = (inboxQuery.data || []).filter((item) => item.priority === "action").length;

  return (
    <aside className="unified-sidebar" aria-label="OpenPivot 导航">
      <Link className="sidebar-brand" to="/inbox" aria-label="OpenPivot Home">
        <img src="/brand/logo-symbol.svg" alt="" />
        <span>OpenPivot</span>
      </Link>

      <button className="sidebar-search command-trigger" onClick={onOpenCommand}>
        <Search size={15} />
        <span>搜索或命令</span>
        <kbd><Command size={11} />K</kbd>
      </button>

      <div className="new-entry">
        <button className="primary-button" onClick={() => setNewOpen(!newOpen)}><Plus size={16} />新建</button>
        {newOpen && <NewMenu app={app} onClose={() => setNewOpen(false)} />}
      </div>

      <nav className="primary-nav" aria-label="主要入口">
        <NavLink to="/inbox">
          <Inbox size={16} />
          <span>收件箱</span>
          {actionCount > 0 && <em>{actionCount}</em>}
        </NavLink>
        <NavLink to="/spaces">
          <MessageCircle size={16} />
          <span>协作空间</span>
        </NavLink>
      </nav>

      <div className="sidebar-groups">
        <SidebarSpaceGroup title="固定空间" spaces={pinned} />
        <SidebarSpaceGroup title="最近" spaces={recent} />
        <section className="sidebar-group">
          <h2>资源</h2>
          <NavLink className="sidebar-row resource-row" to="/participants">
            <span />
            <span><strong>参与者</strong><small>搜索、建立联系、开始协作</small></span>
          </NavLink>
          <NavLink className="sidebar-row resource-row" to="/flows">
            <span />
            <span><strong>协作流程</strong><small>跨空间流程概览</small></span>
          </NavLink>
        </section>
      </div>

      <footer className="sidebar-footer">
        <Link className="account-row" to="/settings">
          <ActorAvatar id={app.environment.currentUserId} size="sm" />
          <span>
            <strong>{accountName(app)}</strong>
            <small>{app.mode === "demo" ? "演示数据" : connectedLabel(app.session)}</small>
          </span>
        </Link>
        <div className="footer-actions">
          <Link to="/inbox" title="收件箱" aria-label="收件箱"><Bell size={15} /></Link>
          <Link to="/settings" title="设置" aria-label="设置"><Settings size={15} /></Link>
          <button title="切换主题" aria-label="切换主题" onClick={() => app.setTheme(app.theme === "dark" ? "light" : "dark")}>
            {app.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </footer>
    </aside>
  );
}

function SidebarSpaceGroup({ title, spaces }: { title: string; spaces: CollaborationSpace[] }) {
  if (!spaces.length) return null;
  return (
    <section className="sidebar-group">
      <h2>{title}</h2>
      {spaces.map((space) => (
        <NavLink key={`${title}-${space.id}`} className="sidebar-row" to={`/spaces/${space.id}`}>
          {space.unreadCount ? <span className="unread-dot" /> : <span />}
          <span>
            <strong>{space.title}</strong>
            <small>{space.kind === "direct" ? "一对一协作空间" : `${space.participantIds.length} 位参与者`}</small>
          </span>
        </NavLink>
      ))}
    </section>
  );
}

function NewMenu({ app, onClose }: { app: AppContextValue; onClose: () => void }) {
  const groupReason = unavailableReason("groupSpaces", app.environment.capabilities);
  const flowReason = unavailableReason("collaborationFlows", app.environment.capabilities);
  const createFlowReason = flowReason || "请先进入具体协作空间，或从空间消息创建协作流程。";
  return (
    <div className="new-menu">
      <Link to="/spaces/new" onClick={onClose} className={clsx(groupReason && "disabled-link")} aria-disabled={!!groupReason} title={groupReason || undefined}>
        新建协作空间
      </Link>
      <Link to="/participants" onClick={onClose}>与参与者开始对话</Link>
      <Link to="/participants" onClick={onClose}>建立联系</Link>
      <button className="new-menu-action" disabled title={createFlowReason}>
        新建协作流程
      </button>
    </div>
  );
}

function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="移动端导航">
      <NavLink to="/inbox"><Inbox size={19} /><span>收件箱</span></NavLink>
      <NavLink to="/spaces"><MessageCircle size={19} /><span>空间</span></NavLink>
      <NavLink to="/participants"><Users size={19} /><span>参与者</span></NavLink>
      <NavLink to="/settings"><Settings size={19} /><span>我的</span></NavLink>
    </nav>
  );
}

function CommandPanel({ app, onClose }: { app: AppContextValue; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const spacesQuery = useQuery({
    queryKey: ["command", app.mode, app.session, "spaces"],
    queryFn: () => app.workspace!.listSpaces(),
    enabled: !!app.workspace
  });
  const participantsQuery = useQuery({
    queryKey: ["command", app.mode, app.session, "participants", query],
    queryFn: () => app.workspace!.searchParticipants(query),
    enabled: !!app.workspace
  });
  const flowsQuery = useQuery({
    queryKey: ["command", app.mode, app.session, "flows"],
    queryFn: () => app.workspace!.listFlows(),
    enabled: !!app.workspace
  });
  const normalized = query.trim().toLowerCase();
  const spaces = (spacesQuery.data || []).filter((space) => !normalized || space.title.toLowerCase().includes(normalized));
  const participants = participantsQuery.data || [];
  const flows = (flowsQuery.data || []).filter((flow) => !normalized || flow.title.toLowerCase().includes(normalized));

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="搜索或命令">
      <div className="command-panel">
        <div className="command-input">
          <Search size={16} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索协作空间、参与者、消息、协作流程或设置" />
          <button onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </div>
        <div className="command-results">
          <CommandSection title="协作空间">
            {spaces.map((space) => <CommandLink key={space.id} to={`/spaces/${space.id}`} onClose={onClose} title={space.title} detail={space.lastPreview || "打开空间"} />)}
          </CommandSection>
          <CommandSection title="参与者">
            {participants.slice(0, 6).map((participant) => <CommandLink key={participant.id} to={`/participants/${participant.id}`} onClose={onClose} title={participant.displayName} detail={participant.title || participant.handle || "参与者"} />)}
          </CommandSection>
          <CommandSection title="协作流程">
            {flows.map((flow) => <CommandLink key={flow.id} to={`/spaces/${flow.spaceId}/flows/${flow.id}`} onClose={onClose} title={flow.title} detail={flow.trigger} />)}
          </CommandSection>
          <CommandSection title="设置动作">
            <CommandLink to="/settings" onClose={onClose} title="打开设置" detail="运行模式、后端地址、主题和会话" />
          </CommandSection>
          {!spaces.length && !participants.length && !flows.length && <p className="muted">没有找到匹配结果。</p>}
        </div>
      </div>
    </div>
  );
}

function CommandSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function CommandLink({ to, title, detail, onClose }: { to: string; title: string; detail: string; onClose: () => void }) {
  return (
    <Link className="command-result" to={to} onClick={onClose}>
      <strong>{title}</strong>
      <small>{detail}</small>
    </Link>
  );
}

function InboxPage({ app }: { app: AppContextValue }) {
  const queryClient = useQueryClient();
  const inboxQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "inbox"],
    queryFn: () => app.workspace!.listInboxItems(),
    enabled: !!app.workspace
  });
  const acceptRequest = useMutation({
    mutationFn: (requestId: string) => app.workspace!.acceptContactRequest(requestId),
    onSuccess: () => {
      app.refreshWorkspace();
      return invalidateWorkspaceQueries(queryClient, app.mode);
    }
  });
  const rejectRequest = useMutation({
    mutationFn: (requestId: string) => app.workspace!.rejectContactRequest(requestId),
    onSuccess: () => {
      app.refreshWorkspace();
      return invalidateWorkspaceQueries(queryClient, app.mode);
    }
  });
  const complete = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" | "dismiss" }) => app.workspace!.completeInboxItem(id, action),
    onSuccess: async (_result, variables) => {
      const item = items.find((candidate) => candidate.id === variables.id);
      if (item?.kind === "approval" && item.spaceId && item.flowId && item.stepId) {
        queryClient.setQueriesData<CollaborationFlow | null>(
          {
            predicate: (query) => {
              const key = query.queryKey;
              return key[0] === "workspace" && key.includes("flow") && key.includes(item.spaceId) && key.includes(item.flowId);
            }
          },
          (flow) => applyInboxApprovalToFlowCache(flow, item.stepId!, variables.action)
        );
      }
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
    }
  });
  const items = inboxQuery.data || [];
  const actionItems = items.filter((item) => item.priority === "action");
  const notices = items.filter((item) => item.priority === "notice");
  const background = items.filter((item) => item.priority === "background");

  return (
    <section className="center-page page-fade">
      <div className="main-column">
        <PageTitle title="收件箱" subtitle="需要你处理的请求、审批和提及都会回到准确的协作上下文。" />
        {inboxQuery.isLoading && <InlineState title="正在整理收件箱" detail="稍等一下。" />}
        {!inboxQuery.isLoading && !items.length && <EmptyState title="当前没有待处理事项" detail="你可以回到协作空间继续工作。" action={<Link className="primary-button" to="/spaces">查看协作空间</Link>} />}
        <InboxGroup title="需要我处理" items={actionItems} app={app} onApprove={(id) => complete.mutate({ id, action: "approve" })} onReject={(id) => complete.mutate({ id, action: "reject" })} onDismiss={(id) => complete.mutate({ id, action: "dismiss" })} onAcceptRequest={(id) => acceptRequest.mutate(id)} onRejectRequest={(id) => rejectRequest.mutate(id)} pending={complete.isPending || acceptRequest.isPending || rejectRequest.isPending} />
        <InboxGroup title="提及与回复" items={notices} app={app} onApprove={(id) => complete.mutate({ id, action: "approve" })} onReject={(id) => complete.mutate({ id, action: "reject" })} onDismiss={(id) => complete.mutate({ id, action: "dismiss" })} onAcceptRequest={(id) => acceptRequest.mutate(id)} onRejectRequest={(id) => rejectRequest.mutate(id)} pending={complete.isPending || acceptRequest.isPending || rejectRequest.isPending} />
        <InboxGroup title="未读动态" items={background} app={app} onApprove={(id) => complete.mutate({ id, action: "approve" })} onReject={(id) => complete.mutate({ id, action: "reject" })} onDismiss={(id) => complete.mutate({ id, action: "dismiss" })} onAcceptRequest={(id) => acceptRequest.mutate(id)} onRejectRequest={(id) => rejectRequest.mutate(id)} pending={complete.isPending || acceptRequest.isPending || rejectRequest.isPending} />
      </div>
    </section>
  );
}

function InboxGroup({ title, items, app, onApprove, onReject, onDismiss, onAcceptRequest, onRejectRequest, pending }: {
  title: string;
  items: InboxItem[];
  app: AppContextValue;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDismiss: (id: string) => void;
  onAcceptRequest: (id: string) => void;
  onRejectRequest: (id: string) => void;
  pending: boolean;
}) {
  if (!items.length) return null;
  return (
    <section className="inbox-group">
      <h2>{title}</h2>
      {items.map((item) => (
        <article className="inbox-row" key={item.id}>
          <Link to={inboxTarget(item)} className="inbox-main">
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </Link>
          <div className="inbox-actions">
            {item.kind === "request" && item.requestId && (
              <>
                <button className="quiet-button" disabled={pending} onClick={() => onRejectRequest(item.requestId!)}>拒绝</button>
                <button className="primary-button" disabled={pending} onClick={() => onAcceptRequest(item.requestId!)}>接受</button>
              </>
            )}
            {item.kind === "approval" && (
              <>
                <button className="quiet-button" disabled={pending || !app.environment.capabilities.approvals} title={unavailableReason("approvals", app.environment.capabilities) || undefined} onClick={() => onReject(item.id)}>退回</button>
                <button className="primary-button" disabled={pending || !app.environment.capabilities.approvals} title={unavailableReason("approvals", app.environment.capabilities) || undefined} onClick={() => onApprove(item.id)}>批准</button>
              </>
            )}
            {item.kind !== "request" && item.kind !== "approval" && (
              <button className="quiet-button" disabled={pending} onClick={() => onDismiss(item.id)}>标记已读</button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

function SpacesPage({ app }: { app: AppContextValue }) {
  const spacesQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "spaces"],
    queryFn: () => app.workspace!.listSpaces(),
    enabled: !!app.workspace
  });
  const spaces = spacesQuery.data || [];
  return (
    <section className="center-page page-fade">
      <div className="main-column">
        <PageTitle title="协作空间" subtitle="所有对话都发生在协作空间中，一对一只是成员更少的空间。" action={<Link className="quiet-button" to="/spaces/new"><Plus size={16} />新建</Link>} />
        {spacesQuery.isLoading && <InlineState title="正在读取协作空间" detail="从当前数据环境加载。" />}
        {!spacesQuery.isLoading && !spaces.length && <EmptyState title="还没有协作空间" detail="创建第一个空间，选择参与者，然后发送第一条消息。" action={<Link className="primary-button" to="/spaces/new">创建协作空间</Link>} />}
        <div className="conversation-list">
          {spaces.map((space) => (
            <Link key={space.id} className="conversation-home-row" to={`/spaces/${space.id}`}>
              <ActorAvatar id={space.participantIds[1] || space.id} size="md" />
              <span>
                <strong>{space.title}</strong>
                <small>{space.kind === "direct" ? "一对一协作空间" : `${space.participantIds.length} 位参与者`}</small>
                <em>{space.lastPreview || "打开时间线"}</em>
              </span>
              <time>{shortDate(space.lastActivityAt)}</time>
              {!!space.unreadCount && <i aria-label="未读" />}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function CreateSpacePage({ app }: { app: AppContextValue }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const participantsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participants"],
    queryFn: () => app.workspace!.listParticipants(),
    enabled: !!app.workspace
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!app.workspace?.createSpace) throw new Error(unavailableReason("groupSpaces", app.environment.capabilities) || "当前环境不能创建多人协作空间");
      return app.workspace.createSpace({ title, participantIds: selected });
    },
    onSuccess: async (space) => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
      navigate(`/spaces/${space.id}`);
    }
  });
  const reason = unavailableReason("groupSpaces", app.environment.capabilities);
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title="新建协作空间" subtitle="选择任意参与者，人类与智能体使用同一个选择器。" />
        {reason && <InlineState title="当前环境不可创建多人空间" detail={reason} />}
        <form className="create-space-form" onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}>
          <label>
            <span>空间名称</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：发布协作室" disabled={!!reason} />
          </label>
          <section className="participant-picker">
            <h2>参与者</h2>
            {(participantsQuery.data || []).filter((participant) => participant.relationship !== "self").map((participant) => {
              const checked = selected.includes(participant.id);
              return (
                <label key={participant.id} className={clsx("picker-row", checked && "selected")}>
                  <input type="checkbox" checked={checked} disabled={!!reason} onChange={(event) => {
                    setSelected((current) => event.target.checked ? [...current, participant.id] : current.filter((id) => id !== participant.id));
                  }} />
                  <ActorAvatar id={participant.id} size="sm" />
                  <span><strong>{participant.displayName}</strong><small>{participant.title || participant.handle}</small></span>
                </label>
              );
            })}
          </section>
          {create.error && <p className="form-error">{(create.error as Error).message}</p>}
          <button className="primary-button" disabled={!!reason || create.isPending}>创建并进入空间</button>
        </form>
      </div>
    </section>
  );
}

function SpaceTimelinePage({ app }: { app: AppContextValue }) {
  const { spaceId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const spaceQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "space", spaceId],
    queryFn: () => app.workspace!.getSpace(spaceId),
    enabled: !!app.workspace && !!spaceId
  });
  const participantsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participants"],
    queryFn: () => app.workspace!.listParticipants(),
    enabled: !!app.workspace
  });
  const messagesQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "messages", spaceId],
    queryFn: () => app.workspace!.listMessages(spaceId),
    enabled: !!app.workspace && !!spaceId,
    refetchInterval: app.mode === "connected" ? 5000 : false
  });
  const sendMutation = useMutation({
    mutationFn: ({ text, clientId }: { text: string; clientId: string }) => app.workspace!.sendMessage(spaceId, text, clientId),
    onMutate: async ({ text, clientId }) => {
      await queryClient.cancelQueries({ queryKey: ["workspace", app.mode, app.session, "messages", spaceId] });
      const optimistic: SpaceMessage = {
        id: clientId,
        spaceId,
        senderId: app.environment.currentUserId,
        kind: "message",
        blocks: [{ type: "text", text }],
        createdAt: new Date().toISOString(),
        deliveryState: "sending"
      };
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", spaceId], (current = []) => [...current, optimistic]);
      return { clientId };
    },
    onSuccess: (message, _variables, context) => {
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", spaceId], (current = []) => current.map((item) => item.id === context?.clientId ? message : item));
      void queryClient.invalidateQueries({ queryKey: ["workspace", app.mode, app.session, "spaces"] });
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", spaceId], (current = []) => current.map((item) => item.id === context?.clientId ? { ...item, deliveryState: "failed" } : item));
    }
  });
  const createFlow = useMutation({
    mutationFn: (messageId: string) => app.workspace!.createFlowFromMessage(spaceId, messageId),
    onSuccess: async (flow) => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
      navigate(`/spaces/${spaceId}/flows/${flow.id}`);
    }
  });

  const space = spaceQuery.data;
  const participants = participantsQuery.data || [];
  const messages = messagesQuery.data || [];
  if (spaceQuery.isLoading) return <InlinePage title="正在打开协作空间" />;
  if (!space) return <InlinePage title="没有找到协作空间" detail="这个空间不存在，或当前环境没有权限访问。" action={<Link className="primary-button" to="/spaces">返回空间列表</Link>} />;

  return (
    <section className="chat-canvas page-fade">
      <SpaceHeader space={space} participants={participants} />
      <div className="message-column">
        {messages.map((message) => (
          <MessageView
            key={message.id}
            message={message}
            participants={participants}
            canCreateFlow={app.environment.capabilities.collaborationFlows}
            onCreateFlow={(messageId) => createFlow.mutate(messageId)}
            createFlowPending={createFlow.isPending}
          />
        ))}
        {!messages.length && <EmptyState title="还没有消息" detail="发送第一条消息开始协作。" />}
      </div>
      <Composer
        placeholder={`给 ${space.title} 发送消息...`}
        sending={sendMutation.isPending}
        onSend={(text) => sendMutation.mutate({ text, clientId: `local-${Date.now()}` })}
        capabilities={app.environment.capabilities}
      />
    </section>
  );
}

function SpaceHeader({ space, participants }: { space: CollaborationSpace; participants: Participant[] }) {
  const spaceParticipants = participants.filter((participant) => space.participantIds.includes(participant.id));
  return (
    <header className="chat-header space-header">
      <Link className="mobile-back-link" to="/spaces">返回</Link>
      <div>
        <h1>{space.title}</h1>
        <p>{space.kind === "direct" ? directSubtitle(spaceParticipants) : `${spaceParticipants.length} 位参与者`}{space.hasActiveFlow ? " · 有协作流程运行" : ""}</p>
      </div>
      <nav className="space-tabs">
        <NavLink to={`/spaces/${space.id}`}>对话</NavLink>
        <NavLink to={`/spaces/${space.id}/participants`}>参与者</NavLink>
        <NavLink to={`/spaces/${space.id}/flows`}>协作流程</NavLink>
      </nav>
    </header>
  );
}

function SpaceParticipantsPage({ app }: { app: AppContextValue }) {
  const { spaceId = "" } = useParams();
  const spaceQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "space", spaceId],
    queryFn: () => app.workspace!.getSpace(spaceId),
    enabled: !!app.workspace && !!spaceId
  });
  const participantsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participants"],
    queryFn: () => app.workspace!.listParticipants(),
    enabled: !!app.workspace
  });
  const space = spaceQuery.data;
  const participants = (participantsQuery.data || []).filter((participant) => space?.participantIds.includes(participant.id));
  if (!space) return <InlinePage title="正在打开参与者" />;
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title={`${space.title} · 参与者`} subtitle="参与者是可以沟通、回复、审批和承担流程步骤的身份。" action={<Link className="quiet-button" to={`/spaces/${space.id}`}>回到对话</Link>} />
        <div className="quiet-list">
          {participants.map((participant) => <ParticipantLink key={participant.id} participant={participant} />)}
        </div>
      </div>
    </section>
  );
}

function SpaceFlowsPage({ app }: { app: AppContextValue }) {
  const { spaceId = "" } = useParams();
  const flowsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "flows", spaceId],
    queryFn: () => app.workspace!.listFlows(spaceId),
    enabled: !!app.workspace && !!spaceId
  });
  const reason = unavailableReason("collaborationFlows", app.environment.capabilities);
  return (
    <section className="center-page page-fade">
      <div className="main-column">
        <PageTitle title="协作流程" subtitle="流程属于当前协作空间，负责请求参与者并等待回复或审批。" action={<Link className="quiet-button" to={`/spaces/${spaceId}`}>回到对话</Link>} />
        {reason && <InlineState title="当前环境暂未接入协作流程" detail={reason} />}
        <FlowList flows={flowsQuery.data || []} />
      </div>
    </section>
  );
}

function FlowsOverviewPage({ app }: { app: AppContextValue }) {
  const flowsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "flows"],
    queryFn: () => app.workspace!.listFlows(),
    enabled: !!app.workspace
  });
  const reason = unavailableReason("collaborationFlows", app.environment.capabilities);
  return (
    <section className="center-page page-fade">
      <div className="main-column">
        <PageTitle title="协作流程" subtitle="这里是跨空间概览。编辑流程时会进入所属协作空间。" />
        {reason && <InlineState title="真实后端暂未接入流程" detail={reason} />}
        <FlowList flows={flowsQuery.data || []} />
      </div>
    </section>
  );
}

function FlowList({ flows }: { flows: CollaborationFlow[] }) {
  if (!flows.length) return <EmptyState title="没有可显示的协作流程" detail="从空间时间线里的消息创建流程，或等待后端能力接入。" />;
  return (
    <div className="automation-list">
      {flows.map((flow) => (
        <Link className="automation-row" key={flow.id} to={`/spaces/${flow.spaceId}/flows/${flow.id}`}>
          <span>
            <h3>{flow.title}</h3>
            <p>{flow.trigger}</p>
            <small>{flow.status === "active" ? "运行中" : flow.status === "draft" ? "草稿" : flow.status}</small>
          </span>
          <ChevronRight size={16} />
        </Link>
      ))}
    </div>
  );
}

function FlowDetailPage({ app }: { app: AppContextValue }) {
  const { spaceId = "", flowId = "" } = useParams();
  const queryClient = useQueryClient();
  const flowQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, app.workspaceVersion, "flow", spaceId, flowId],
    queryFn: () => app.workspace!.getFlow(spaceId, flowId),
    enabled: !!app.workspace && !!spaceId && !!flowId
  });
  const complete = useMutation({
    mutationFn: () => app.workspace!.completeInboxItem(`inbox-approval-${spaceId}`, "approve"),
    onSuccess: () => {
      app.refreshWorkspace();
      return invalidateWorkspaceQueries(queryClient, app.mode);
    }
  });
  const flow = flowQuery.data;
  if (flowQuery.isLoading) return <InlinePage title="正在打开协作流程" />;
  if (!flow) return <InlinePage title="没有找到协作流程" detail="真实后端暂未接入流程，或该流程不存在。" action={<Link className="primary-button" to={`/spaces/${spaceId}/flows`}>返回流程列表</Link>} />;
  const waiting = flow.steps.find((step) => step.id === flow.waitingStepId && step.status === "waiting");
  return (
    <section className="center-page page-fade">
      <div className="main-column">
        <PageTitle title={flow.title} subtitle="默认以流程脚本表达发生什么、请求谁、等待什么。" action={<Link className="quiet-button" to={`/spaces/${spaceId}`}>回到空间</Link>} />
        <article className="flow-script">
          <header>
            <span>当</span>
            <strong>{flow.trigger}</strong>
          </header>
          <div className="workflow-steps">
            {flow.steps.map((step, index) => (
              <article className={clsx("workflow-step", step.status)} key={step.id}>
                <em>{String(index + 1).padStart(2, "0")}</em>
                <span>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </span>
              </article>
            ))}
          </div>
        </article>
        {waiting && app.environment.capabilities.approvals && (
          <div className="flow-run-card">
            <strong>{flow.title} 正在等待处理</strong>
            <small>{waiting.title}</small>
            <button className="primary-button" disabled={complete.isPending} onClick={() => complete.mutate()}>批准并继续</button>
          </div>
        )}
      </div>
    </section>
  );
}

function ParticipantsPage({ app }: { app: AppContextValue }) {
  const [query, setQuery] = useState("");
  const participantsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participants", query],
    queryFn: () => app.workspace!.searchParticipants(query),
    enabled: !!app.workspace && app.environment.capabilities.participantSearch
  });
  const reason = unavailableReason("participantSearch", app.environment.capabilities);
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title="参与者" subtitle="参与者可以沟通、进入空间、接收请求和承担流程步骤。" />
        <label className="page-search">
          <Search size={16} />
          <input placeholder="搜索参与者" value={query} onChange={(event) => setQuery(event.target.value)} disabled={!!reason} />
        </label>
        {reason && <InlineState title="无法搜索参与者" detail={reason} />}
        <div className="quiet-list">
          {(participantsQuery.data || []).map((participant) => <ParticipantLink key={participant.id} participant={participant} />)}
          {!participantsQuery.isLoading && !(participantsQuery.data || []).length && <p className="muted">没有找到参与者。</p>}
        </div>
      </div>
    </section>
  );
}

function ParticipantLink({ participant }: { participant: Participant }) {
  return (
    <Link className="participant-row" to={`/participants/${participant.id}`}>
      <ActorAvatar id={participant.id} size="md" />
      <span>
        <strong>{participant.displayName}</strong>
        <small>{participant.title || participant.handle || relationshipLabel(participant.relationship)}</small>
      </span>
      <ChevronRight size={15} />
    </Link>
  );
}

function ParticipantDetailPage({ app }: { app: AppContextValue }) {
  const { participantId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const participantQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participant", participantId],
    queryFn: () => app.workspace!.getParticipant(participantId),
    enabled: !!app.workspace && !!participantId
  });
  const directSpace = useMutation({
    mutationFn: () => app.workspace!.createDirectSpace(participantId),
    onSuccess: async (space) => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
      navigate(`/spaces/${space.id}`);
    }
  });
  const request = useMutation({
    mutationFn: () => app.workspace!.createContactRequest(participantId, "希望建立联系并开始协作。"),
    onSuccess: () => {
      app.refreshWorkspace();
      return invalidateWorkspaceQueries(queryClient, app.mode);
    }
  });
  const participant = participantQuery.data;
  if (participantQuery.isLoading) return <InlinePage title="正在打开参与者资料" />;
  if (!participant) return <InlinePage title="没有找到参与者" action={<Link className="primary-button" to="/participants">返回参与者</Link>} />;
  const canStart = participant.relationship === "connected" || participant.relationship === "self";
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow profile-static">
        <ActorAvatar id={participant.id} size="lg" />
        <h1>{participant.displayName}</h1>
        <p>{participant.description}</p>
        <dl className="profile-facts">
          <dt>身份属性</dt>
          <dd>{participant.kind === "human" ? "人类" : participant.kind === "agent" ? "智能体" : "未知"} · {participant.title || "参与者"}</dd>
          <dt>关系</dt>
          <dd>{relationshipLabel(participant.relationship)}</dd>
          {participant.connectionLabel && <><dt>连接</dt><dd>{participant.connectionLabel}</dd></>}
        </dl>
        <div className="button-row">
          <button className="primary-button" disabled={!canStart || directSpace.isPending} title={canStart ? undefined : "请先建立联系"} onClick={() => directSpace.mutate()}>
            开始一对一协作空间
          </button>
          {!canStart && <button className="quiet-button" disabled={request.isPending || !app.environment.capabilities.contactRequests} title={unavailableReason("contactRequests", app.environment.capabilities) || undefined} onClick={() => request.mutate()}>建立联系</button>}
          <button className="quiet-button" disabled title="邀请参与者加入已有空间需要从空间参与者页发起，当前后端协议未提供该能力。">邀请到已有空间</button>
        </div>
        {request.error && <p className="form-error">{(request.error as Error).message}</p>}
      </div>
    </section>
  );
}

function MessageView({ message, participants, canCreateFlow, onCreateFlow, createFlowPending }: {
  message: SpaceMessage;
  participants: Participant[];
  canCreateFlow: boolean;
  onCreateFlow: (messageId: string) => void;
  createFlowPending: boolean;
}) {
  const sender = participants.find((participant) => participant.id === message.senderId);
  if (message.kind !== "message") {
    return (
      <div className="tool-line">
        <span />
        <p>{message.blocks.map(blockText).join(" ")}</p>
      </div>
    );
  }
  return (
    <article className="space-message">
      <div className="message-author">
        <ActorAvatar id={sender?.id || "system"} size="sm" />
        <span>
          <strong>{sender?.displayName || "系统"}</strong>
          <small>{shortTime(message.createdAt)} · {deliveryLabel(message.deliveryState)}</small>
        </span>
      </div>
      <div className="content-card">
        {message.blocks.map((block, index) => <MessageBlockView block={block} key={`${message.id}-${index}`} />)}
      </div>
      <div className="message-actions">
        <button className="text-button" disabled={!canCreateFlow || createFlowPending || message.deliveryState === "sending"} title={canCreateFlow ? undefined : "当前环境暂不支持协作流程"} onClick={() => onCreateFlow(message.id)}>
          基于此消息创建协作流程
        </button>
      </div>
    </article>
  );
}

function MessageBlockView({ block }: { block: MessageBlock }) {
  if (block.type === "code") return <pre><code>{block.source}</code></pre>;
  if (block.type === "file") return <p>{block.name}{block.size ? ` · ${block.size}` : ""}</p>;
  if (block.type === "quote") return <blockquote>引用消息 {block.messageId}</blockquote>;
  if (block.type === "markdown") {
    return (
      <>
        {block.source.split("\n").filter(Boolean).map((line) => line.startsWith("- ")
          ? <ul key={line}><li>{line.slice(2)}</li></ul>
          : <p key={line}>{line}</p>)}
      </>
    );
  }
  return <p>{block.text}</p>;
}

export function Composer({ placeholder, sending, onSend, capabilities }: {
  placeholder: string;
  sending: boolean;
  onSend: (text: string) => void;
  capabilities: ProductCapabilities;
}) {
  const [value, setValue] = useState("");
  const [composing, setComposing] = useState(false);
  const submit = () => {
    const text = value.trim();
    if (!text || sending) return;
    onSend(text);
    setValue("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !composing) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <form className="floating-composer" onSubmit={(event) => {
      event.preventDefault();
      submit();
    }}>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        placeholder={placeholder}
      />
      <div className="composer-bottom">
        <div className="composer-actions">
          <DisabledAction icon={<Paperclip size={16} />} label="附件" reason={unavailableReason("attachments", capabilities)} />
          <DisabledAction icon={<AtSign size={16} />} label="提及" reason="提及选择器尚未接入，先用文本 @ 说明。" />
          <DisabledAction icon={<Code2 size={16} />} label="代码" reason={unavailableReason("richMessages", capabilities)} />
          <DisabledAction icon={<GitBranch size={16} />} label="流程动作" reason="请先从具体消息创建协作流程。" />
        </div>
        <button className={clsx("send-circle", value.trim() && "active")} aria-label="发送" disabled={!value.trim() || sending}>
          <Send size={17} />
        </button>
      </div>
      <small>Enter 发送 · Shift + Enter 换行</small>
    </form>
  );
}

function DisabledAction({ icon, label, reason }: { icon: ReactNode; label: string; reason: string | null }) {
  return <button type="button" disabled title={reason || `${label}尚未开放`}>{icon}</button>;
}

function SettingsPage({ app }: { app: AppContextValue }) {
  const [apiUrl, setApiUrl] = useState(app.apiBaseUrl);
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title="我的" subtitle="Demo 和真实后端是两个独立数据环境，切换时会离开当前环境。" />
        <div className="settings-list">
          <section>
            <h2>运行模式</h2>
            <div className="segmented">
              <button className={clsx(app.mode === "connected" && "active")} onClick={() => app.requestMode("connected")}>真实后端</button>
              <button className={clsx(app.mode === "demo" && "active")} onClick={() => app.requestMode("demo")}>演示数据</button>
            </div>
          </section>
          <section>
            <h2>Rust 后端地址</h2>
            <div className="inline-field">
              <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder="同源 /v1 代理" />
              <button onClick={() => app.setApiBaseUrl(apiUrl)}>保存</button>
            </div>
          </section>
          <section>
            <h2>主题</h2>
            <div className="segmented">
              <button className={clsx(app.theme === "light" && "active")} onClick={() => app.setTheme("light")}>浅色</button>
              <button className={clsx(app.theme === "dark" && "active")} onClick={() => app.setTheme("dark")}>深色</button>
            </div>
          </section>
          <section>
            <h2>会话</h2>
            <button className="danger-button" onClick={() => void app.logout()}>
              <LogOut size={16} />
              退出登录
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}

function AuthRequired({ app }: { app: AppContextValue }) {
  return (
    <section className="center-page page-fade">
      <div className="main-column compact auth-required">
        <img src="/brand/logo-symbol.svg" alt="" />
        <h1>连接真实后端</h1>
        <p>当前处于真实后端模式。登录后可以读取真实参与者、联系请求、协作空间和消息。</p>
        <div className="button-row">
          <Link className="primary-button" to="/login">登录</Link>
          <Link className="quiet-button" to="/register">注册</Link>
          <button className="quiet-button" onClick={() => app.requestMode("demo")}>使用演示数据</button>
        </div>
      </div>
    </section>
  );
}

function AuthPage({ app, kind }: { app: AppContextValue; kind: "login" | "register" }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({ username: "", password: "", nickname: "" });
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (values.username.length < 3) throw new Error("用户名至少 3 位");
      if (values.password.length < 8) throw new Error("密码至少 8 位");
      if (kind === "register" && !values.nickname.trim()) throw new Error("请填写昵称");
      if (kind === "register") await app.rustAdapter.register(values);
      const tokens = await app.rustAdapter.login(values);
      await app.setConnectedTokens(tokens, values.username);
    },
    onSuccess: () => navigate("/inbox"),
    onError: (err) => setError((err as Error).message)
  });

  return (
    <section className="auth-page page-fade">
      <div className="auth-preview-panel">
        <BrandHero />
        <div className="mini-transcript">
          <p>收件箱告诉你现在需要处理什么。</p>
          <p>协作空间保留完整上下文。</p>
        </div>
      </div>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        mutation.mutate();
      }}>
        <img src="/brand/logo-lockup.svg" alt="OpenPivot" />
        <h1>{kind === "login" ? "欢迎回来" : "创建 OpenPivot 身份"}</h1>
        <label>
          <span>用户名</span>
          <input value={values.username} onChange={(event) => setValues({ ...values, username: event.target.value })} autoComplete="username" />
        </label>
        {kind === "register" && (
          <label>
            <span>昵称</span>
            <input value={values.nickname} onChange={(event) => setValues({ ...values, nickname: event.target.value })} autoComplete="nickname" />
          </label>
        )}
        <label>
          <span>密码</span>
          <input value={values.password} type="password" onChange={(event) => setValues({ ...values, password: event.target.value })} autoComplete={kind === "login" ? "current-password" : "new-password"} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={mutation.isPending}>{kind === "login" ? "登录" : "注册并登录"}</button>
        <div className="auth-links">
          <Link to={kind === "login" ? "/register" : "/login"}>{kind === "login" ? "创建账号" : "已有账号"}</Link>
          <button type="button" onClick={() => app.requestMode("demo")}>使用演示数据</button>
        </div>
      </form>
    </section>
  );
}

function LegacyMessagesRedirect() {
  const [params] = useSearchParams();
  const chat = params.get("chat");
  if (!chat) return <Navigate to="/inbox" replace />;
  const spaceId = chat === "core" || chat === "release" || chat === "protocol" || chat === "orion" || chat === "lin" ? chat : "core";
  return <Navigate to={`/spaces/${spaceId}`} replace />;
}

function BootingPage() {
  return <InlinePage title="正在恢复登录态" detail="正在检查 Refresh Token 并读取当前用户。" />;
}

function BrandHero() {
  return (
    <div className="brand-hero">
      <img src="/brand/logo-symbol.svg" alt="" />
      <h1>OpenPivot</h1>
      <p>人与智能体平等协作的通信平台</p>
    </div>
  );
}

function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="page-title rich-title">
      <span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </span>
      {action}
    </header>
  );
}

function InlinePage({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <section className="center-page page-fade">
      <div className="main-column compact">
        <h1>{title}</h1>
        {detail && <p className="muted">{detail}</p>}
        {action}
      </div>
    </section>
  );
}

function InlineState({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="inline-state">
      <strong>{title}</strong>
      <small>{detail}</small>
    </article>
  );
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <article className="empty-state">
      <strong>{title}</strong>
      <small>{detail}</small>
      {action}
    </article>
  );
}

function ActorAvatar({ id, size = "md" }: { id: string; size?: "sm" | "md" | "lg" }) {
  const variant = avatarVariant(id);
  return (
    <span className={clsx("actor-avatar", `avatar-${size}`, `avatar-${variant}`)} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <circle className="avatar-bg" cx="24" cy="24" r="22" />
        <path d="M15 26c3-8 9-12 18-12 2 8-2 16-10 20-3-2-6-4-8-8Z" />
        {variant === "chen" && <path className="cut" d="M18 24h13" />}
        {variant === "orion" && <path className="cut" d="M24 19l5 5" />}
        {variant === "forge" && <path className="cut" d="M19 23h12M24 16l-3 17" />}
        {variant === "atlas" && <path className="cut" d="M18 28c5 0 10-3 14-9" />}
        <circle className="accent" cx={variant === "lin" ? 31 : 33} cy={variant === "guest" ? 31 : 16} r="3" />
      </svg>
    </span>
  );
}

function avatarVariant(id: string) {
  if (id.includes("lin")) return "lin";
  if (id.includes("chen")) return "chen";
  if (id.includes("orion")) return "orion";
  if (id.includes("forge")) return "forge";
  if (id.includes("atlas")) return "atlas";
  return "guest";
}

function inboxTarget(item: InboxItem) {
  if (item.flowId && item.spaceId) return `/spaces/${item.spaceId}/flows/${item.flowId}`;
  if (item.spaceId) return `/spaces/${item.spaceId}`;
  if (item.participantId) return `/participants/${item.participantId}`;
  return "/inbox";
}

function blockText(block: MessageBlock) {
  if (block.type === "text") return block.text;
  if (block.type === "markdown" || block.type === "code") return block.source;
  if (block.type === "file") return block.name;
  return block.messageId;
}

function shortDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function shortTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function deliveryLabel(state?: SpaceMessage["deliveryState"]) {
  if (state === "sending") return "发送中";
  if (state === "failed") return "发送失败，可重试";
  return "已发送";
}

function directSubtitle(participants: Participant[]) {
  const other = participants.find((participant) => participant.relationship !== "self");
  return other ? `${other.displayName} · ${other.title || "参与者"}` : "一对一协作空间";
}

function relationshipLabel(value: Participant["relationship"]) {
  if (value === "self") return "当前账号";
  if (value === "connected") return "已建立联系";
  if (value === "pending_inbound") return "等待你处理";
  if (value === "pending_outbound") return "联系请求已发送";
  return "未建立联系";
}

function accountName(app: AppContextValue) {
  if (app.session.status === "authenticated") return app.session.username || (app.mode === "demo" ? "Ling" : "已登录");
  if (app.session.status === "booting") return "恢复中";
  return "未登录";
}

function connectedLabel(session: SessionState) {
  if (session.status === "authenticated") return "真实后端";
  if (session.status === "booting") return "恢复登录态";
  if (session.status === "error") return "会话异常";
  return "未登录";
}

export default App;
