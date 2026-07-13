import { useQuery } from "@tanstack/react-query";
import { Command, MessageCircle, Moon, Plus, Search, Settings, Sun, Users, Workflow, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import type { AppContextValue } from "./AppContext";
import { unavailableReason } from "../domain/capabilities";
import type { CollaborationSpace, Participant, SessionState } from "../domain/models";
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
  const participantsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "sidebar-participants"],
    queryFn: () => app.workspace!.listParticipants(),
    enabled: !!app.workspace
  });
  const spaces = spacesQuery.data || [];
  const participants = participantsQuery.data || [];
  const pinned = spaces.filter((space) => space.pinned);
  const recent = [...spaces].sort((a, b) => String(b.lastActivityAt || "").localeCompare(String(a.lastActivityAt || ""))).slice(0, 6);

  return (
    <aside className="unified-sidebar" aria-label="Pivot 导航">
      <Link className="sidebar-brand" to="/spaces" aria-label="Pivot Home">
        <span>Pivot</span>
      </Link>

      <div className="sidebar-tools">
        <button className="sidebar-search command-trigger" onClick={onOpenCommand}>
          <Search size={15} />
          <span>搜索</span>
          <kbd><Command size={11} />K</kbd>
        </button>
        <button className="sidebar-add-button" aria-label="新建" onClick={() => setNewOpen(!newOpen)}><Plus size={17} /></button>
        {newOpen && <NewMenu app={app} onClose={() => setNewOpen(false)} />}
      </div>

      <nav className="primary-nav" aria-label="主要入口">
        <NavLink to="/participants">
          <Users size={16} />
          <span>协作者</span>
        </NavLink>
        <NavLink to="/spaces">
          <MessageCircle size={16} />
          <span>协作空间</span>
        </NavLink>
      </nav>

      <div className="sidebar-groups">
        <SidebarSpaceGroup title="置顶" spaces={pinned} participants={participants} currentUserId={app.environment.currentUserId} />
        <SidebarSpaceGroup title="最近" spaces={recent} participants={participants} currentUserId={app.environment.currentUserId} />
      </div>

      <footer className="sidebar-footer">
        <Link className="account-row" to="/settings">
          <ActorAvatar id={app.environment.currentUserId} size="sm" src={app.userProfile.avatarUrl} alt={accountName(app)} />
          <span>
            <strong>{accountName(app)}</strong>
            <small>{connectedLabel(app.session)}</small>
          </span>
        </Link>
        <div className="footer-actions">
          <Link to="/settings" title="设置" aria-label="设置"><Settings size={15} /></Link>
          <button title="切换主题" aria-label="切换主题" onClick={() => app.setTheme(app.theme === "dark" ? "light" : "dark")}>
            {app.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </footer>
    </aside>
  );
}

export function SidebarSpaceGroup({ title, spaces, participants, currentUserId }: {
  title: string;
  spaces: CollaborationSpace[];
  participants: Participant[];
  currentUserId: string;
}) {
  if (!spaces.length) return null;
  return (
    <section className="sidebar-group">
      <h2>{title}</h2>
      {spaces.map((space) => (
        <NavLink key={`${title}-${space.id}`} className="sidebar-row" to={`/spaces/${space.id}`}>
          <span className="sidebar-avatar-wrap">
            <ActorAvatar id={space.id} size="sm" src={space.avatarUrl || spaceAvatarParticipant(space, participants, currentUserId)?.avatarUrl} alt={space.title} />
            {!!space.unreadCount && <i className="unread-dot" />}
          </span>
          <span>
            <strong>{space.title}</strong>
            <small>{space.lastPreview || "还没有消息"}</small>
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
        创建空间
      </button> : <Link to="/spaces/new" onClick={onClose}>创建空间</Link>}
      <Link to="/participants" onClick={onClose}>添加好友</Link>
      {flowReason ? <button className="new-menu-action" disabled title={flowReason}>
        新建空间协作流程
      </button> : <Link to="/spaces" onClick={onClose}>新建空间协作流程</Link>}
    </div>
  );
}

function spaceAvatarParticipant(space: CollaborationSpace, participants: Participant[], currentUserId: string) {
  if (space.kind !== "direct") return undefined;
  const peerId = space.participantIds.find((participantId) => participantId !== currentUserId);
  return participants.find((participant) => participant.id === peerId);
}

export function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="移动端导航">
      <NavLink to="/spaces"><MessageCircle size={19} /><span>空间</span></NavLink>
      <NavLink to="/participants"><Users size={19} /><span>协作者</span></NavLink>
      <NavLink to="/flows"><Workflow size={19} /><span>流程</span></NavLink>
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
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索协作空间、参与者、协作流程或设置" />
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
            <CommandLink to="/settings" onClose={onClose} title="打开我的页面" detail="资料、身份、主题和会话" />
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
  if (app.userProfile.displayName) return app.userProfile.displayName;
  if (app.session.status === "authenticated") return app.session.username || `用户 ${app.session.userId}`;
  if (app.session.status === "booting") return "正在恢复";
  return "未登录";
}

function connectedLabel(session: SessionState) {
  if (session.status === "authenticated") return session.username ? `ID ${session.username}` : "后端未返回注册 ID";
  if (session.status === "booting") return "正在恢复登录态";
  if (session.status === "error") return session.message;
  return "需要登录";
}
