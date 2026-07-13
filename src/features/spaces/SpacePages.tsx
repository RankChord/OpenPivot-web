import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronRight, Megaphone, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import type { AppContextValue } from "../../app/AppContext";
import { invalidateWorkspaceQueries } from "../../app/AppContext";
import { unavailableReason } from "../../domain/capabilities";
import type { CollaborationSpace, Participant, SpaceMessage } from "../../domain/models";
import { ActorAvatar } from "../../components/avatar/ActorAvatar";
import { Composer } from "../../components/composer/Composer";
import { EmptyState, InlinePage, InlineState, PageTitle } from "../../components/feedback/Feedback";
import { MessageView } from "../../components/message/MessageView";
import { FlowList } from "../flows/FlowPages";
import { ParticipantLink } from "../participants/ParticipantPages";
import { directSubtitle, relationshipLabel, shortDate } from "../../shared/format";
export function SpacesPage({ app }: { app: AppContextValue }) {
  const spacesQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "spaces"],
    queryFn: () => app.workspace!.listSpaces(),
    enabled: !!app.workspace
  });
  const participantsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participants"],
    queryFn: () => app.workspace!.listParticipants(),
    enabled: !!app.workspace
  });
  const spaces = spacesQuery.data || [];
  const participants = participantsQuery.data || [];
  const groupReason = unavailableReason("groupSpaces", app.environment.capabilities);
  const createAction = groupReason
    ? <Link className="quiet-button" to="/participants">查找参与者</Link>
    : <Link className="quiet-button" to="/spaces/new"><Plus size={16} />创建空间</Link>;
  const emptyAction = groupReason
    ? <Link className="primary-button" to="/participants">查找参与者</Link>
    : <Link className="primary-button" to="/spaces/new">创建协作空间</Link>;
  return (
    <section className="center-page page-fade">
      <div className="main-column">
        <PageTitle title="协作空间" subtitle="所有对话都发生在协作空间中，一对一只是成员更少的空间。" action={createAction} />
        {spacesQuery.isLoading && <InlineState title="正在读取协作空间" detail="从当前数据环境加载。" />}
        {!spacesQuery.isLoading && !spaces.length && <EmptyState title="还没有协作空间" detail={groupReason ? "从参与者开始一对一协作，或在支持多人空间的环境创建空间。" : "创建第一个空间，选择参与者，然后发送第一条消息。"} action={emptyAction} />}
        <div className="conversation-list">
          {spaces.map((space) => (
            <Link key={space.id} className="conversation-home-row" to={`/spaces/${space.id}`}>
              <ActorAvatar id={space.id} size="md" src={space.avatarUrl || spaceAvatarParticipant(space, participants, app.environment.currentUserId)?.avatarUrl} alt={space.title} />
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

export function CreateSpacePage({ app }: { app: AppContextValue }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [displayId, setDisplayId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const participantsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participants"],
    queryFn: () => app.workspace!.listParticipants(),
    enabled: !!app.workspace
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!app.workspace?.createSpace) throw new Error(unavailableReason("groupSpaces", app.environment.capabilities) || "当前环境不能创建多人协作空间");
      return app.workspace.createSpace({ title, displayId: supportsCustomSpaceId ? displayId : undefined, participantIds: selected });
    },
    onSuccess: async (space) => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
      navigate(`/spaces/${space.id}`);
    }
  });
  const reason = unavailableReason("groupSpaces", app.environment.capabilities);
  const supportsCustomSpaceId = app.mode === "demo";
  const spaceIdReady = !supportsCustomSpaceId || !!displayId.trim();
  const canSubmit = !reason && !!title.trim() && spaceIdReady && selected.length > 0 && !create.isPending;
  const submitReason = reason || (!title.trim() ? "请填写协作空间名称" : !spaceIdReady ? "请填写创建后不可更改的空间 ID" : !selected.length ? "请至少选择一位已建立联系的参与者" : undefined);
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title="新建协作空间" subtitle="选择已建立联系的参与者，人类与智能体使用同一个选择器。" />
        {reason && <InlineState title="当前环境不可创建多人空间" detail={reason} />}
        <form className="create-space-form" onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}>
          <label>
            <span>空间名称</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：发布协作室" disabled={!!reason} />
          </label>
          <label>
            <span>空间 ID</span>
            <input
              value={displayId}
              onChange={(event) => setDisplayId(event.target.value)}
              placeholder={supportsCustomSpaceId ? "例如：release-room" : "当前后端未接入自定义空间 ID"}
              disabled={!!reason || !supportsCustomSpaceId}
            />
            <small>{supportsCustomSpaceId ? "创建后不可更改，仅支持字母、数字、下划线和短横线。" : "需要后端在创建空间接口中增加不可变的公开空间 ID 字段。"}</small>
          </label>
          <section className="participant-picker">
            <h2>参与者</h2>
            {(participantsQuery.data || []).filter((participant) => participant.relationship !== "self").map((participant) => {
              const checked = selected.includes(participant.id);
              const unavailable = !!reason || participant.relationship !== "connected";
              return (
                <label key={participant.id} className={clsx("picker-row", checked && "selected")}>
                  <input type="checkbox" checked={checked} disabled={unavailable} title={participant.relationship === "connected" ? undefined : relationshipLabel(participant.relationship)} onChange={(event) => {
                    setSelected((current) => event.target.checked ? [...current, participant.id] : current.filter((id) => id !== participant.id));
                  }} />
                  <ActorAvatar id={participant.id} size="sm" src={participant.avatarUrl} alt={participant.displayName} />
                  <span><strong>{participant.displayName}</strong><small>{participant.relationship === "connected" ? participant.title || participant.handle : relationshipLabel(participant.relationship)}</small></span>
                </label>
              );
            })}
          </section>
          {create.error && <p className="form-error">{(create.error as Error).message}</p>}
          <button className="primary-button" disabled={!canSubmit} title={canSubmit ? undefined : submitReason}>创建并进入空间</button>
        </form>
      </div>
    </section>
  );
}

export function SpaceTimelinePage({ app }: { app: AppContextValue }) {
  const { spaceId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const spaceQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "space", spaceId],
    queryFn: () => app.workspace!.getSpace(spaceId),
    enabled: !!app.workspace && !!spaceId
  });
  const space = spaceQuery.data;
  const resolvedSpaceId = space?.id || spaceId;
  const participantsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participants"],
    queryFn: () => app.workspace!.listParticipants(),
    enabled: !!app.workspace && !!space
  });
  const messagesQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "messages", resolvedSpaceId],
    queryFn: () => app.workspace!.listMessages(space!.id),
    enabled: !!app.workspace && !!space,
    refetchInterval: app.mode === "connected" ? 5000 : false
  });
  const sendMutation = useMutation({
    mutationFn: ({ text, clientId }: { text: string; clientId: string }) => app.workspace!.sendMessage(space!.id, text, clientId),
    onMutate: async ({ text, clientId }) => {
      await queryClient.cancelQueries({ queryKey: ["workspace", app.mode, app.session, "messages", resolvedSpaceId] });
      const optimistic: SpaceMessage = {
        id: clientId,
        spaceId: resolvedSpaceId,
        senderId: app.environment.currentUserId,
        kind: "message",
        blocks: [{ type: "text", text }],
        createdAt: new Date().toISOString(),
        deliveryState: "sending"
      };
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", resolvedSpaceId], (current = []) => [...current, optimistic]);
      return { clientId };
    },
    onSuccess: (message, _variables, context) => {
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", resolvedSpaceId], (current = []) => current.map((item) => item.id === context?.clientId ? message : item));
      void queryClient.invalidateQueries({ queryKey: ["workspace", app.mode, app.session, "spaces"] });
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", resolvedSpaceId], (current = []) => current.map((item) => item.id === context?.clientId ? { ...item, deliveryState: "failed" } : item));
    }
  });
  const createFlow = useMutation({
    mutationFn: (messageId: string) => app.workspace!.createFlowFromMessage(space!.id, messageId),
    onSuccess: async (flow) => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
      navigate(`/spaces/${flow.spaceId}/flows/${flow.id}`);
    }
  });
  const retryMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!app.workspace?.retryMessage) throw new Error("当前环境暂不支持消息重试");
      return app.workspace.retryMessage(space!.id, messageId);
    },
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ["workspace", app.mode, app.session, "messages", resolvedSpaceId] });
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", resolvedSpaceId], (current = []) => current.map((item) => item.id === messageId ? { ...item, deliveryState: "sending" } : item));
    },
    onSuccess: (message) => {
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", resolvedSpaceId], (current = []) => current.map((item) => item.id === message.id ? message : item));
      void queryClient.invalidateQueries({ queryKey: ["workspace", app.mode, app.session, "spaces"] });
    },
    onError: (_error, messageId) => {
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", resolvedSpaceId], (current = []) => current.map((item) => item.id === messageId ? { ...item, deliveryState: "failed" } : item));
    }
  });

  const participants = participantsQuery.data || [];
  const messages = messagesQuery.data || [];
  useEffect(() => {
    if (!location.hash || messagesQuery.isLoading) return;
    const messageId = decodeURIComponent(location.hash.slice(1));
    if (!messageId) return;
    const timeout = window.setTimeout(() => {
      const target = document.getElementById(messageId);
      target?.scrollIntoView({ block: "center" });
      target?.classList.add("message-anchor-focus");
      window.setTimeout(() => target?.classList.remove("message-anchor-focus"), 1800);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [location.hash, messages.length, messagesQuery.isLoading, spaceId]);
  if (spaceQuery.isLoading) return <InlinePage title="正在打开协作空间" />;
  if (!space) return <InlinePage title="没有找到协作空间" detail="这个空间不存在，或当前环境没有权限访问。" action={<Link className="primary-button" to="/spaces">返回空间列表</Link>} />;
  const isDirectChat = !!space.sourceConversationId;

  return (
    <section className={clsx("chat-canvas page-fade", isDirectChat && "direct-chat")}>
      <SpaceHeader space={space} participants={participants} />
      {!isDirectChat && <SpaceInfoPanel space={space} participants={participants} app={app} />}
      <div className="message-column">
        {messages.map((message) => (
          <MessageView
            key={message.id}
            message={message}
            participants={participants}
            currentUserId={app.environment.currentUserId}
            canCreateFlow={app.environment.capabilities.collaborationFlows && !isDirectChat}
            onCreateFlow={(messageId) => createFlow.mutate(messageId)}
            createFlowPending={createFlow.isPending}
            onRetryMessage={app.workspace?.retryMessage ? (messageId) => retryMutation.mutate(messageId) : undefined}
            retryPending={retryMutation.isPending}
          />
        ))}
        {!messages.length && <EmptyState title="还没有消息" detail={isDirectChat ? "发送第一条消息开始聊天。" : "发送第一条消息开始协作。"} />}
      </div>
      <Composer
        placeholder={`${isDirectChat ? "给" : "给"} ${space.title} 发送消息...`}
        sending={sendMutation.isPending}
        onSend={(text) => sendMutation.mutate({ text, clientId: `local-${Date.now()}` })}
        capabilities={app.environment.capabilities}
      />
    </section>
  );
}

export function SpaceHeader({ space, participants }: { space: CollaborationSpace; participants: Participant[] }) {
  const spaceParticipants = participants.filter((participant) => space.participantIds.includes(participant.id));
  const isDirectChat = !!space.sourceConversationId;
  return (
    <header className="chat-header space-header">
      <Link className="mobile-back-link" to="/spaces">返回</Link>
      <div className="space-header-title">
        {!isDirectChat && <ActorAvatar id={space.id} size="md" src={space.avatarUrl} alt={space.title} />}
        <span>
          <h1>{space.title}</h1>
          <p>{isDirectChat ? "私聊" : space.kind === "direct" ? directSubtitle(spaceParticipants) : `${spaceParticipants.length} 位参与者`}{!isDirectChat && space.hasActiveFlow ? " · 有协作流程运行" : ""}</p>
        </span>
      </div>
      {!isDirectChat && <nav className="space-tabs">
        <NavLink to={`/spaces/${space.id}`}>对话</NavLink>
        <NavLink to={`/spaces/${space.id}/participants`}>参与者</NavLink>
        <NavLink to={`/spaces/${space.id}/flows`}>协作流程</NavLink>
      </nav>}
    </header>
  );
}

export function SpaceInfoPanel({ space, participants, app }: { space: CollaborationSpace; participants: Participant[]; app: AppContextValue }) {
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: space.title, avatarUrl: space.avatarUrl || "" });
  const spaceParticipants = participants.filter((participant) => space.participantIds.includes(participant.id));
  const visibleMembers = spaceParticipants.slice(0, 8);
  const history = space.announcementHistory || [];
  const canEditSpace = !!app.workspace?.updateSpace;
  const editUnavailableReason = "当前后端还没有接入空间名称和头像更新接口。";
  const updateSpace = useMutation({
    mutationFn: async () => {
      if (!app.workspace?.updateSpace) throw new Error(editUnavailableReason);
      return app.workspace.updateSpace(space.id, draft);
    },
    onSuccess: async () => {
      setEditing(false);
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
    }
  });

  useEffect(() => {
    setDraft({ title: space.title, avatarUrl: space.avatarUrl || "" });
  }, [space.id, space.title, space.avatarUrl]);

  function readSpaceAvatar(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") setDraft((current) => ({ ...current, avatarUrl: reader.result as string }));
    });
    reader.readAsDataURL(file);
  }

  return (
    <section className="space-info-panel">
      <div className="space-info-main">
        <span>
          <small>空间头像</small>
          <ActorAvatar id={space.id} size="md" src={space.avatarUrl} alt={space.title} />
        </span>
        <span>
          <small>空间名称</small>
          <strong>{space.title}</strong>
        </span>
        <span>
          <small>{space.sourceConversationId ? "对话 ID" : "空间 ID"}</small>
          <strong>{space.displayId || (space.sourceConversationId ? String(space.sourceConversationId) : "后端未返回公开空间 ID")}</strong>
        </span>
        <button className="quiet-button" type="button" disabled={!canEditSpace} title={canEditSpace ? undefined : editUnavailableReason} onClick={() => setEditing((open) => !open)}>
          编辑资料
        </button>
        <span className="space-info-wide">
          <small>空间介绍</small>
          <p>{space.description || "这个空间还没有填写介绍。"}</p>
        </span>
      </div>

      {editing && (
        <form className="space-profile-editor" onSubmit={(event) => {
          event.preventDefault();
          updateSpace.mutate();
        }}>
          <button className="avatar-edit-button" type="button" onClick={() => avatarInputRef.current?.click()} aria-label="更换空间头像">
            <ActorAvatar id={space.id} size="md" src={draft.avatarUrl} alt={draft.title} />
          </button>
          <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => readSpaceAvatar(event.target.files?.[0])} />
          <label>
            <span>空间名称</span>
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <span>
            <small>空间 ID 创建后不可更改</small>
            <strong>{space.displayId || "当前后端未接入公开空间 ID"}</strong>
          </span>
          <button className="primary-button" disabled={!draft.title.trim() || updateSpace.isPending}>保存空间资料</button>
          {updateSpace.error && <p className="form-error">{(updateSpace.error as Error).message}</p>}
        </form>
      )}

      <div className="space-announcement">
        <span>
          <Megaphone size={15} />
          <strong>空间公告</strong>
        </span>
        <p>{space.announcement || "暂无公告"}</p>
        <button type="button" onClick={() => setHistoryOpen((open) => !open)} aria-expanded={historyOpen}>
          历史公告
          <ChevronRight size={14} />
        </button>
        {historyOpen && (
          <div className="announcement-history">
            {history.map((item, index) => <p key={`${space.id}-announcement-${index}`}>{item}</p>)}
            {!history.length && <p className="muted">暂无历史公告。</p>}
          </div>
        )}
      </div>

      <div className="space-member-strip">
        <span>
          <strong>协作成员</strong>
          <small>{space.participantIds.length} 位</small>
        </span>
        <div>
          {visibleMembers.map((participant) => (
            <Link key={participant.id} to={`/participants/${participant.id}`} title={participant.displayName}>
              <ActorAvatar id={participant.id} size="sm" src={participant.avatarUrl} alt={participant.displayName} />
              <small>{participant.displayName}</small>
            </Link>
          ))}
          {!visibleMembers.length && <small className="muted">成员信息加载中</small>}
        </div>
      </div>
    </section>
  );
}

export function SpaceParticipantsPage({ app }: { app: AppContextValue }) {
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
  if (spaceQuery.isLoading) return <InlinePage title="正在打开参与者" />;
  if (!space) return <InlinePage title="没有找到协作空间" detail="这个参与者列表必须属于一个真实协作空间。" action={<Link className="primary-button" to="/spaces">返回空间列表</Link>} />;
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

export function SpaceFlowsPage({ app }: { app: AppContextValue }) {
  const { spaceId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const spaceQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "space", spaceId],
    queryFn: () => app.workspace!.getSpace(spaceId),
    enabled: !!app.workspace && !!spaceId
  });
  const space = spaceQuery.data;
  const flowsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "flows", spaceId],
    queryFn: () => app.workspace!.listFlows(spaceId),
    enabled: !!app.workspace && !!spaceId && !!space
  });
  const reason = unavailableReason("collaborationFlows", app.environment.capabilities);
  const createFlow = useMutation({
    mutationFn: () => {
      if (!space) throw new Error("没有找到协作空间");
      return app.workspace!.createFlow({ spaceId: space.id });
    },
    onSuccess: async (flow) => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
      navigate(`/spaces/${flow.spaceId}/flows/${flow.id}`);
    }
  });
  if (spaceQuery.isLoading) return <InlinePage title="正在打开协作流程" />;
  if (!space) return <InlinePage title="没有找到协作空间" detail="协作流程必须属于一个真实协作空间。" action={<Link className="primary-button" to="/spaces">返回空间列表</Link>} />;
  const action = reason
    ? <button className="quiet-button" disabled title={reason}>新建流程草稿</button>
    : <button className="quiet-button" disabled={createFlow.isPending} onClick={() => createFlow.mutate()}>新建流程草稿</button>;
  return (
    <section className="center-page page-fade">
      <div className="main-column">
        <PageTitle title={`${space.title} · 协作流程`} subtitle="流程属于当前协作空间，负责请求参与者并等待回复或审批。" action={<div className="button-row">{action}<Link className="quiet-button" to={`/spaces/${space.id}`}>回到对话</Link></div>} />
        {reason && <InlineState title="当前环境暂未接入协作流程" detail={reason} />}
        {createFlow.error && <p className="form-error">{(createFlow.error as Error).message}</p>}
        <FlowList flows={flowsQuery.data || []} />
      </div>
    </section>
  );
}

function spaceAvatarParticipant(space: CollaborationSpace, participants: Participant[], currentUserId: string) {
  if (space.kind !== "direct") return undefined;
  const peerId = space.participantIds.find((participantId) => participantId !== currentUserId);
  return participants.find((participant) => participant.id === peerId);
}
