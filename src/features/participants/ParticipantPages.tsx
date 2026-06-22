import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
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
import { ChevronRight, Search } from "lucide-react";
import { useState } from "react";
