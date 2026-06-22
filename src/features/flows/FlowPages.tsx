import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import type { AppContextValue } from "../../app/AppContext";
import { invalidateWorkspaceQueries } from "../../app/AppContext";
import { unavailableReason } from "../../domain/capabilities";
import type { CollaborationFlow } from "../../domain/models";
import { EmptyState, InlinePage, InlineState, PageTitle } from "../../components/feedback/Feedback";
export function FlowsOverviewPage({ app }: { app: AppContextValue }) {
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

export function FlowList({ flows }: { flows: CollaborationFlow[] }) {
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

export function FlowDetailPage({ app }: { app: AppContextValue }) {
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
