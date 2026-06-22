import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { AppContextValue } from "../../app/AppContext";
import { applyInboxApprovalToFlowCache, invalidateWorkspaceQueries } from "../../app/AppContext";
import { unavailableReason } from "../../domain/capabilities";
import type { CollaborationFlow, ContactRequest, InboxItem } from "../../domain/models";
import { EmptyState, InlineState, PageTitle } from "../../components/feedback/Feedback";
export function InboxPage({ app }: { app: AppContextValue }) {
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

export function InboxGroup({ title, items, app, onApprove, onReject, onDismiss, onAcceptRequest, onRejectRequest, pending }: {
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
function inboxTarget(item: InboxItem) {
  if (item.flowId) return `/spaces/${item.spaceId}/flows/${item.flowId}`;
  if (item.messageId) return `/spaces/${item.spaceId}#${item.messageId}`;
  if (item.spaceId) return `/spaces/${item.spaceId}`;
  return "/inbox";
}
