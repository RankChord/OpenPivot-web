import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { AppContextValue } from "../../app/AppContext";
import { applyInboxApprovalToFlowCache, invalidateWorkspaceQueries } from "../../app/AppContext";
import { unavailableReason } from "../../domain/capabilities";
import type { CollaborationFlow, FlowRunStartResult, FlowStepKind, InboxItem, Participant } from "../../domain/models";
import { EmptyState, InlinePage, InlineState, PageTitle } from "../../components/feedback/Feedback";

type DesignerNodeKind = FlowStepKind | "start" | "end";

interface DesignerNode {
  id: string;
  kind: DesignerNodeKind;
  title: string;
  detail: string;
  x: number;
  y: number;
  locked?: boolean;
}

interface DesignerEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

type ConnectionDraft =
  | { mode: "new"; sourceId: string }
  | { mode: "replace-source"; edgeId: string }
  | { mode: "replace-target"; edgeId: string };

type DesignerPort = "top" | "right" | "bottom" | "left";

const nodeWidth = 176;
const nodeHeight = 88;
const canvasWidth = 1360;
const canvasHeight = 820;

const paletteNodes: Array<{ kind: FlowStepKind; title: string; detail: string }> = [
  { kind: "request_participant", title: "请求参与者", detail: "指派成员处理任务" },
  { kind: "wait_for_response", title: "等待回复", detail: "暂停直到收到回应" },
  { kind: "approval", title: "审批", detail: "人工确认后继续" },
  { kind: "condition", title: "条件判断", detail: "按结果选择分支" },
  { kind: "parallel", title: "并行", detail: "同时执行多条路径" },
  { kind: "delay", title: "延时", detail: "等待一段时间" },
  { kind: "timeout", title: "超时", detail: "超过时限后处理" },
  { kind: "retry", title: "重试", detail: "失败后再次执行" },
  { kind: "escalate", title: "升级处理", detail: "转交给更高优先级" },
  { kind: "post_to_space", title: "写回空间", detail: "把结果发送到协作空间" }
];

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
  const approvalReason = unavailableReason("approvals", app.environment.capabilities) || "当前没有匹配此流程步骤的审批事项。";
  const canCompleteLatestRun = latestRun && latestRunAssigneeId === app.environment.currentUserId && app.workspace?.completeFlowTask;

  return (
    <section className="workflow-page page-fade">
      <header className="workflow-topbar">
        <div>
          <h1>{flow.title}</h1>
          <p>{space.title} · 工作流设计</p>
        </div>
        <div className="workflow-topbar-actions">
          <Link className="quiet-button" to={`/spaces/${space.id}/flows`}>流程列表</Link>
          <Link className="quiet-button" to={`/spaces/${space.id}`}>回到空间</Link>
        </div>
      </header>

      <div className="workflow-builder workflow-designer-layout">
        <WorkflowDesigner flow={flow} />
        <aside className="flow-inspector">
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
        </aside>
      </div>
    </section>
  );

}
function WorkflowDesigner({ flow }: { flow: CollaborationFlow }) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const nodeCounterRef = useRef(0);
  const dragRef = useRef<{
    moved: boolean;
    nodeId: string;
    offsetX: number;
    offsetY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [nodes, setNodes] = useState<DesignerNode[]>(() => initialDesignerNodes(flow));
  const [edges, setEdges] = useState<DesignerEdge[]>(() => [{ id: "edge-start-end", sourceId: "start", targetId: "end" }]);
  const [selectedNodeId, setSelectedNodeId] = useState("start");
  const [selectedEdgeId, setSelectedEdgeId] = useState("edge-start-end");
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || nodes[0];

  function canvasPoint(event: PointerEvent) {
    const surface = surfaceRef.current;
    if (!surface) return { x: 0, y: 0 };
    const rect = surface.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvasWidth, event.clientX - rect.left)),
      y: Math.max(0, Math.min(canvasHeight, event.clientY - rect.top))
    };
  }

  function addNode(template: (typeof paletteNodes)[number]) {
    const id = `node-${Date.now()}-${nodeCounterRef.current++}`;
    const offset = nodeCounterRef.current % 5;
    const node: DesignerNode = {
      id,
      kind: template.kind,
      title: template.title,
      detail: template.detail,
      x: 390 + offset * 34,
      y: 180 + offset * 46
    };
    setNodes((current) => [...current, node]);
    setSelectedNodeId(id);
    setSelectedEdgeId("");
    setDraft(null);
  }

  function updateNode(input: Partial<Pick<DesignerNode, "title" | "detail">>) {
    if (!selectedNode || selectedNode.locked) return;
    setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, ...input } : node));
  }

  function edgeAtPort(nodeId: string, port: DesignerPort) {
    for (const edge of edges) {
      const source = nodes.find((node) => node.id === edge.sourceId);
      const target = nodes.find((node) => node.id === edge.targetId);
      if (!source || !target) continue;
      if (edge.sourceId === nodeId && portSideToCursor(source, centerPoint(target)) === port) {
        return { edge, mode: "replace-source" as const };
      }
      if (edge.targetId === nodeId && portSideToCursor(target, centerPoint(source)) === port) {
        return { edge, mode: "replace-target" as const };
      }
    }
    return null;
  }

  function handlePortPointerDown(event: PointerEvent<HTMLElement>, nodeId: string, port: DesignerPort) {
    event.preventDefault();
    event.stopPropagation();
    setCursor(canvasPoint(event));
    setSelectedNodeId(nodeId);
    if (draft) {
      completeConnection(nodeId);
      return;
    }
    const connectedEndpoint = edgeAtPort(nodeId, port);
    if (connectedEndpoint) {
      setSelectedEdgeId(connectedEndpoint.edge.id);
      setDraft({ mode: connectedEndpoint.mode, edgeId: connectedEndpoint.edge.id });
      return;
    }
    setSelectedEdgeId("");
    setDraft({ mode: "new", sourceId: nodeId });
  }

  function handleNodePointerDown(event: PointerEvent<HTMLElement>, node: DesignerNode) {
    if (event.button !== 0) return;
    const point = canvasPoint(event);
    dragRef.current = {
      moved: false,
      nodeId: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleNodePointerMove(event: PointerEvent<HTMLElement>, node: DesignerNode) {
    const drag = dragRef.current;
    if (!drag || drag.nodeId !== node.id) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance > 3) drag.moved = true;
    const point = canvasPoint(event);
    const nextX = Math.max(24, Math.min(canvasWidth - nodeWidth - 24, point.x - drag.offsetX));
    const nextY = Math.max(24, Math.min(canvasHeight - nodeHeight - 24, point.y - drag.offsetY));
    setNodes((current) => current.map((item) => item.id === node.id ? { ...item, x: nextX, y: nextY } : item));
  }

  function handleNodePointerUp(event: PointerEvent<HTMLElement>, node: DesignerNode) {
    const drag = dragRef.current;
    if (!drag || drag.nodeId !== node.id) return;
    event.currentTarget.releasePointerCapture(drag.pointerId);
    dragRef.current = null;
    if (!drag.moved) handleNodeClick(node.id);
  }

  function handleNodeClick(nodeId: string) {
    setSelectedNodeId(nodeId);
    if (draft) {
      completeConnection(nodeId);
      return;
    }
    setSelectedEdgeId("");
  }

  function completeConnection(nodeId: string) {
    if (!draft) return;
    if (draft.mode === "new") {
      if (draft.sourceId === nodeId) {
        setDraft(null);
        return;
      }
      const existing = edges.find((edge) => edge.sourceId === draft.sourceId && edge.targetId === nodeId);
      if (existing) {
        setSelectedEdgeId(existing.id);
      } else {
        const edge = { id: `edge-${draft.sourceId}-${nodeId}-${Date.now()}`, sourceId: draft.sourceId, targetId: nodeId };
        setEdges((current) => [...current, edge]);
        setSelectedEdgeId(edge.id);
      }
    } else {
      const edge = edges.find((item) => item.id === draft.edgeId);
      if (!edge) return;
      if (draft.mode === "replace-source" && edge.targetId !== nodeId) {
        setEdges((current) => current.map((item) => item.id === draft.edgeId ? { ...item, sourceId: nodeId } : item));
      }
      if (draft.mode === "replace-target" && edge.sourceId !== nodeId) {
        setEdges((current) => current.map((item) => item.id === draft.edgeId ? { ...item, targetId: nodeId } : item));
      }
      setSelectedEdgeId(draft.edgeId);
    }
    setDraft(null);
  }

  function handleCanvasPointerMove(event: PointerEvent) {
    if (draft) setCursor(canvasPoint(event));
  }

  function clearDraft() {
    setDraft(null);
  }

  return (
    <section className="workflow-canvas-panel">
      <div className="canvas-toolbar">
        <span>画布</span>
        <small>{draft ? "连线中" : `${nodes.length} 个节点 · ${edges.length} 条连线`}</small>
        <div>
          <button type="button" disabled={!draft} onClick={clearDraft}>Esc</button>
        </div>
      </div>
      <div className="flow-canvas" ref={canvasRef} onPointerMove={handleCanvasPointerMove}>
        <div className="flow-canvas-surface" ref={surfaceRef}>
          <svg className="flow-lines" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} style={{ width: canvasWidth, height: canvasHeight }}>
            {edges.map((edge) => {
              const source = nodes.find((node) => node.id === edge.sourceId);
              const target = nodes.find((node) => node.id === edge.targetId);
              if (!source || !target) return null;
              return (
                <path
                  className={clsx(edge.id === selectedEdgeId && "selected")}
                  d={edgePath(source, target)}
                  key={edge.id}
                />
              );
            })}
            {draft && <path className="draft" d={draftPath(draft, nodes, edges, cursor)} />}
          </svg>

          <div className="node-floating-palette">
            <h2>节点</h2>
            <div>
              {paletteNodes.map((node) => (
                <button type="button" key={node.kind} onClick={() => addNode(node)}>
                  <strong>{node.title}</strong>
                  <small>{node.detail}</small>
                </button>
              ))}
            </div>
          </div>

          {nodes.map((node) => (
            <article
              className={clsx("flow-canvas-node", selectedNodeId === node.id && "selected", node.locked && "locked")}
              data-node-id={node.id}
              key={node.id}
              style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onPointerMove={(event) => handleNodePointerMove(event, node)}
              onPointerUp={(event) => handleNodePointerUp(event, node)}
            >
              <i className="workflow-port top" data-port="top" onPointerDown={(event) => handlePortPointerDown(event, node.id, "top")} />
              <i className="workflow-port right" data-port="right" onPointerDown={(event) => handlePortPointerDown(event, node.id, "right")} />
              <i className="workflow-port bottom" data-port="bottom" onPointerDown={(event) => handlePortPointerDown(event, node.id, "bottom")} />
              <i className="workflow-port left" data-port="left" onPointerDown={(event) => handlePortPointerDown(event, node.id, "left")} />
              <small>{nodeKindLabel(node.kind)}</small>
              <strong>{node.title}</strong>
              <span>{node.detail}</span>
            </article>
          ))}
        </div>
      </div>

      <div className="workflow-node-editor">
        {selectedNode && (
          <>
            <span className="node-type">{nodeKindLabel(selectedNode.kind)}</span>
            <label>
              <span>名称</span>
              <input value={selectedNode.title} disabled={selectedNode.locked} onChange={(event) => updateNode({ title: event.target.value })} />
            </label>
            <label>
              <span>说明</span>
              <textarea value={selectedNode.detail} disabled={selectedNode.locked} onChange={(event) => updateNode({ detail: event.target.value })} />
            </label>
          </>
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

function initialDesignerNodes(flow: CollaborationFlow): DesignerNode[] {
  return [
    {
      id: "start",
      kind: "start",
      title: "开始",
      detail: flow.trigger || "触发工作流",
      x: 190,
      y: 330,
      locked: true
    },
    {
      id: "end",
      kind: "end",
      title: "结束",
      detail: "流程完成",
      x: 720,
      y: 330,
      locked: true
    }
  ];
}

function nodeKindLabel(kind: DesignerNodeKind) {
  const labels: Record<DesignerNodeKind, string> = {
    approval: "审批",
    condition: "条件",
    delay: "延时",
    end: "结束",
    escalate: "升级",
    finish: "结束",
    parallel: "并行",
    post_to_space: "写回",
    request_participant: "任务",
    retry: "重试",
    start: "开始",
    timeout: "超时",
    trigger: "触发",
    wait_for_response: "等待"
  };
  return labels[kind];
}

function edgePath(source: DesignerNode, target: DesignerNode) {
  const start = portPoint(source, target);
  const end = portPoint(target, source);
  return curvePath(start, end);
}

function draftPath(draft: ConnectionDraft, nodes: DesignerNode[], edges: DesignerEdge[], cursor: { x: number; y: number }) {
  if (draft.mode === "new") {
    const source = nodes.find((node) => node.id === draft.sourceId);
    if (!source) return "";
    return curvePath(portPointToCursor(source, cursor), cursor);
  }
  const edge = edges.find((item) => item.id === draft.edgeId);
  if (!edge) return "";
  if (draft.mode === "replace-source") {
    const target = nodes.find((node) => node.id === edge.targetId);
    if (!target) return "";
    return curvePath(cursor, portPointToCursor(target, cursor));
  }
  const source = nodes.find((node) => node.id === edge.sourceId);
  if (!source) return "";
  return curvePath(portPointToCursor(source, cursor), cursor);
}

function portPoint(node: DesignerNode, other: DesignerNode) {
  return portPointToCursor(node, centerPoint(other));
}

function portPointToCursor(node: DesignerNode, point: { x: number; y: number }) {
  return portPointOnSide(node, portSideToCursor(node, point));
}

function portSideToCursor(node: DesignerNode, point: { x: number; y: number }): DesignerPort {
  const center = centerPoint(node);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

function portPointOnSide(node: DesignerNode, side: DesignerPort) {
  if (side === "left" || side === "right") {
    return {
      x: node.x + (side === "right" ? nodeWidth : 0),
      y: node.y + nodeHeight / 2
    };
  }
  return {
    x: node.x + nodeWidth / 2,
    y: node.y + (side === "bottom" ? nodeHeight : 0)
  };
}

function centerPoint(node: DesignerNode) {
  return {
    x: node.x + nodeWidth / 2,
    y: node.y + nodeHeight / 2
  };
}

function curvePath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const bend = Math.max(80, Math.abs(dx) * 0.45);
    const direction = dx >= 0 ? 1 : -1;
    return `M ${start.x} ${start.y} C ${start.x + bend * direction} ${start.y}, ${end.x - bend * direction} ${end.y}, ${end.x} ${end.y}`;
  }
  const bend = Math.max(70, Math.abs(dy) * 0.45);
  const direction = dy >= 0 ? 1 : -1;
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + bend * direction}, ${end.x} ${end.y - bend * direction}, ${end.x} ${end.y}`;
}
