import { useQuery } from "@tanstack/react-query";
import { Bell, Command, Inbox, MessageCircle, Moon, Plus, Search, Settings, Sun, Users, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import type { AppContextValue } from "./AppContext";
import { unavailableReason } from "../domain/capabilities";
import type { CollaborationSpace, SessionState } from "../domain/models";
import { ActorAvatar } from "../components/avatar/ActorAvatar";
export function Shell({ app }: { app: AppContextValue }) {
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

export function UnifiedSidebar({ app, onOpenCommand, newOpen, setNewOpen }: {
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

export function SidebarSpaceGroup({ title, spaces }: { title: string; spaces: CollaborationSpace[] }) {
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

export function NewMenu({ app, onClose }: { app: AppContextValue; onClose: () => void }) {
  const groupReason = unavailableReason("groupSpaces", app.environment.capabilities);
  const flowReason = unavailableReason("collaborationFlows", app.environment.capabilities);
  return (
    <div className="new-menu">
      {groupReason ? <button className="new-menu-action" disabled title={groupReason}>
        新建协作空间
      </button> : <Link to="/spaces/new" onClick={onClose}>新建协作空间</Link>}
      <Link to="/participants" onClick={onClose}>与参与者开始对话</Link>
      <Link to="/participants" onClick={onClose}>建立联系</Link>
      {flowReason ? <button className="new-menu-action" disabled title={flowReason}>
        新建协作流程
      </button> : <Link to="/flows/new" onClick={onClose}>新建协作流程</Link>}
    </div>
  );
}

export function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="移动端导航">
      <NavLink to="/inbox"><Inbox size={19} /><span>收件箱</span></NavLink>
      <NavLink to="/spaces"><MessageCircle size={19} /><span>空间</span></NavLink>
      <NavLink to="/participants"><Users size={19} /><span>参与者</span></NavLink>
      <NavLink to="/settings"><Settings size={19} /><span>我的</span></NavLink>
    </nav>
  );
}

export function CommandPanel({ app, onClose }: { app: AppContextValue; onClose: () => void }) {
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

export function CommandSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function CommandLink({ to, title, detail, onClose }: { to: string; title: string; detail: string; onClose: () => void }) {
  return (
    <Link className="command-result" to={to} onClick={onClose}>
      <strong>{title}</strong>
      <small>{detail}</small>
    </Link>
  );
}
function accountName(app: AppContextValue) {
  if (app.mode === "demo") return "Ling";
  if (app.session.status === "authenticated") return app.session.username || `用户 ${app.session.userId}`;
  if (app.session.status === "booting") return "正在恢复";
  return "未登录";
}

function connectedLabel(session: SessionState) {
  if (session.status === "authenticated") return "真实后端已连接";
  if (session.status === "booting") return "正在恢复登录态";
  if (session.status === "error") return session.message;
  return "需要登录";
}
