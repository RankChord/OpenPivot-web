import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
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
import { directSubtitle, shortDate } from "../../shared/format";
export function SpacesPage({ app }: { app: AppContextValue }) {
  const spacesQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "spaces"],
    queryFn: () => app.workspace!.listSpaces(),
    enabled: !!app.workspace
  });
  const spaces = spacesQuery.data || [];
  const groupReason = unavailableReason("groupSpaces", app.environment.capabilities);
  const createAction = groupReason
    ? <Link className="quiet-button" to="/participants">查找参与者</Link>
    : <Link className="quiet-button" to="/spaces/new"><Plus size={16} />新建</Link>;
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

export function CreateSpacePage({ app }: { app: AppContextValue }) {
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

export function SpaceTimelinePage({ app }: { app: AppContextValue }) {
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
  const retryMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!app.workspace?.retryMessage) throw new Error("当前环境暂不支持消息重试");
      return app.workspace.retryMessage(spaceId, messageId);
    },
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ["workspace", app.mode, app.session, "messages", spaceId] });
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", spaceId], (current = []) => current.map((item) => item.id === messageId ? { ...item, deliveryState: "sending" } : item));
    },
    onSuccess: (message) => {
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", spaceId], (current = []) => current.map((item) => item.id === message.id ? message : item));
      void queryClient.invalidateQueries({ queryKey: ["workspace", app.mode, app.session, "spaces"] });
    },
    onError: (_error, messageId) => {
      queryClient.setQueryData<SpaceMessage[]>(["workspace", app.mode, app.session, "messages", spaceId], (current = []) => current.map((item) => item.id === messageId ? { ...item, deliveryState: "failed" } : item));
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
            onRetryMessage={app.workspace?.retryMessage ? (messageId) => retryMutation.mutate(messageId) : undefined}
            retryPending={retryMutation.isPending}
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

export function SpaceHeader({ space, participants }: { space: CollaborationSpace; participants: Participant[] }) {
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

export function SpaceFlowsPage({ app }: { app: AppContextValue }) {
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
