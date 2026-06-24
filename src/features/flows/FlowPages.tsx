import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AppContextValue } from "../../app/AppContext";
import { applyInboxApprovalToFlowCache, invalidateWorkspaceQueries } from "../../app/AppContext";
import { unavailableReason } from "../../domain/capabilities";
import type { CollaborationFlow, FlowRunStartResult, InboxItem, Participant } from "../../domain/models";
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
        <PageTitle title="协作流程" subtitle="跨空间查看真实协作流程，进入详情后回到所属协作空间继续运行。" />
        {reason && <InlineState title="当前环境暂未接入流程" detail={reason} />}
        <FlowList flows={flowsQuery.data || []} />
      </div>
    </section>
  );
}

export function FlowList({ flows }: { flows: CollaborationFlow[] }) {
  if (!flows.length) return <EmptyState title="没有可显示的协作流程" detail="从协作空间创建流程，或在空间时间线里基于消息生成流程。" />;
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
  const [assigneeId, setAssigneeId] = useState("");
  const [taskTitle, setTaskTitle] = useState("确认并回复");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskResult, setTaskResult] = useState("已确认，可以继续推进");
  const [latestRun, setLatestRun] = useState<FlowRunStartResult | null>(null);
  const [latestRunAssigneeId, setLatestRunAssigneeId] = useState("");

  const spaceQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "space", spaceId],
    queryFn: () => app.workspace!.getSpace(spaceId),
    enabled: !!app.workspace && !!spaceId
  });
  const space = spaceQuery.data;
  const resolvedSpaceId = space?.id || spaceId;
  const flowQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, app.workspaceVersion, "flow", resolvedSpaceId, flowId],
    queryFn: () => app.workspace!.getFlow(space!.id, flowId),
    enabled: !!app.workspace && !!space && !!flowId
  });
  const participantsQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "participants"],
    queryFn: () => app.workspace!.listParticipants(),
    enabled: !!app.workspace && !!space
  });
  const inboxQuery = useQuery({
    queryKey: ["workspace", app.mode, app.session, "inbox"],
    queryFn: () => app.workspace!.listInboxItems(),
    enabled: !!app.workspace && !!space && !!flowId
  });

  const startRun = useMutation({
    mutationFn: async () => {
      if (!space || !flowQuery.data) throw new Error("没有找到协作流程");
      if (!app.workspace?.startFlowRun) throw new Error(unavailableReason("flowRuns", app.environment.capabilities) || "当前环境不能启动协作流程");
      const selectedAssigneeId = assigneeId || space.participantIds[0];
      if (!selectedAssigneeId) throw new Error("请选择任务处理人");
      return app.workspace.startFlowRun({
        spaceId: space.id,
        flowId: flowQuery.data.id,
        assigneeId: selectedAssigneeId,
        taskTitle,
        taskDescription
      });
    },
    onSuccess: async (run) => {
      const selectedAssigneeId = assigneeId || space?.participantIds[0] || "";
      setLatestRun(run);
      setLatestRunAssigneeId(selectedAssigneeId);
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
    }
  });

  const completeTask = useMutation({
    mutationFn: async () => {
      if (!latestRun) throw new Error("还没有可完成的流程任务");
      if (!app.workspace?.completeFlowTask) throw new Error("当前环境不能完成流程任务");
      return app.workspace.completeFlowTask(latestRun.taskId, taskResult);
    },
    onSuccess: async () => {
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
    }
  });

  const completeApproval = useMutation({
    mutationFn: (item: InboxItem) => app.workspace!.completeInboxItem(item.id, "approve"),
    onSuccess: async (_result, item) => {
      queryClient.setQueryData<CollaborationFlow | null>(
        ["workspace", app.mode, app.session, app.workspaceVersion, "flow", resolvedSpaceId, flowId],
        (flow) => applyInboxApprovalToFlowCache(flow, item.stepId!, "approve")
      );
      app.refreshWorkspace();
      await invalidateWorkspaceQueries(queryClient, app.mode);
    }
  });

  const flow = flowQuery.data;
  if (spaceQuery.isLoading || flowQuery.isLoading) return <InlinePage title="正在打开协作流程" />;
  if (!space) return <InlinePage title="没有找到协作空间" detail="协作流程详情必须属于一个真实协作空间。" action={<Link className="primary-button" to="/spaces">返回空间列表</Link>} />;
  if (!flow) return <InlinePage title="没有找到协作流程" detail="这个流程不存在，或当前账号没有权限访问。" action={<Link className="primary-button" to={`/spaces/${space.id}/flows`}>返回流程列表</Link>} />;

  const participants = (participantsQuery.data || []).filter((participant) => space.participantIds.includes(participant.id));
  const selectedAssigneeId = assigneeId || participants[0]?.id || "";
  const waiting = flow.steps.find((step) => step.id === flow.waitingStepId && step.status === "waiting");
  const approvalItem = (inboxQuery.data || []).find((item) => item.kind === "approval" && item.status === "open" && item.spaceId === space.id && item.flowId === flow.id && item.stepId === waiting?.id);
  const approvalReason = unavailableReason("approvals", app.environment.capabilities) || "当前收件箱没有匹配此流程步骤的审批事项。";
  const canCompleteLatestRun = latestRun && latestRunAssigneeId === app.environment.currentUserId && app.workspace?.completeFlowTask;

  return (
    <section className="center-page page-fade">
      <div className="main-column">
        <PageTitle title={flow.title} subtitle="流程属于当前协作空间，负责请求参与者、等待处理，并把结果写回空间。" action={<Link className="quiet-button" to={`/spaces/${space.id}`}>回到空间</Link>} />
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

        {app.environment.capabilities.flowRuns && app.workspace?.startFlowRun && (
          <FlowRunPanel
            assigneeId={selectedAssigneeId}
            completeError={completeTask.error}
            completePending={completeTask.isPending}
            canCompleteLatestRun={!!canCompleteLatestRun}
            latestRun={latestRun}
            participants={participants}
            runAssigneeId={latestRunAssigneeId}
            startError={startRun.error}
            startPending={startRun.isPending}
            taskDescription={taskDescription}
            taskResult={taskResult}
            taskTitle={taskTitle}
            onAssigneeChange={setAssigneeId}
            onComplete={() => completeTask.mutate()}
            onStart={() => startRun.mutate()}
            onTaskDescriptionChange={setTaskDescription}
            onTaskResultChange={setTaskResult}
            onTaskTitleChange={setTaskTitle}
          />
        )}

        {waiting && (
          <div className="flow-run-card">
            <strong>{flow.title} 正在等待处理</strong>
            <small>{waiting.title}</small>
            <button className="primary-button" disabled={completeApproval.isPending || !approvalItem || !app.environment.capabilities.approvals} title={approvalItem && app.environment.capabilities.approvals ? undefined : approvalReason} onClick={() => approvalItem && completeApproval.mutate(approvalItem)}>批准并继续</button>
          </div>
        )}
      </div>
    </section>
  );
}

function FlowRunPanel({
  assigneeId,
  canCompleteLatestRun,
  completeError,
  completePending,
  latestRun,
  participants,
  runAssigneeId,
  startError,
  startPending,
  taskDescription,
  taskResult,
  taskTitle,
  onAssigneeChange,
  onComplete,
  onStart,
  onTaskDescriptionChange,
  onTaskResultChange,
  onTaskTitleChange
}: {
  assigneeId: string;
  canCompleteLatestRun: boolean;
  completeError: unknown;
  completePending: boolean;
  latestRun: FlowRunStartResult | null;
  participants: Participant[];
  runAssigneeId: string;
  startError: unknown;
  startPending: boolean;
  taskDescription: string;
  taskResult: string;
  taskTitle: string;
  onAssigneeChange: (id: string) => void;
  onComplete: () => void;
  onStart: () => void;
  onTaskDescriptionChange: (value: string) => void;
  onTaskResultChange: (value: string) => void;
  onTaskTitleChange: (value: string) => void;
}) {
  const assigneeName = participants.find((participant) => participant.id === runAssigneeId)?.displayName || "被指派参与者";
  return (
    <div className="flow-run-card">
      <strong>启动一次真实流程运行</strong>
      <small>当前后端 MVP 会创建一个待处理任务；任务完成后，结果会写回协作空间时间线。</small>
      <label>
        <span>处理人</span>
        <select value={assigneeId} onChange={(event) => onAssigneeChange(event.target.value)}>
          {participants.map((participant) => (
            <option value={participant.id} key={participant.id}>{participant.displayName}</option>
          ))}
        </select>
      </label>
      <label>
        <span>任务标题</span>
        <input value={taskTitle} onChange={(event) => onTaskTitleChange(event.target.value)} />
      </label>
      <label>
        <span>任务说明</span>
        <textarea value={taskDescription} onChange={(event) => onTaskDescriptionChange(event.target.value)} placeholder="给处理人的上下文" />
      </label>
      <button className="primary-button" disabled={!assigneeId || !taskTitle.trim() || startPending} onClick={onStart}>启动流程运行</button>
      {startError ? <p className="form-error">{(startError as Error).message}</p> : null}

      {latestRun && (
        <div className="flow-run-result">
          <strong>任务 #{latestRun.taskId} 已创建</strong>
          <small>当前状态：{latestRun.status}，处理人：{assigneeName}</small>
          <label>
            <span>完成结果</span>
            <textarea value={taskResult} onChange={(event) => onTaskResultChange(event.target.value)} />
          </label>
          <button className="quiet-button" disabled={!canCompleteLatestRun || !taskResult.trim() || completePending} title={canCompleteLatestRun ? undefined : "只有被指派账号可以完成该任务"} onClick={onComplete}>完成任务并写回空间</button>
          {completeError ? <p className="form-error">{(completeError as Error).message}</p> : null}
        </div>
      )}
    </div>
  );
}
