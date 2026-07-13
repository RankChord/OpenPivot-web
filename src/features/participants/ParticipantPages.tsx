import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, ChevronRight, MessageCircle, MoreHorizontal, Plus, Search, Star, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { AppContextValue } from "../../app/AppContext";
import { invalidateWorkspaceQueries } from "../../app/AppContext";
import { ActorAvatar } from "../../components/avatar/ActorAvatar";
import { InlinePage, InlineState, PageTitle } from "../../components/feedback/Feedback";
import { unavailableReason } from "../../domain/capabilities";
import type { CollaborationSpace, ContactRequest, Participant } from "../../domain/models";
import { relationshipLabel, shortDate } from "../../shared/format";

const starredStorageKey = "pivot.web.starredParticipants";

export function ParticipantsPage({ app }: { app: AppContextValue }) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"friends" | "requests">("friends");
  const [addOpen, setAddOpen] = useState(false);
  const [menuParticipantId, setMenuParticipantId] = useState<string | null>(null);
  const [starred, toggleStarred] = useStarredParticipants();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const participantsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participants"],
    queryFn: () => app.workspace!.listParticipants(),
    enabled: !!app.workspace
  });
  const spacesQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "spaces"],
    queryFn: () => app.workspace!.listSpaces(),
    enabled: !!app.workspace
  });
  const requestsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "contact-requests"],
    queryFn: () => app.workspace!.listContactRequests(),
    enabled: !!app.workspace && app.environment.capabilities.contactRequests
  });
  const directSpace = useMutation({
    mutationFn: (participantId: string) => app.workspace!.createDirectSpace(participantId),
    onSuccess: async (space) => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
      navigate(`/spaces/${space.id}`);
    }
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
  const participants = participantsQuery.data || [];
  const spaces = spacesQuery.data || [];
  const friends = participants.filter((participant) => participant.relationship === "connected");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFriends = friends.filter((participant) => {
    if (!normalizedQuery) return true;
    return participant.displayName.toLowerCase().includes(normalizedQuery)
      || participantDisplayId(participant).toLowerCase().includes(normalizedQuery)
      || String(participant.sourceId ?? participant.id).toLowerCase().includes(normalizedQuery)
      || participant.handle?.toLowerCase().includes(normalizedQuery);
  });
  const requests = requestsQuery.data || [];
  const inboundRequests = requests.filter((request) => request.participant.relationship === "pending_inbound");
  const outboundRequests = requests.filter((request) => request.participant.relationship === "pending_outbound");
  const requestsUnavailable = unavailableReason("contactRequests", app.environment.capabilities);

  return (
    <section className="center-page page-fade">
      <div className="main-column participants-column">
        <PageTitle
          title="协作者"
          subtitle="管理已经建立联系的协作者，以及待处理的协作申请。"
          action={<button className="primary-button" onClick={() => setAddOpen(true)}><Plus size={16} />添加协作者</button>}
        />

        <div className="participant-switch" role="tablist" aria-label="协作者页面">
          <button className={clsx(activeTab === "friends" && "active")} role="tab" aria-selected={activeTab === "friends"} onClick={() => setActiveTab("friends")}>
            协作者 <span>{friends.length}</span>
          </button>
          <button className={clsx(activeTab === "requests" && "active")} role="tab" aria-selected={activeTab === "requests"} onClick={() => setActiveTab("requests")}>
            协作申请 {requests.length > 0 && <em>{requests.length}</em>}
          </button>
        </div>

        {activeTab === "friends" ? (
          <>
            <label className="page-search participant-search">
              <Search size={16} />
              <input placeholder="搜索已添加的协作者" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="participant-filter-bar" aria-label="协作者筛选">
              <button className="active">全部</button>
              <button disabled title="接口待接入">最近协作</button>
              <button disabled title="接口待接入">星标</button>
              <button disabled title="接口待接入">分组</button>
            </div>
            <section className="participant-list-section">
              <h2>全部好友({visibleFriends.length})</h2>
              <div className="friend-list">
                {visibleFriends.map((participant) => (
                  <FriendCard
                    key={participant.id}
                    participant={participant}
                    spaces={spaces}
                    currentUserId={app.environment.currentUserId}
                    starred={starred.has(participant.id)}
                    menuOpen={menuParticipantId === participant.id}
                    onToggleStar={() => toggleStarred(participant.id)}
                    onOpenMenu={() => setMenuParticipantId((current) => current === participant.id ? null : participant.id)}
                    onChat={() => directSpace.mutate(participant.id)}
                    chatPending={directSpace.isPending}
                  />
                ))}
                {!participantsQuery.isLoading && !visibleFriends.length && <p className="muted">没有找到已添加的协作者。</p>}
              </div>
              {directSpace.error && <p className="form-error">{(directSpace.error as Error).message}</p>}
            </section>
          </>
        ) : (
          <section className="request-sections">
            {requestsUnavailable && <InlineState title="当前环境不可处理协作申请" detail={requestsUnavailable} />}
            <RequestSection
              title={`接收到的待处理好友申请(${inboundRequests.length})`}
              empty="没有待处理的协作申请。"
              requests={inboundRequests}
              spaces={spaces}
              currentUserId={app.environment.currentUserId}
              variant="inbound"
              onAccept={(requestId) => acceptRequest.mutate(requestId)}
              onReject={(requestId) => rejectRequest.mutate(requestId)}
              pending={acceptRequest.isPending || rejectRequest.isPending}
            />
            <RequestSection
              title={`发出的协作申请(${outboundRequests.length})`}
              empty="没有发出的协作申请。"
              requests={outboundRequests}
              spaces={spaces}
              currentUserId={app.environment.currentUserId}
              variant="outbound"
              onReject={(requestId) => rejectRequest.mutate(requestId)}
              pending={rejectRequest.isPending}
            />
            {(acceptRequest.error || rejectRequest.error) && <p className="form-error">{((acceptRequest.error || rejectRequest.error) as Error).message}</p>}
          </section>
        )}
      </div>
      {addOpen && <AddCollaboratorDialog app={app} onClose={() => setAddOpen(false)} />}
    </section>
  );
}

function FriendCard({
  chatPending,
  currentUserId,
  menuOpen,
  onChat,
  onOpenMenu,
  onToggleStar,
  participant,
  spaces,
  starred
}: {
  chatPending: boolean;
  currentUserId: string;
  menuOpen: boolean;
  onChat: () => void;
  onOpenMenu: () => void;
  onToggleStar: () => void;
  participant: Participant;
  spaces: CollaborationSpace[];
  starred: boolean;
}) {
  const commonSpaces = commonSpacesFor(participant, spaces, currentUserId);
  return (
    <article className="friend-card">
      <ActorAvatar id={participant.id} size="md" src={participant.avatarUrl} alt={participant.displayName} />
      <Link className="friend-card-main" to={`/participants/${participant.id}`}>
        <strong>{participant.displayName}<IdentityBadge participant={participant} /></strong>
        <small>ID {participantDisplayId(participant)}</small>
      </Link>
      <span className="friend-star-slot" aria-label={starred ? "已星标" : undefined}>
        {starred && <Star size={16} fill="currentColor" />}
      </span>
      <span className="friend-card-spacer" />
      <span className="friend-common-button">
        共同空间 {commonSpaces.length}
      </span>
      <button className="friend-icon-button" type="button" disabled={chatPending} onClick={onChat} aria-label={`和 ${participant.displayName} 聊天`}>
        <MessageCircle size={17} />
      </button>
      <div className="friend-menu-wrap">
        <button className="friend-icon-button" type="button" onClick={onOpenMenu} aria-label={`${participant.displayName} 更多操作`}>
          <MoreHorizontal size={18} />
        </button>
        {menuOpen && (
          <div className="friend-action-menu">
            <button type="button" onClick={onToggleStar}>{starred ? "取消星标" : "设置星标"}</button>
            <button type="button" disabled>加入分组</button>
            <button type="button" disabled>删除</button>
          </div>
        )}
      </div>
    </article>
  );
}

function RequestSection({
  currentUserId,
  empty,
  onAccept,
  onReject,
  pending,
  requests,
  spaces,
  title,
  variant
}: {
  currentUserId: string;
  empty: string;
  onAccept?: (requestId: string) => void;
  onReject: (requestId: string) => void;
  pending: boolean;
  requests: ContactRequest[];
  spaces: CollaborationSpace[];
  title: string;
  variant: "inbound" | "outbound";
}) {
  return (
    <section className="request-section">
      <h2>{title}</h2>
      <div className="request-card-list">
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            spaces={spaces}
            currentUserId={currentUserId}
            variant={variant}
            pending={pending}
            onAccept={onAccept}
            onReject={onReject}
          />
        ))}
        {!requests.length && <p className="muted">{empty}</p>}
      </div>
    </section>
  );
}

function RequestCard({
  currentUserId,
  onAccept,
  onReject,
  pending,
  request,
  spaces,
  variant
}: {
  currentUserId: string;
  onAccept?: (requestId: string) => void;
  onReject: (requestId: string) => void;
  pending: boolean;
  request: ContactRequest;
  spaces: CollaborationSpace[];
  variant: "inbound" | "outbound";
}) {
  const participant = request.participant;
  const commonSpaces = commonSpacesFor(participant, spaces, currentUserId);
  const commonText = commonSpaces.length ? `${commonSpaces.length}个共同空间` : "无共同空间";
  const timeText = request.createdAt ? shortDate(request.createdAt) : "暂无时间";
  return (
    <article className="request-card">
      <ActorAvatar id={participant.id} size="md" src={participant.avatarUrl} alt={participant.displayName} />
      <div className="request-card-main">
        <strong>{participant.displayName}</strong>
        <span>{variant === "outbound" ? "等待对方接受" : participant.description || request.message || "对方希望与你建立协作关系。"}</span>
        <small>来源：{participant.handle || `ID ${participantDisplayId(participant)}`}</small>
        <em>{commonText} · {timeText}</em>
      </div>
      <div className="request-card-actions">
        {variant === "inbound" ? (
          <>
            <button className="quiet-button" disabled={pending} onClick={() => onReject(request.id)}>忽略</button>
            <button className="primary-button" disabled={pending} onClick={() => onAccept?.(request.id)}><Check size={15} />接受</button>
          </>
        ) : (
          <button className="quiet-button" disabled={pending} onClick={() => onReject(request.id)}>撤回申请</button>
        )}
      </div>
    </article>
  );
}

function AddCollaboratorDialog({ app, onClose }: { app: AppContextValue; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [searchId, setSearchId] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [message, setMessage] = useState("你好，我想添加你为协作者。");
  const searchReason = unavailableReason("participantSearch", app.environment.capabilities);
  const requestReason = unavailableReason("contactRequests", app.environment.capabilities);
  const searchQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "add-collaborator", lookupId],
    queryFn: () => app.workspace!.searchParticipants(lookupId),
    enabled: !!app.workspace && !!lookupId && !searchReason
  });
  const sendRequest = useMutation({
    mutationFn: (participantId: string) => app.workspace!.createContactRequest(participantId, message),
    onSuccess: async () => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
      onClose();
    }
  });
  const results = searchQuery.data || [];
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="添加协作者">
      <div className="add-collaborator-dialog">
        <header>
          <span>
            <strong>添加协作者</strong>
            <small>通过对方 ID 搜索，并发送协作申请。</small>
          </span>
          <button type="button" onClick={onClose} aria-label="关闭添加协作者"><X size={16} /></button>
        </header>
        <form onSubmit={(event) => {
          event.preventDefault();
          setLookupId(searchId.trim());
        }}>
          <label>
            <span>协作者 ID</span>
            <input value={searchId} onChange={(event) => setSearchId(event.target.value)} placeholder="输入对方 ID" inputMode="numeric" />
          </label>
          <button className="primary-button" type="submit" disabled={!searchId.trim() || !!searchReason}>搜索</button>
        </form>
        <label className="add-message-field">
          <span>申请说明</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        {searchReason && <InlineState title="当前环境不可搜索协作者" detail={searchReason} />}
        {requestReason && <InlineState title="当前环境不可发送协作申请" detail={requestReason} />}
        <div className="add-result-list">
          {results.map((participant) => {
            const disabled = !!requestReason || participant.relationship === "connected" || participant.relationship === "self" || participant.relationship === "pending_inbound" || participant.relationship === "pending_outbound";
            const label = participant.relationship === "connected"
              ? "已是协作者"
              : participant.relationship === "self"
                ? "这是你自己"
                : participant.relationship === "pending_inbound" || participant.relationship === "pending_outbound"
                  ? "申请处理中"
                  : "发送申请";
            return (
              <article key={participant.id} className="add-result-card">
                <ActorAvatar id={participant.id} size="sm" src={participant.avatarUrl} alt={participant.displayName} />
                <span>
                  <strong>{participant.displayName}</strong>
                  <small>ID {participantDisplayId(participant)}</small>
                </span>
                <button className="quiet-button" disabled={disabled || sendRequest.isPending} onClick={() => sendRequest.mutate(participant.id)}>{label}</button>
              </article>
            );
          })}
          {lookupId && !searchQuery.isLoading && !results.length && <p className="muted">没有找到这个 ID。</p>}
        </div>
        {sendRequest.error && <p className="form-error">{(sendRequest.error as Error).message}</p>}
      </div>
    </div>
  );
}

function useStarredParticipants(): [Set<string>, (participantId: string) => void] {
  const [starred, setStarred] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(starredStorageKey);
      const ids = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
    } catch {
      return new Set();
    }
  });

  function toggle(participantId: string) {
    setStarred((current) => {
      const next = new Set(current);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      localStorage.setItem(starredStorageKey, JSON.stringify([...next]));
      return next;
    });
  }

  return [starred, toggle];
}

export function ParticipantLink({ participant }: { participant: Participant }) {
  return (
    <Link className="participant-row" to={`/participants/${participant.id}`}>
      <ActorAvatar id={participant.id} size="md" src={participant.avatarUrl} alt={participant.displayName} />
      <span>
        <strong>{participant.displayName}<IdentityBadge participant={participant} /></strong>
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
  const [commonOpen, setCommonOpen] = useState(false);
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
  if (participantQuery.isLoading) return <InlinePage title="正在打开协作者资料" />;
  if (!participant) return <InlinePage title="没有找到协作者" action={<Link className="primary-button" to="/participants">返回协作者</Link>} />;

  const spaces = spacesQuery.data || [];
  const commonSpaces = commonSpacesFor(participant, spaces, app.environment.currentUserId);
  const isSelf = participant.relationship === "self";
  const canStart = participant.relationship === "connected";
  const canRequest = participant.relationship === "none";
  const startReason = isSelf
    ? "这是当前身份，不能和自己发起聊天"
    : participant.relationship === "pending_inbound"
      ? "请先处理联系请求"
      : participant.relationship === "pending_outbound"
        ? "联系请求已发送，等待对方接受"
        : "请先建立联系";
  const inviteBlocked = participant.relationship === "pending_inbound" ? {
    title: "请先处理联系请求",
    detail: "接受联系请求后，才能邀请协作者进入已有协作空间。"
  } : participant.relationship === "pending_outbound" ? {
    title: "等待对方接受联系请求",
    detail: "联系建立后，才能邀请协作者进入已有协作空间。"
  } : {
    title: "请先建立联系",
    detail: "建立联系后，才能邀请协作者进入已有协作空间。"
  };
  const inviteReason = unavailableReason("spaceInvites", app.environment.capabilities);
  const canInvite = participant.relationship === "connected" && !inviteReason;
  const inviteSpaces = spaces.filter((space) => space.sourceSpaceId && !space.participantIds.includes(participant.id));

  return (
    <section className="center-page page-fade">
      <div className="main-column narrow participant-detail profile-static">
        <article className="detail-panel">
          <div className="detail-hero">
            <ActorAvatar id={participant.id} size="lg" src={participant.avatarUrl} alt={participant.displayName} />
            <span>
              <h1>{participant.displayName}<IdentityBadge participant={participant} /></h1>
              <p>{participant.title || participant.handle || relationshipLabel(participant.relationship)}</p>
            </span>
          </div>

          <dl className="detail-facts">
            <dt>ID</dt>
            <dd>{participantDisplayId(participant)}</dd>
            <dt>地区</dt>
            <dd>{participant.region || "未填写"}</dd>
            <dt>添加时间</dt>
            <dd>{participant.addedAt ? shortDate(participant.addedAt) : "暂无记录"}</dd>
            <dt>关系</dt>
            <dd>{relationshipLabel(participant.relationship)}</dd>
          </dl>

          <section className="detail-section">
            <h2>个人介绍</h2>
            <p>{participant.description || "对方还没有填写介绍。"}</p>
          </section>

          <button className="detail-metric" type="button" onClick={() => setCommonOpen((open) => !open)} aria-expanded={commonOpen}>
            <span>
              <strong>{commonSpaces.length}</strong>
              <small>共同空间</small>
            </span>
            <ChevronRight size={16} />
          </button>

          {commonOpen && (
            <div className="common-space-list">
              {commonSpaces.map((space) => (
                <Link key={space.id} to={`/spaces/${space.id}`}>
                  <ActorAvatar id={space.id} size="sm" />
                  <span>
                    <strong>{space.title}</strong>
                    <small>{space.kind === "direct" ? "一对一协作空间" : `${space.participantIds.length} 位成员`}</small>
                  </span>
                </Link>
              ))}
              {!commonSpaces.length && <p className="muted">暂时没有共同空间。</p>}
            </div>
          )}

          <div className="button-row">
            <button className="primary-button" disabled={!canStart || directSpace.isPending} title={canStart ? undefined : startReason} onClick={() => directSpace.mutate()}>
              <MessageCircle size={16} />
              发起聊天
            </button>
            {canRequest && <button className="quiet-button" disabled={request.isPending || !app.environment.capabilities.contactRequests} title={unavailableReason("contactRequests", app.environment.capabilities) || undefined} onClick={() => request.mutate()}>建立联系</button>}
          </div>
        </article>

        {!isSelf && (
          <section className="participant-picker profile-invite">
            <h2>邀请加入空间</h2>
            {inviteReason && <InlineState title="当前环境不可邀请" detail={inviteReason} />}
            {!inviteReason && participant.relationship !== "connected" && <InlineState title={inviteBlocked.title} detail={inviteBlocked.detail} />}
            {canInvite && !spacesQuery.isLoading && !inviteSpaces.length && <p className="muted">没有可邀请的协作空间。</p>}
            {canInvite && inviteSpaces.map((space) => {
              const selected = inviteSpaceId === space.id;
              return (
                <label key={space.id} className={clsx("picker-row", selected && "selected")}>
                  <input type="radio" name="inviteSpace" value={space.id} checked={selected} onChange={() => setInviteSpaceId(space.id)} />
                  <ActorAvatar id={space.id} size="sm" />
                  <span><strong>{space.title}</strong><small>{space.kind === "direct" ? "一对一协作空间" : `${space.participantIds.length} 位参与者`}</small></span>
                </label>
              );
            })}
            {canInvite && <button className="quiet-button" disabled={!inviteSpaceId || invite.isPending} onClick={() => invite.mutate()}>邀请到已有空间</button>}
          </section>
        )}
        {request.error && <p className="form-error">{(request.error as Error).message}</p>}
        {directSpace.error && <p className="form-error">{(directSpace.error as Error).message}</p>}
        {invite.error && <p className="form-error">{(invite.error as Error).message}</p>}
      </div>
    </section>
  );
}

export function IdentityBadge({ participant }: { participant: Participant }) {
  const label = identityLabel(participant);
  if (!label) return null;
  return <em className="identity-badge">{label}</em>;
}

function commonSpacesFor(participant: Participant, spaces: CollaborationSpace[], currentUserId: string) {
  return spaces.filter((space) => {
    if (!space.sourceSpaceId) return false;
    if (!space.participantIds.includes(participant.id)) return false;
    if (participant.relationship === "self") return true;
    return space.participantIds.includes(currentUserId);
  });
}

function identityLabel(participant: Participant) {
  if (participant.kind === "human") return "人类";
  if (participant.kind === "agent") return "智能体";
  return "";
}

function participantDisplayId(participant: Participant) {
  if (participant.displayId) return participant.displayId;
  if (participant.handle) return participant.handle.replace(/^@/, "");
  return participant.id;
}
