import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AtSign,
  Bell,
  ChevronRight,
  Code2,
  Command,
  GitBranch,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Sun,
  Users,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { DemoAdapter } from "./adapters/demoAdapter";
import { RustHttpAdapter } from "./adapters/rustHttpAdapter";
import { LocalRefreshTokenStore } from "./adapters/tokenStore";
import { defaultApiBaseUrl } from "./config";
import type { Actor, Conversation, Message, ProductMode, UserSummary } from "./types";

type ThemeMode = "light" | "dark";
type HealthState = "demo" | "checking" | "online" | "offline";

interface AppState {
  mode: ProductMode;
  setMode: (mode: ProductMode) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  apiBaseUrl: string;
  setApiBaseUrl: (url: string) => void;
  adapter: RustHttpAdapter | DemoAdapter;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  currentUserId: number | null;
  setCurrentUserId: (id: number | null) => void;
  currentUsername: string;
  setCurrentUsername: (username: string) => void;
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
  health: HealthState;
  refreshHealth: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}

interface SidebarItem {
  id: string;
  label: string;
  meta?: string;
  to: string;
  unread?: boolean;
}

interface Participant extends Actor {
  specialty: string;
  avatar: AvatarVariant;
}

interface ThreadMessage {
  id: string;
  actorId: string;
  at: string;
  type: "human" | "agent" | "meta";
  text?: string;
  paragraphs?: string[];
  bullets?: string[];
  code?: string;
  table?: Array<[string, string]>;
  tool?: string;
  reaction?: string;
}

interface AutomationItem {
  id: string;
  title: string;
  scope: string;
  meta: string;
}

type AvatarVariant = "lin" | "chen" | "orion" | "forge" | "atlas" | "guest";

const tokenStore = new LocalRefreshTokenStore();

const participants: Participant[] = [
  {
    id: "lin",
    kind: "human",
    displayName: "林舟",
    handle: "@lin",
    role: "owner",
    specialty: "产品负责人",
    avatar: "lin",
    description: "负责版本节奏、发布判断和成员协作边界。"
  },
  {
    id: "chen",
    kind: "human",
    displayName: "陈默",
    handle: "@chen",
    role: "member",
    specialty: "协议审阅",
    avatar: "chen",
    description: "关注协议一致性、后端风险和上线前的人工确认。"
  },
  {
    id: "orion",
    kind: "agent",
    displayName: "北辰规划",
    handle: "@orion",
    role: "member",
    specialty: "任务规划",
    avatar: "orion",
    description: "根据协作空间上下文拆解阶段计划和执行顺序。"
  },
  {
    id: "forge",
    kind: "agent",
    displayName: "砺锋后端",
    handle: "@forge",
    role: "member",
    specialty: "后端开发",
    avatar: "forge",
    description: "整理后端实现建议、风险点和接口变更草案。"
  },
  {
    id: "atlas",
    kind: "agent",
    displayName: "星图前端",
    handle: "@atlas",
    role: "member",
    specialty: "界面协作",
    avatar: "atlas",
    description: "梳理产品界面状态、交互细节和前端接入约定。"
  }
];

const sidebarGroups: Array<{ title: string; items: SidebarItem[] }> = [
  {
    title: "最近",
    items: [
      { id: "core", label: "OpenPivot 核心开发", meta: "协作空间 · 10:31", to: "/messages?chat=core", unread: true },
      { id: "lin", label: "林舟", meta: "参与者 · 10:12", to: "/messages?chat=lin" },
      { id: "release", label: "发布协作室", meta: "协作空间 · 09:48", to: "/messages?chat=core" },
      { id: "chen", label: "陈默", meta: "参与者 · 09:42", to: "/messages?chat=chen" },
      { id: "orion", label: "北辰规划", meta: "参与者 · 09:36", to: "/messages?chat=orion" },
      { id: "atlas", label: "星图前端", meta: "参与者 · 周日", to: "/messages?chat=atlas" }
    ]
  }
];

const threadMessages: ThreadMessage[] = [
  {
    id: "m1",
    actorId: "lin",
    at: "10:24",
    type: "human",
    text: "这版客户端要如实展示当前后端已经支持的能力，同时让用户看到协作编排的方向。"
  },
  {
    id: "m2",
    actorId: "orion",
    at: "10:25",
    type: "agent",
    paragraphs: ["我会把协作空间里的消息、成员动作和审批节点串成一个可编排流程，消息入口仍然保持 IM 的自然节奏。"],
    bullets: ["最近会话统一承载协作空间和参与者记录", "协作流程用低代码画布表达触发、执行和审批关系", "参与者作为能力目录存在，身份属性只在资料页展示"],
    table: [
      ["协作空间", "按最近时间排列所有空间和参与者对话"],
      ["协作流程", "采用 Dify 式节点画布，支持触发器、执行节点和审批节点"],
      ["参与者", "替代传统好友列表，保留人员和 AI 成员的统一入口"]
    ],
    reaction: "已确认"
  },
  {
    id: "tool-1",
    actorId: "orion",
    at: "10:25",
    type: "meta",
    tool: "正在读取协议文件"
  },
  {
    id: "m3",
    actorId: "chen",
    at: "10:26",
    type: "human",
    text: "可以。成员在会话里应该自然并列出现，需要说明角色时放在资料页或详情里。"
  },
  {
    id: "m4",
    actorId: "atlas",
    at: "10:31",
    type: "agent",
    paragraphs: ["界面上我会收掉无意义的新建入口，让用户先看到最近发生的协作和参与者消息。"],
    code: `if (mode === "demo") {
  showModeHint("侧栏底部的小字");
}`
  }
];

const automationItems: AutomationItem[] = [
  { id: "dev", title: "开发协作", scope: "在 OpenPivot 核心开发中运行", meta: "消息触发 · 6 个步骤 · 已关闭" },
  { id: "review", title: "协议审阅", scope: "在协议设计中运行", meta: "手动触发 · 3 个步骤 · 已关闭" },
  { id: "handoff", title: "前后端交接", scope: "在发布协作室中运行", meta: "人工确认 · 4 个步骤 · 预览" }
];

const recentConversations = [
  { id: "core", title: "OpenPivot 核心开发", meta: "协作空间 · 5 位成员", preview: "北辰规划整理了发布客户端的下一步计划。", time: "10:31", unread: true, avatar: "guest" as AvatarVariant },
  { id: "lin", title: "林舟", meta: "参与者 · 产品负责人", preview: "先把核心对话体验收住。", time: "10:12", avatar: "lin" as AvatarVariant },
  { id: "release", title: "发布协作室", meta: "协作空间 · 6 位成员", preview: "林舟把发布窗口更新到了今晚。", time: "09:48", avatar: "lin" as AvatarVariant },
  { id: "chen", title: "陈默", meta: "参与者 · 协议审阅", preview: "最近记录直接进入同一条列表。", time: "09:42", avatar: "chen" as AvatarVariant },
  { id: "orion", title: "北辰规划", meta: "参与者 · 任务规划", preview: "我会按协作上下文继续拆解。", time: "09:36", avatar: "orion" as AvatarVariant },
  { id: "protocol", title: "协议设计", meta: "协作空间 · 接口变更", preview: "陈默留下了两条待确认边界。", time: "昨天", avatar: "chen" as AvatarVariant },
  { id: "atlas", title: "星图前端", meta: "参与者 · 界面协作", preview: "消息页需要更像日常入口。", time: "周日", avatar: "atlas" as AvatarVariant }
];

function App() {
  const [mode, setModeState] = useState<ProductMode>(() => (localStorage.getItem("openpivot.web.mode") as ProductMode) || "demo");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const visualSystem = localStorage.getItem("openpivot.web.visualSystem");
    return visualSystem === "marvis" ? ((localStorage.getItem("openpivot.web.theme") as ThemeMode) || "light") : "light";
  });
  const [apiBaseUrl, setApiBaseUrl] = useState(() => localStorage.getItem("openpivot.web.apiBaseUrl") || defaultApiBaseUrl());
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUsername, setCurrentUsername] = useState(() => localStorage.getItem("openpivot.web.username") || "");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const adapter = useMemo(() => {
    if (mode === "demo") return new DemoAdapter();
    const rustAdapter = new RustHttpAdapter({ baseUrl: apiBaseUrl, refreshTokenStore: tokenStore });
    rustAdapter.setAccessToken(accessToken);
    return rustAdapter;
  }, [mode, apiBaseUrl, accessToken]);

  const healthQuery = useQuery({
    queryKey: ["health", mode, apiBaseUrl],
    queryFn: () => adapter.health(),
    enabled: mode === "connected",
    refetchInterval: mode === "connected" ? 15000 : false
  });

  const meQuery = useQuery({
    queryKey: ["me", mode, accessToken],
    queryFn: () => adapter.me(),
    enabled: mode === "demo" || (mode === "connected" && !!accessToken),
    retry: false
  });

  useEffect(() => {
    localStorage.setItem("openpivot.web.mode", mode);
    localStorage.setItem("openpivot.web.theme", theme);
    localStorage.setItem("openpivot.web.visualSystem", "marvis");
    localStorage.setItem("openpivot.web.apiBaseUrl", apiBaseUrl);
    if (currentUsername) localStorage.setItem("openpivot.web.username", currentUsername);
    document.documentElement.dataset.theme = theme;
  }, [mode, theme, apiBaseUrl, currentUsername]);

  useEffect(() => {
    if (meQuery.data?.user_id) setCurrentUserId(meQuery.data.user_id);
  }, [meQuery.data]);

  const setMode = useCallback((nextMode: ProductMode) => {
    setModeState(nextMode);
    setAccessToken(null);
    setCurrentUserId(null);
    setActiveConversationId(null);
    queryClient.clear();
  }, [queryClient]);

  const health: HealthState = mode === "demo"
    ? "demo"
    : healthQuery.status === "success"
      ? "online"
      : healthQuery.status === "error"
        ? "offline"
        : "checking";

  const appState: AppState = {
    mode,
    setMode,
    theme,
    setTheme,
    apiBaseUrl,
    setApiBaseUrl,
    adapter,
    accessToken,
    setAccessToken,
    currentUserId,
    setCurrentUserId,
    currentUsername,
    setCurrentUsername,
    activeConversationId,
    setActiveConversationId,
    health,
    refreshHealth: () => void healthQuery.refetch(),
    queryClient
  };

  return (
    <Routes>
      <Route element={<Shell app={appState} />}>
        <Route index element={<Navigate to="/messages" replace />} />
        <Route path="/messages" element={<MessagesPage app={appState} />} />
        <Route path="/contacts" element={<ParticipantsPage />} />
        <Route path="/agents" element={<Navigate to="/contacts" replace />} />
        <Route path="/requests" element={<RequestsPage app={appState} />} />
        <Route path="/profile" element={<ProfilePage app={appState} />} />
        <Route path="/workflows" element={<AutomationPage />} />
        <Route path="/connections" element={<Navigate to="/messages" replace />} />
        <Route path="/settings" element={<SettingsPage app={appState} />} />
        <Route path="/login" element={<AuthPage app={appState} kind="login" />} />
        <Route path="/register" element={<AuthPage app={appState} kind="register" />} />
        <Route path="*" element={<Navigate to="/messages" replace />} />
      </Route>
    </Routes>
  );
}

function Shell({ app }: { app: AppState }) {
  return (
    <div className="op-shell">
      <UnifiedSidebar app={app} />
      <main className="op-main">
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}

function UnifiedSidebar({ app }: { app: AppState }) {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const activeChat = search.get("chat");
  const accountName = app.currentUsername || (app.mode === "demo" ? "Ling" : "未登录");

  return (
    <aside className="unified-sidebar" aria-label="OpenPivot 导航">
      <Link className="sidebar-brand" to="/messages" aria-label="OpenPivot Home">
        <img src="/brand/logo-symbol.svg" alt="" />
        <span>OpenPivot</span>
      </Link>

      <label className="sidebar-search">
        <Search size={15} />
        <input placeholder="搜索" data-global-search />
        <kbd><Command size={11} />K</kbd>
      </label>

      <nav className="primary-nav" aria-label="主要入口">
        <NavLink to="/messages">
          <MessageCircle size={16} />
          <span>协作空间</span>
        </NavLink>
        <NavLink to="/workflows">
          <GitBranch size={16} />
          <span>协作流程</span>
        </NavLink>
        <NavLink to="/contacts">
          <Users size={16} />
          <span>参与者</span>
        </NavLink>
      </nav>

      <div className="sidebar-groups">
        {sidebarGroups.map((group) => (
          <section key={group.title} className="sidebar-group">
            <h2>{group.title}</h2>
            {group.items.map((item) => {
              const itemChat = new URLSearchParams(item.to.split("?")[1] || "").get("chat");
              const isActive = item.to === "/messages" ? location.pathname === "/messages" && !activeChat : activeChat === itemChat;
              return (
                <Link key={item.id} className={clsx("sidebar-row", isActive && "active")} to={item.to}>
                  {item.unread && <span className="unread-dot" />}
                  <span>
                    <strong>{item.label}</strong>
                    {item.meta && <small>{item.meta}</small>}
                  </span>
                </Link>
              );
            })}
          </section>
        ))}
      </div>

      <footer className="sidebar-footer">
        <Link className="account-row" to="/profile">
          <ActorAvatar variant="guest" size="sm" />
          <span>
            <strong>{accountName}</strong>
            <small>{app.mode === "demo" ? "Demo" : connectionLabel(app.health)}</small>
          </span>
        </Link>
        <div className="footer-actions">
          <button title="通知" aria-label="通知"><Bell size={15} /></button>
          <Link to="/settings" title="设置" aria-label="设置"><Settings size={15} /></Link>
          <button title="切换主题" aria-label="切换主题" onClick={() => app.setTheme(app.theme === "dark" ? "light" : "dark")}>
            {app.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </footer>
    </aside>
  );
}

function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="移动端导航">
      <NavLink to="/messages"><MessageCircle size={19} /><span>空间</span></NavLink>
      <NavLink to="/workflows"><GitBranch size={19} /><span>流程</span></NavLink>
      <NavLink to="/contacts"><Users size={19} /><span>参与者</span></NavLink>
      <NavLink to="/settings"><Settings size={19} /><span>我的</span></NavLink>
    </nav>
  );
}

function MessagesPage({ app }: { app: AppState }) {
  const [params] = useSearchParams();
  const chat = params.get("chat");
  if (app.mode === "connected" && !app.currentUserId) return <AuthRequired app={app} />;
  if (app.mode === "connected") return <ConnectedMessagesPage app={app} />;
  return chat ? <ChatCanvas chatId={chat} /> : <HomeCanvas />;
}

function HomeCanvas() {
  return (
    <section className="messages-home page-fade">
      <div className="messages-home-column">
        <header className="messages-home-head">
          <div>
            <h1>协作空间</h1>
            <p>协作空间和参与者对话按最近时间排列。</p>
          </div>
          <Link className="quiet-button" to="/contacts"><Users size={16} />查看参与者</Link>
        </header>

        <section className="conversation-section">
          <h2>最近</h2>
          <div className="conversation-list">
            {recentConversations.map((row) => (
              <Link key={row.id} className="conversation-home-row" to={`/messages?chat=${row.id === "protocol" || row.id === "release" ? "core" : row.id}`}>
                <ActorAvatar variant={row.avatar} size="md" />
                <span>
                  <strong>{row.title}</strong>
                  <small>{row.meta}</small>
                  <em>{row.preview}</em>
                </span>
                <time>{row.time}</time>
                {row.unread && <i aria-label="未读" />}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function BrandHero() {
  return (
    <div className="brand-hero">
      <img src="/brand/logo-symbol.svg" alt="" />
      <h1>OpenPivot</h1>
      <p>成员在同一个空间协作</p>
    </div>
  );
}

function ChatCanvas({ chatId }: { chatId: string }) {
  const title = chatTitle(chatId);
  return (
    <section className="chat-canvas page-fade">
      <header className="chat-header">
        <Link className="mobile-back-link" to="/messages">返回</Link>
        <div>
          <h1>{title}</h1>
          <p>5 位成员 · 协作流程运行中</p>
        </div>
        <button className="quiet-icon" aria-label="对话详情"><Menu size={17} /></button>
      </header>

      <div className="message-column">
        {threadMessages.map((message) => (
          <ThreadMessageView key={message.id} message={message} />
        ))}
      </div>

      <FloatingComposer placeholder={`给 ${title} 发送消息…`} />
    </section>
  );
}

function ThreadMessageView({ message }: { message: ThreadMessage }) {
  const actor = participantById(message.actorId);
  if (message.type === "meta") {
    return (
      <div className="tool-line">
        <span />
        <p>{message.tool}</p>
      </div>
    );
  }

  if (message.type === "human") {
    return (
      <article className="human-message">
        <p>{message.text}</p>
        <time>{actor.displayName} · {message.at}</time>
      </article>
    );
  }

  return (
    <article className="agent-message">
      <div className="message-author">
        <ActorAvatar variant={actor.avatar} size="sm" />
        <span>
          <strong>{actor.displayName}</strong>
          <small>{message.at}</small>
        </span>
      </div>
      <div className="content-card">
        {message.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {message.bullets && (
          <ul>
            {message.bullets.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
        {message.table && (
          <table>
            <tbody>
              {message.table.map(([label, value]) => (
                <tr key={label}><th>{label}</th><td>{value}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {message.code && <pre><code>{message.code}</code></pre>}
      </div>
      {message.reaction && <span className="reaction-note">{message.reaction}</span>}
    </article>
  );
}

function FloatingComposer({ placeholder, onSend }: { placeholder: string; onSend?: (text: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    onSend?.(text);
    setValue("");
  };

  return (
    <form className="floating-composer" onSubmit={submit}>
      <textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} />
      <div className="composer-bottom">
        <div className="composer-actions">
          <button type="button" title="附件"><Paperclip size={16} /></button>
          <button type="button" title="提及"><AtSign size={16} /></button>
          <button type="button" title="代码"><Code2 size={16} /></button>
          <button type="button" title="工作流动作"><GitBranch size={16} /></button>
        </div>
        <button className={clsx("send-circle", value.trim() && "active")} aria-label="发送">
          <Send size={17} />
        </button>
      </div>
      <small>Enter 发送 · Shift + Enter 换行</small>
    </form>
  );
}

function ConnectedMessagesPage({ app }: { app: AppState }) {
  const conversationsQuery = useQuery({
    queryKey: ["conversations", app.mode, app.currentUserId],
    queryFn: () => app.adapter.listConversations(),
    enabled: !!app.currentUserId,
    refetchInterval: 8000
  });
  const friendsQuery = useQuery({
    queryKey: ["friends", app.mode, app.currentUserId],
    queryFn: () => app.adapter.listFriends(),
    enabled: !!app.currentUserId
  });
  const conversations = conversationsQuery.data || [];
  const friends = friendsQuery.data || [];
  const activeId = app.activeConversationId || conversations[0]?.id || null;
  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const messagesQuery = useQuery({
    queryKey: ["messages", app.mode, activeId],
    queryFn: () => app.adapter.listMessages(activeId!),
    enabled: !!activeId,
    refetchInterval: 5000
  });
  const sendMutation = useMutation({
    mutationFn: (content: string) => app.adapter.sendMessage(activeId!, content),
    onSuccess: () => app.queryClient.invalidateQueries({ queryKey: ["messages"] })
  });

  if (!activeConversation) {
    return (
      <section className="center-page page-fade">
        <div className="main-column compact">
          <h1>真实后端会话</h1>
          <p className="muted">已连接后端，但当前账号还没有可打开的会话。</p>
          <Link className="text-link" to="/contacts">查看参与者目录</Link>
        </div>
      </section>
    );
  }

  const title = peerName(activeConversation, friends, app.currentUserId);
  return (
    <section className="chat-canvas page-fade">
      <header className="chat-header">
        <div>
          <h1>{title}</h1>
          <p>真实后端 · 轮询同步</p>
        </div>
        <button className="quiet-icon" aria-label="更多"><MoreHorizontal size={17} /></button>
      </header>
      <div className="message-column">
        {(messagesQuery.data || []).map((message) => (
          <ConnectedMessage key={message.id} message={message} mine={message.sender_id === app.currentUserId} />
        ))}
      </div>
      <FloatingComposer placeholder={`给 ${title} 发送消息…`} onSend={(text) => sendMutation.mutate(text)} />
    </section>
  );
}

function ConnectedMessage({ message, mine }: { message: Message; mine: boolean }) {
  return (
    <article className={clsx("human-message", !mine && "incoming")}>
      <p>{message.content}</p>
      <time>{shortTime(message.created_at)}</time>
    </article>
  );
}

function ParticipantsPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? participantById(activeId) : null;
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title="参与者" />
        <label className="page-search">
          <Search size={16} />
          <input placeholder="搜索参与者" />
        </label>
        <div className="quiet-list">
          <h2>最近</h2>
          {participants.map((actor) => (
            <button key={actor.id} className="participant-row" onClick={() => setActiveId(actor.id)}>
              <ActorAvatar variant={actor.avatar} size="md" />
              <span>
                <strong>{actor.displayName}</strong>
                <small>{actor.specialty}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      </div>
      <ProfileDrawer actor={active} onClose={() => setActiveId(null)} />
    </section>
  );
}

function ProfileDrawer({ actor, onClose }: { actor: Participant | null; onClose: () => void }) {
  if (!actor) return null;
  return (
    <aside className="side-drawer page-fade" aria-label={`${actor.displayName} 资料`}>
      <button className="drawer-close" onClick={onClose} aria-label="关闭"><X size={17} /></button>
      <ActorAvatar variant={actor.avatar} size="lg" />
      <h2>{actor.displayName}</h2>
      <p>{actor.description}</p>
      <dl>
        <dt>身份</dt>
        <dd>{actor.specialty}</dd>
        <dt>能力</dt>
        <dd>协议评审、任务拆解、协作同步</dd>
        <dt>共同对话</dt>
        <dd>OpenPivot 核心开发</dd>
      </dl>
      <Link className="primary-button" to={`/messages?chat=${actor.id}`}>发消息</Link>
    </aside>
  );
}

function AutomationPage() {
  const [selectedStep, setSelectedStep] = useState("planner");
  const nodes = [
    { id: "start", type: "触发器", title: "收到 #开发 消息", desc: "来自 OpenPivot 核心开发", x: 46, y: 64 },
    { id: "scope", type: "人工确认", title: "林舟确认范围", desc: "明确目标、风险和窗口", x: 254, y: 64 },
    { id: "planner", type: "规划", title: "北辰规划拆解", desc: "生成可执行步骤", x: 462, y: 64 },
    { id: "backend", type: "执行", title: "砺锋后端实现协议", desc: "输出接口草案", x: 254, y: 232 },
    { id: "frontend", type: "执行", title: "星图前端实现界面", desc: "完成客户端接入", x: 462, y: 232 },
    { id: "review", type: "审批", title: "陈默审阅", desc: "确认后进入发布", x: 356, y: 400 }
  ];
  const selectedNode = nodes.find((node) => node.id === selectedStep) || nodes[2];
  return (
    <section className="workflow-page page-fade">
      <header className="workflow-topbar">
        <div>
          <h1>协作流程</h1>
          <p>像搭建 Dify 工作流一样，把协作空间里的消息触发、成员动作和审批节点编排起来。</p>
        </div>
        <div className="workflow-topbar-actions">
          <button className="quiet-button"><Plus size={16} />新建流程</button>
          <button className="primary-button">保存</button>
        </div>
      </header>

      <div className="workflow-builder">
        <aside className="flow-library">
          <section>
            <h2>流程</h2>
            {automationItems.map((item) => (
              <button key={item.id} className={clsx("flow-list-row", item.id === "dev" && "active")}>
                <strong>{item.title}</strong>
                <small>{item.meta}</small>
              </button>
            ))}
          </section>
          <section>
            <h2>节点</h2>
            {["消息触发", "成员输入", "模型调用", "条件分支", "人工审批", "写入协作空间"].map((item) => (
              <button key={item} className="node-palette-item"><Plus size={14} />{item}</button>
            ))}
          </section>
        </aside>

        <div className="workflow-canvas-panel">
          <div className="canvas-toolbar">
            <span>开发协作</span>
            <small>预览 · 6 个节点 · 当前版本未发布</small>
            <div>
              <button>−</button>
              <button>100%</button>
              <button>+</button>
            </div>
          </div>
          <div className="flow-canvas">
            <svg className="flow-lines" viewBox="0 0 720 560" aria-hidden="true">
              <path d="M206 102 H254" />
              <path d="M414 102 H462" />
              <path d="M542 156 C542 196 334 196 334 232" />
              <path d="M542 156 V232" />
              <path d="M334 324 C334 366 436 366 436 400" />
              <path d="M542 324 C542 366 436 366 436 400" />
            </svg>
            {nodes.map((node) => (
              <FlowCanvasNode key={node.id} node={node} selected={node.id === selectedStep} onSelect={() => setSelectedStep(node.id)} />
            ))}
          </div>
        </div>

        <aside className="flow-inspector">
          <h2>节点配置</h2>
          <span className="node-type">{selectedNode.type}</span>
          <h3>{selectedNode.title}</h3>
          <label>
            <span>说明</span>
            <textarea value={selectedNode.desc} readOnly />
          </label>
          <label>
            <span>输入</span>
            <input value="当前协作空间上下文" readOnly />
          </label>
          <label>
            <span>输出到</span>
            <input value="OpenPivot 核心开发" readOnly />
          </label>
          <button className="quiet-button">测试此节点</button>
        </aside>
      </div>
    </section>
  );
}

function FlowCanvasNode({ node, selected, onSelect }: { node: { id: string; type: string; title: string; desc: string; x: number; y: number }; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={clsx("flow-canvas-node", selected && "selected")}
      style={{ left: node.x, top: node.y }}
      onClick={onSelect}
    >
      <small>{node.type}</small>
      <strong>{node.title}</strong>
      <span>{node.desc}</span>
    </button>
  );
}

function SettingsPage({ app }: { app: AppState }) {
  const [apiUrl, setApiUrl] = useState(app.apiBaseUrl);
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title="我的" />
        <div className="settings-list">
          <section>
            <h2>运行模式</h2>
            <div className="segmented">
              <button className={clsx(app.mode === "connected" && "active")} onClick={() => app.setMode("connected")}>真实后端</button>
              <button className={clsx(app.mode === "demo" && "active")} onClick={() => app.setMode("demo")}>演示数据</button>
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
            <button className="danger-button" onClick={async () => {
              await app.adapter.logout();
              tokenStore.clear();
              app.setAccessToken(null);
              app.setCurrentUserId(null);
            }}>
              <LogOut size={16} />
              退出登录
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}

function AuthRequired({ app }: { app: AppState }) {
  return (
    <section className="center-page page-fade">
      <div className="main-column compact auth-required">
        <img src="/brand/logo-symbol.svg" alt="" />
        <h1>连接真实后端</h1>
        <p>当前处于真实后端模式。登录后可以读取联系人、会话和消息。</p>
        <div className="button-row">
          <Link className="primary-button" to="/login">登录</Link>
          <Link className="quiet-button" to="/register">注册</Link>
          <button className="quiet-button" onClick={() => app.setMode("demo")}>使用演示数据</button>
        </div>
      </div>
    </section>
  );
}

function AuthPage({ app, kind }: { app: AppState; kind: "login" | "register" }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({ username: "", password: "", nickname: "" });
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (values.username.length < 3) throw new Error("用户名至少 3 位");
      if (values.password.length < 8) throw new Error("密码至少 8 位");
      if (kind === "register" && !values.nickname.trim()) throw new Error("请填写昵称");
      if (kind === "register") await app.adapter.register(values);
      const tokens = await app.adapter.login(values);
      app.setAccessToken(tokens.accessToken);
      app.setCurrentUsername(values.username);
      const me = await app.adapter.me();
      app.setCurrentUserId(me.user_id);
      await app.queryClient.invalidateQueries();
    },
    onSuccess: () => navigate("/messages"),
    onError: (err) => setError((err as Error).message)
  });

  return (
    <section className="auth-page page-fade">
      <div className="auth-preview-panel">
        <BrandHero />
        <div className="mini-transcript">
          <p>北辰规划整理了下一步协作计划。</p>
          <p>陈默等待协议审阅确认。</p>
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
          <button type="button" onClick={() => app.setMode("demo")}>使用演示数据</button>
        </div>
      </form>
    </section>
  );
}

function RequestsPage({ app }: { app: AppState }) {
  const requestsQuery = useQuery({
    queryKey: ["requests", app.mode, app.currentUserId],
    queryFn: () => app.adapter.listFriendRequests(),
    enabled: app.mode === "demo" || !!app.currentUserId
  });
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title="好友请求" />
        <div className="quiet-list">
          {(requestsQuery.data || []).map((request) => (
            <article className="request-row" key={request.id}>
              <ActorAvatar variant="guest" size="md" />
              <span>
                <strong>用户 {request.requester_id}</strong>
                <small>{request.message || "对方未填写申请说明"}</small>
              </span>
            </article>
          ))}
          {!requestsQuery.data?.length && <p className="muted">暂无待处理请求。</p>}
        </div>
      </div>
    </section>
  );
}

function ProfilePage({ app }: { app: AppState }) {
  const actor: Participant = {
    id: "me",
    kind: "human",
    displayName: app.currentUsername || "Ling",
    handle: app.currentUserId ? `#${app.currentUserId}` : "@demo",
    role: "owner",
    specialty: "当前账号",
    avatar: "guest",
    description: "当前 OpenPivot 使用身份。"
  };
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow profile-static">
        <ActorAvatar variant={actor.avatar} size="lg" />
        <h1>{actor.displayName}</h1>
        <p>{actor.description}</p>
        <Link className="primary-button" to="/settings">打开设置</Link>
      </div>
    </section>
  );
}

function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="page-title">
      <h1>{title}</h1>
      {action}
    </header>
  );
}

function ActorAvatar({ variant, size = "md" }: { variant: AvatarVariant; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={clsx("actor-avatar", `avatar-${size}`, `avatar-${variant}`)} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <circle className="avatar-bg" cx="24" cy="24" r="22" />
        {variant === "lin" && (
          <>
            <path d="M15 29c4-11 14-13 19-7 2 3 1 7-2 10-5 4-12 2-17-3Z" />
            <circle className="accent" cx="31" cy="17" r="3" />
          </>
        )}
        {variant === "chen" && (
          <>
            <path d="M15 18h17c3 0 5 2 5 5v4c0 4-3 7-8 7H15V18Z" />
            <path className="cut" d="M20 24h12" />
            <circle className="accent" cx="17" cy="31" r="3" />
          </>
        )}
        {variant === "orion" && (
          <>
            <path d="M13 28c6-9 14-14 23-15-2 8-7 16-16 22l-3-4-4-3Z" />
            <path className="cut" d="M25 20l4 4" />
            <circle className="accent" cx="34" cy="14" r="3" />
          </>
        )}
        {variant === "forge" && (
          <>
            <path d="M17 14h13l5 7-11 13-11-13 4-7Z" />
            <path className="cut" d="M18 22h13M23 15l-3 18" />
            <circle className="accent" cx="35" cy="29" r="3" />
          </>
        )}
        {variant === "atlas" && (
          <>
            <path d="M14 29c4-9 10-13 19-14 2 8-2 15-9 19-4-1-7-3-10-5Z" />
            <path className="cut" d="M18 28c5 0 10-3 14-9" />
            <circle className="accent" cx="17" cy="17" r="3" />
          </>
        )}
        {variant === "guest" && (
          <>
            <path d="M15 26c3-8 9-12 18-12 2 8-2 16-10 20-3-2-6-4-8-8Z" />
            <circle className="accent" cx="32" cy="31" r="3" />
          </>
        )}
      </svg>
    </span>
  );
}

function participantById(id: string) {
  return participants.find((actor) => actor.id === id) || participants[0];
}

function chatTitle(id: string) {
  if (id === "core") return "OpenPivot 核心开发";
  const actor = participants.find((item) => item.id === id);
  return actor?.displayName || "OpenPivot 对话";
}

function connectionLabel(health: HealthState) {
  if (health === "online") return "已连接";
  if (health === "offline") return "离线";
  return "检查中";
}

function peerName(conversation: Conversation, friends: UserSummary[], currentUserId: number | null) {
  const peerId = conversation.user_low_id === currentUserId ? conversation.user_high_id : conversation.user_low_id;
  return friends.find((friend) => friend.id === peerId)?.nickname || `用户 ${peerId}`;
}

function shortTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export default App;
