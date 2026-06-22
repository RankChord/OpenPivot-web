import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { AppContextValue } from "../../app/AppContext";
import { invalidateWorkspaceQueries } from "../../app/AppContext";
import { unavailableReason } from "../../domain/capabilities";
import type { Participant } from "../../domain/models";
import { ActorAvatar } from "../../components/avatar/ActorAvatar";
import { EmptyState, InlinePage, InlineState, PageTitle } from "../../components/feedback/Feedback";
import { directSubtitle, relationshipLabel } from "../../shared/format";
export function ParticipantsPage({ app }: { app: AppContextValue }) {
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

export function ParticipantLink({ participant }: { participant: Participant }) {
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

export function ParticipantDetailPage({ app }: { app: AppContextValue }) {
  const { participantId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [inviteSpaceId, setInviteSpaceId] = useState("");
  const participantQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participant", participantId],
    queryFn: () => app.workspace!.getParticipant(participantId),
    enabled: !!app.workspace && !!participantId
  });
  const spacesQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "spaces"],
    queryFn: () => app.workspace!.listSpaces(),
    enabled: !!app.workspace
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
  const invite = useMutation({
    mutationFn: async () => app.workspace!.inviteParticipantToSpace(inviteSpaceId, participantId),
    onSuccess: async (space) => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
      navigate(`/spaces/${space.id}/participants`);
    }
  });
  const participant = participantQuery.data;
  if (participantQuery.isLoading) return <InlinePage title="正在打开参与者资料" />;
  if (!participant) return <InlinePage title="没有找到参与者" action={<Link className="primary-button" to="/participants">返回参与者</Link>} />;
  const isSelf = participant.relationship === "self";
  const canStart = participant.relationship === "connected";
  const canRequest = participant.relationship === "none";
  const startReason = isSelf ? "这是当前身份，不能和自己创建一对一协作空间" : "请先建立联系";
  const inviteReason = unavailableReason("spaceInvites", app.environment.capabilities);
  const canInvite = participant.relationship === "connected" && !inviteReason;
  const inviteSpaces = (spacesQuery.data || []).filter((space) => !space.participantIds.includes(participant.id));
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
          <button className="primary-button" disabled={!canStart || directSpace.isPending} title={canStart ? undefined : startReason} onClick={() => directSpace.mutate()}>
            开始一对一协作空间
          </button>
          {canRequest && <button className="quiet-button" disabled={request.isPending || !app.environment.capabilities.contactRequests} title={unavailableReason("contactRequests", app.environment.capabilities) || undefined} onClick={() => request.mutate()}>建立联系</button>}
        </div>
        {!isSelf && (
          <section className="participant-picker profile-invite">
            <h2>邀请加入空间</h2>
            {inviteReason && <InlineState title="当前环境不可邀请" detail={inviteReason} />}
            {!inviteReason && participant.relationship !== "connected" && <InlineState title="请先建立联系" detail="建立联系后，才能邀请参与者进入已有协作空间。" />}
            {canInvite && !spacesQuery.isLoading && !inviteSpaces.length && <p className="muted">没有可邀请的协作空间。</p>}
            {canInvite && inviteSpaces.map((space) => {
              const selected = inviteSpaceId === space.id;
              return (
                <label key={space.id} className={clsx("picker-row", selected && "selected")}>
                  <input type="radio" name="inviteSpace" value={space.id} checked={selected} onChange={() => setInviteSpaceId(space.id)} />
                  <span><strong>{space.title}</strong><small>{space.kind === "direct" ? "一对一协作空间" : `${space.participantIds.length} 位参与者`}</small></span>
                </label>
              );
            })}
            {canInvite && <button className="quiet-button" disabled={!inviteSpaceId || invite.isPending} onClick={() => invite.mutate()}>邀请到已有空间</button>}
          </section>
        )}
        {request.error && <p className="form-error">{(request.error as Error).message}</p>}
        {invite.error && <p className="form-error">{(invite.error as Error).message}</p>}
      </div>
    </section>
  );
}
