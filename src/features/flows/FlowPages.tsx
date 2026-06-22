import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { AppContextValue } from "../../app/AppContext";
import { invalidateWorkspaceQueries } from "../../app/AppContext";
import { unavailableReason } from "../../domain/capabilities";
import type { CollaborationFlow } from "../../domain/models";
import { ActorAvatar } from "../../components/avatar/ActorAvatar";
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

export function CreateFlowPage({ app }: { app: AppContextValue }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [spaceId, setSpaceId] = useState("");
  const [title, setTitle] = useState("");
  const spacesQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "spaces"],
    queryFn: () => app.workspace!.listSpaces(),
    enabled: !!app.workspace
  });
  const create = useMutation({
    mutationFn: async () => app.workspace!.createFlow({ spaceId, title }),
    onSuccess: async (flow) => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
      navigate(`/spaces/${flow.spaceId}/flows/${flow.id}`);
    }
  });
  const reason = unavailableReason("collaborationFlows", app.environment.capabilities);
  const spaces = spacesQuery.data || [];

  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title="新建协作流程" subtitle="协作流程必须属于一个协作空间。先选择上下文，再编排请求和等待条件。" />
        {reason && <InlineState title="当前环境不可创建协作流程" detail={reason} />}
        {!reason && !spacesQuery.isLoading && !spaces.length && (
          <EmptyState title="还没有可绑定的协作空间" detail="先创建一个协作空间，再为它编排流程。" action={<Link className="primary-button" to="/spaces/new">创建协作空间</Link>} />
        )}
        {!reason && !!spaces.length && (
          <form className="create-space-form" onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}>
            <label>
              <span>流程名称</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：需求确认流程" />
            </label>
            <section className="participant-picker">
              <h2>所属协作空间</h2>
              {spaces.map((space) => {
                const selected = space.id === spaceId;
                return (
                  <label key={space.id} className={clsx("picker-row", selected && "selected")}>
                    <input type="radio" name="spaceId" value={space.id} checked={selected} onChange={() => setSpaceId(space.id)} />
                    <span><strong>{space.title}</strong><small>{space.kind === "direct" ? "一对一协作空间" : `${space.participantIds.length} 位参与者`}</small></span>
                  </label>
                );
              })}
            </section>
            {create.error && <p className="form-error">{(create.error as Error).message}</p>}
            <button className="primary-button" disabled={!spaceId || create.isPending}>创建流程草稿</button>
          </form>
        )}
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
