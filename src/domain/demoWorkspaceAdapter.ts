import type {
  CollaborationFlow,
  CollaborationSpace,
  ContactRequest,
  FlowStep,
  InboxItem,
  Participant,
  SpaceMessage
} from "./models";
import type { WorkspaceAdapter } from "./workspaceAdapter";

interface DemoStore {
  participants: Participant[];
  spaces: CollaborationSpace[];
  messages: Record<string, SpaceMessage[]>;
  flows: CollaborationFlow[];
  inbox: InboxItem[];
  requests: ContactRequest[];
}

const demoNow = "2026-06-22T10:31:00+08:00";

function textMessage(id: string, spaceId: string, senderId: string, text: string, createdAt: string): SpaceMessage {
  return {
    id,
    spaceId,
    senderId,
    kind: "message",
    blocks: [{ type: "text", text }],
    createdAt,
    deliveryState: "sent"
  };
}

function flowEvent(id: string, spaceId: string, text: string, flowId: string, stepId?: string): SpaceMessage {
  return {
    id,
    spaceId,
    kind: "flow_event",
    blocks: [{ type: "text", text }],
    createdAt: demoNow,
    deliveryState: "sent",
    relatedFlowId: flowId,
    relatedStepId: stepId
  };
}

function createInitialStore(): DemoStore {
  const participants: Participant[] = [
    {
      id: "me",
      kind: "human",
      displayName: "Ling",
      handle: "@ling",
      title: "当前账号",
      relationship: "self",
      description: "当前 OpenPivot 使用身份。"
    },
    {
      id: "lin",
      kind: "human",
      displayName: "林舟",
      handle: "@lin",
      title: "产品负责人",
      relationship: "connected",
      description: "负责版本节奏、发布判断和成员协作边界。"
    },
    {
      id: "chen",
      kind: "human",
      displayName: "陈默",
      handle: "@chen",
      title: "协议审阅",
      relationship: "connected",
      description: "关注协议一致性、后端风险和上线前的人工确认。"
    },
    {
      id: "orion",
      kind: "agent",
      displayName: "北辰规划",
      handle: "@orion",
      title: "任务规划",
      relationship: "connected",
      connectionLabel: "OpenClaw Runtime",
      description: "根据协作空间上下文拆解阶段计划和执行顺序。"
    },
    {
      id: "forge",
      kind: "agent",
      displayName: "砺锋后端",
      handle: "@forge",
      title: "后端协作",
      relationship: "connected",
      connectionLabel: "OpenCode Workspace",
      description: "整理后端实现建议、风险点和接口变更草案。"
    },
    {
      id: "atlas",
      kind: "agent",
      displayName: "星图前端",
      handle: "@atlas",
      title: "界面协作",
      relationship: "connected",
      connectionLabel: "OpenCode Workspace",
      description: "梳理产品界面状态、交互细节和前端接入约定。"
    },
    {
      id: "mira",
      kind: "unknown",
      displayName: "Mira",
      handle: "@mira",
      title: "待确认身份",
      relationship: "pending_inbound",
      description: "尚未建立联系的外部参与者。"
    }
  ];

  const spaces: CollaborationSpace[] = [
    {
      id: "core",
      kind: "multi",
      title: "OpenPivot 核心开发",
      participantIds: ["me", "lin", "chen", "orion", "forge", "atlas"],
      pinned: true,
      unreadCount: 2,
      lastActivityAt: "2026-06-22T10:31:00+08:00",
      lastPreview: "北辰规划整理了发布客户端的下一步计划。",
      hasActiveFlow: true
    },
    {
      id: "lin",
      kind: "direct",
      title: "与林舟的对话",
      participantIds: ["me", "lin"],
      lastActivityAt: "2026-06-22T10:12:00+08:00",
      lastPreview: "先把核心对话体验收住。"
    },
    {
      id: "release",
      kind: "multi",
      title: "发布协作室",
      participantIds: ["me", "lin", "chen", "atlas"],
      lastActivityAt: "2026-06-22T09:48:00+08:00",
      lastPreview: "林舟把发布窗口更新到了今晚。"
    },
    {
      id: "protocol",
      kind: "multi",
      title: "协议设计",
      participantIds: ["me", "chen", "forge"],
      pinned: true,
      lastActivityAt: "2026-06-21T18:30:00+08:00",
      lastPreview: "陈默留下了两条待确认边界。",
      hasActiveFlow: true
    },
    {
      id: "orion",
      kind: "direct",
      title: "与北辰规划的对话",
      participantIds: ["me", "orion"],
      lastActivityAt: "2026-06-22T09:36:00+08:00",
      lastPreview: "我会按协作上下文继续拆解。"
    }
  ];

  const devSteps: FlowStep[] = [
    { id: "trigger", kind: "trigger", title: "当 #开发 消息出现", detail: "监听 OpenPivot 核心开发空间", status: "completed" },
    { id: "scope", kind: "request_participant", title: "请求林舟确认范围", detail: "明确目标、风险和发布窗口", participantId: "lin", status: "completed" },
    { id: "plan", kind: "request_participant", title: "请求北辰规划拆解任务", detail: "输出可执行步骤", participantId: "orion", status: "completed" },
    { id: "parallel", kind: "parallel", title: "并行实施", detail: "后端与前端同时推进", status: "running" },
    { id: "backend", kind: "request_participant", title: "请求砺锋后端实现协议", detail: "输出接口草案", participantId: "forge", status: "completed" },
    { id: "frontend", kind: "request_participant", title: "请求星图前端实现界面", detail: "完成客户端接入", participantId: "atlas", status: "completed" },
    { id: "approval", kind: "approval", title: "请求陈默验收", detail: "等待人工审批", participantId: "chen", status: "waiting" },
    { id: "finish", kind: "finish", title: "写回协作空间", detail: "在时间线记录结果", status: "idle" }
  ];

  const flows: CollaborationFlow[] = [
    {
      id: "dev-flow",
      spaceId: "core",
      title: "开发协作",
      status: "active",
      trigger: "当 OpenPivot 核心开发收到包含 #开发 的消息",
      steps: devSteps,
      lastRunAt: "2026-06-22T10:20:00+08:00",
      waitingStepId: "approval"
    },
    {
      id: "protocol-review",
      spaceId: "protocol",
      title: "协议审阅",
      status: "draft",
      trigger: "当协议设计空间出现接口变更",
      steps: [
        { id: "trigger", kind: "trigger", title: "监听接口变更", detail: "来自协议设计空间", status: "completed" },
        { id: "review", kind: "approval", title: "请求陈默审阅", detail: "等待确认边界", participantId: "chen", status: "waiting" },
        { id: "post", kind: "post_to_space", title: "写回审阅结论", detail: "同步到协议设计空间", status: "idle" }
      ],
      lastRunAt: "2026-06-21T18:10:00+08:00",
      waitingStepId: "review"
    }
  ];

  const messages: Record<string, SpaceMessage[]> = {
    core: [
      textMessage("core-1", "core", "lin", "这版客户端要如实展示当前后端已经支持的能力，同时让用户看到协作编排的方向。", "2026-06-22T10:24:00+08:00"),
      {
        id: "core-2",
        spaceId: "core",
        senderId: "orion",
        kind: "message",
        blocks: [
          { type: "markdown", source: "我会把协作空间里的消息、成员动作和审批节点串成一个可编排流程，消息入口仍然保持 IM 的自然节奏。\n\n- 最近会话统一承载协作空间和参与者记录\n- 协作流程用低代码脚本表达触发、执行和审批关系\n- 参与者作为能力目录存在，身份属性只在资料页展示" }
        ],
        createdAt: "2026-06-22T10:25:00+08:00",
        deliveryState: "sent"
      },
      flowEvent("core-flow-1", "core", "开发协作 #18 正在等待陈默确认，6 / 8 步已完成。", "dev-flow", "approval"),
      textMessage("core-3", "core", "chen", "可以。成员在会话里应该自然并列出现，需要说明角色时放在资料页或详情里。", "2026-06-22T10:26:00+08:00"),
      textMessage("core-4", "core", "atlas", "界面上我会收掉无意义的新建入口，让用户先看到最近发生的协作和参与者消息。", "2026-06-22T10:31:00+08:00")
    ],
    lin: [
      textMessage("lin-1", "lin", "lin", "先把核心对话体验收住：用户每天进来应该先看到需要自己处理什么。", "2026-06-22T10:12:00+08:00")
    ],
    release: [
      textMessage("release-1", "release", "lin", "发布窗口更新到今晚，流程里等陈默最后确认。", "2026-06-22T09:48:00+08:00")
    ],
    protocol: [
      textMessage("protocol-1", "protocol", "chen", "这两个接口边界需要在发布前确认，否则前端会出现状态歧义。", "2026-06-21T18:30:00+08:00"),
      flowEvent("protocol-flow-1", "protocol", "协议审阅等待陈默处理，完成后会写回此空间。", "protocol-review", "review")
    ],
    orion: [
      textMessage("orion-1", "orion", "orion", "我会按协作上下文继续拆解，不把任务孤立成另一个后台列表。", "2026-06-22T09:36:00+08:00")
    ]
  };

  const inbox: InboxItem[] = [
    {
      id: "inbox-approval-core",
      kind: "approval",
      priority: "action",
      title: "陈默等待你确认协议变更",
      detail: "开发协作 #18 正停在人工验收步骤。",
      createdAt: "2026-06-22T10:31:00+08:00",
      spaceId: "core",
      flowId: "dev-flow",
      stepId: "approval",
      status: "open"
    },
    {
      id: "inbox-mention-atlas",
      kind: "mention",
      priority: "notice",
      title: "星图前端在 OpenPivot 核心开发中提到了你",
      detail: "消息页需要更像日常入口。",
      createdAt: "2026-06-22T10:29:00+08:00",
      spaceId: "core",
      messageId: "core-4",
      status: "open"
    },
    {
      id: "inbox-unread-release",
      kind: "unread",
      priority: "background",
      title: "发布协作室有新动态",
      detail: "林舟更新了发布窗口。",
      createdAt: "2026-06-22T09:48:00+08:00",
      spaceId: "release",
      status: "open"
    }
  ];

  const requests: ContactRequest[] = [
    {
      id: "request-mira",
      participant: participants.find((participant) => participant.id === "mira")!,
      message: "我可以加入协议设计协作吗？",
      status: "pending"
    }
  ];

  return { participants, spaces, messages, flows, inbox, requests };
}

const store: DemoStore = createInitialStore();

export function resetDemoWorkspace(): void {
  const fresh = createInitialStore();
  store.participants = fresh.participants;
  store.spaces = fresh.spaces;
  store.messages = fresh.messages;
  store.flows = fresh.flows;
  store.inbox = fresh.inbox;
  store.requests = fresh.requests;
}

function wait<T>(value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), 120));
}

function byTimeDesc<T extends { lastActivityAt?: string; createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => String(b.lastActivityAt || b.createdAt || "").localeCompare(String(a.lastActivityAt || a.createdAt || "")));
}

export class DemoWorkspaceAdapter implements WorkspaceAdapter {
  async listSpaces(): Promise<CollaborationSpace[]> {
    return wait(byTimeDesc(store.spaces));
  }

  async getSpace(spaceId: string): Promise<CollaborationSpace | null> {
    return wait(store.spaces.find((space) => space.id === spaceId) || null);
  }

  async listMessages(spaceId: string): Promise<SpaceMessage[]> {
    return wait([...(store.messages[spaceId] || [])]);
  }

  async sendMessage(spaceId: string, content: string, clientId?: string): Promise<SpaceMessage> {
    if (content.includes("失败测试")) {
      const failedMessage: SpaceMessage = {
        id: clientId || `demo-${Date.now()}`,
        spaceId,
        senderId: "me",
        kind: "message",
        blocks: [{ type: "text", text: content }],
        createdAt: new Date().toISOString(),
        deliveryState: "failed"
      };
      store.messages[spaceId] = [...(store.messages[spaceId] || []).filter((item) => item.id !== failedMessage.id), failedMessage];
      const space = store.spaces.find((item) => item.id === spaceId);
      if (space) {
        space.lastActivityAt = failedMessage.createdAt;
        space.lastPreview = content;
      }
      throw new Error("演示发送失败，消息已保留，可重试。");
    }
    const message: SpaceMessage = {
      id: clientId || `demo-${Date.now()}`,
      spaceId,
      senderId: "me",
      kind: "message",
      blocks: [{ type: "text", text: content }],
      createdAt: new Date().toISOString(),
      deliveryState: "sent"
    };
    store.messages[spaceId] = [...(store.messages[spaceId] || []), message];
    const space = store.spaces.find((item) => item.id === spaceId);
    if (space) {
      space.lastActivityAt = message.createdAt;
      space.lastPreview = content;
    }
    return wait(message);
  }

  async retryMessage(spaceId: string, messageId: string): Promise<SpaceMessage> {
    const failed = store.messages[spaceId]?.find((message) => message.id === messageId);
    const text = failed?.blocks.find((block) => block.type === "text")?.text || "重试消息";
    const message: SpaceMessage = {
      id: messageId,
      spaceId,
      senderId: "me",
      kind: "message",
      blocks: [{ type: "text", text }],
      createdAt: new Date().toISOString(),
      deliveryState: "sent"
    };
    store.messages[spaceId] = (store.messages[spaceId] || []).map((item) => item.id === messageId ? message : item);
    const space = store.spaces.find((item) => item.id === spaceId);
    if (space) {
      space.lastActivityAt = message.createdAt;
      space.lastPreview = text;
    }
    return wait(message);
  }

  async listParticipants(): Promise<Participant[]> {
    return wait([...store.participants]);
  }

  async getParticipant(participantId: string): Promise<Participant | null> {
    return wait(store.participants.find((participant) => participant.id === participantId) || null);
  }

  async searchParticipants(query: string): Promise<Participant[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return this.listParticipants();
    return wait(store.participants.filter((participant) => {
      return participant.displayName.toLowerCase().includes(normalized)
        || participant.handle?.toLowerCase().includes(normalized)
        || participant.title?.toLowerCase().includes(normalized);
    }));
  }

  async createDirectSpace(participantId: string): Promise<CollaborationSpace> {
    if (participantId === "me") throw new Error("不能和当前身份创建一对一协作空间");
    const existing = store.spaces.find((space) => space.kind === "direct" && space.participantIds.includes(participantId));
    if (existing) return wait(existing);
    const participant = store.participants.find((item) => item.id === participantId);
    if (!participant) throw new Error("没有找到参与者");
    if (participant.relationship !== "connected") throw new Error("请先建立联系，再开始一对一协作空间");
    const space: CollaborationSpace = {
      id: `direct-${participantId}`,
      kind: "direct",
      title: `与${participant.displayName}的对话`,
      participantIds: ["me", participantId],
      lastActivityAt: new Date().toISOString(),
      lastPreview: "新的协作空间已创建。"
    };
    store.spaces.unshift(space);
    store.messages[space.id] = [
      {
        id: `${space.id}-created`,
        spaceId: space.id,
        kind: "system_event",
        blocks: [{ type: "text", text: "一对一协作空间已创建。" }],
        createdAt: space.lastActivityAt!,
        deliveryState: "sent"
      }
    ];
    return wait(space);
  }

  async createSpace(input: { title: string; participantIds: string[] }): Promise<CollaborationSpace> {
    const selected = Array.from(new Set(["me", ...input.participantIds])).filter((id) => {
      return store.participants.some((participant) => participant.id === id);
    });
    if (!input.title.trim()) throw new Error("请填写协作空间名称");
    if (selected.length < 2) throw new Error("请至少选择一位参与者");
    const unavailable = selected
      .filter((id) => id !== "me")
      .map((id) => store.participants.find((participant) => participant.id === id))
      .filter((participant) => participant?.relationship !== "connected");
    if (unavailable.length) throw new Error("只能邀请已建立联系的参与者加入协作空间");
    const id = `space-${Date.now()}`;
    const space: CollaborationSpace = {
      id,
      kind: selected.length === 2 ? "direct" : "multi",
      title: input.title.trim(),
      participantIds: selected,
      lastActivityAt: new Date().toISOString(),
      lastPreview: "新的协作空间已创建。"
    };
    store.spaces.unshift(space);
    store.messages[id] = [
      {
        id: `${id}-created`,
        spaceId: id,
        kind: "system_event",
        blocks: [{ type: "text", text: "协作空间已创建，发送第一条消息开始协作。" }],
        createdAt: space.lastActivityAt!,
        deliveryState: "sent"
      }
    ];
    return wait(space);
  }

  async listContactRequests(): Promise<ContactRequest[]> {
    return wait(store.requests.filter((request) => request.status === "pending"));
  }

  async createContactRequest(participantId: string, message?: string): Promise<ContactRequest> {
    const participant = store.participants.find((item) => item.id === participantId);
    if (!participant) throw new Error("没有找到参与者");
    participant.relationship = "pending_outbound";
    const request: ContactRequest = {
      id: `outbound-${participantId}-${Date.now()}`,
      participant,
      message,
      status: "pending"
    };
    store.requests.push(request);
    return wait(request);
  }

  async acceptContactRequest(requestId: string): Promise<ContactRequest> {
    const request = store.requests.find((item) => item.id === requestId);
    if (!request) throw new Error("没有找到联系请求");
    request.status = "accepted";
    request.participant.relationship = "connected";
    store.inbox = store.inbox.filter((item) => item.requestId !== requestId);
    return wait(request);
  }

  async rejectContactRequest(requestId: string): Promise<ContactRequest> {
    const request = store.requests.find((item) => item.id === requestId);
    if (!request) throw new Error("没有找到联系请求");
    request.status = "rejected";
    request.participant.relationship = "none";
    store.inbox = store.inbox.filter((item) => item.requestId !== requestId);
    return wait(request);
  }

  async listInboxItems(): Promise<InboxItem[]> {
    const requestItems = store.requests
      .filter((request) => request.status === "pending")
      .map<InboxItem>((request) => ({
        id: `request-${request.id}`,
        kind: "request",
        priority: "action",
        title: `${request.participant.displayName} 请求建立联系`,
        detail: request.message || "对方未填写说明。",
        createdAt: new Date().toISOString(),
        participantId: request.participant.id,
        requestId: request.id,
        status: "open"
      }));
    return wait([...requestItems, ...store.inbox.filter((item) => item.status === "open")]);
  }

  async completeInboxItem(itemId: string, action: "approve" | "reject" | "dismiss" = "dismiss"): Promise<void> {
    const item = store.inbox.find((candidate) => candidate.id === itemId);
    if (item) {
      const approvalPassed = item.kind === "approval" && action !== "reject";
      item.status = "done";
      if (item.spaceId && item.flowId && item.stepId) {
        const flow = store.flows.find((candidate) => candidate.id === item.flowId && candidate.spaceId === item.spaceId);
        const stepIndex = flow?.steps.findIndex((step) => step.id === item.stepId) ?? -1;
        const step = stepIndex >= 0 ? flow?.steps[stepIndex] : undefined;

        if (flow && step && approvalPassed) {
          step.status = "completed";
          const nextStep = flow.steps[stepIndex + 1];
          if (nextStep) {
            nextStep.status = "completed";
            flow.waitingStepId = undefined;
            flow.status = flow.steps.every((candidate) => candidate.status === "completed") ? "completed" : flow.status;
          }
        }

        if (flow && step && action === "reject") {
          step.status = "failed";
          flow.waitingStepId = undefined;
          flow.status = "paused";
        }
      }

      if (item.spaceId && item.flowId && approvalPassed) {
        store.messages[item.spaceId] = [
          ...(store.messages[item.spaceId] || []),
          flowEvent(`flow-done-${Date.now()}`, item.spaceId, "人工审批已通过，流程已写回协作空间。", item.flowId, item.stepId)
        ];
      }

      if (item.spaceId && item.flowId && action === "reject") {
        store.messages[item.spaceId] = [
          ...(store.messages[item.spaceId] || []),
          flowEvent(`flow-rejected-${Date.now()}`, item.spaceId, "人工审批已退回，流程暂停等待调整。", item.flowId, item.stepId)
        ];
      }
    }
    await wait(undefined);
  }

  async listFlows(spaceId?: string): Promise<CollaborationFlow[]> {
    return wait(store.flows.filter((flow) => !spaceId || flow.spaceId === spaceId));
  }

  async getFlow(spaceId: string, flowId: string): Promise<CollaborationFlow | null> {
    return wait(store.flows.find((flow) => flow.spaceId === spaceId && flow.id === flowId) || null);
  }

  async createFlow(input: { spaceId: string; title?: string }): Promise<CollaborationFlow> {
    const space = store.spaces.find((item) => item.id === input.spaceId);
    if (!space) throw new Error("没有找到协作空间");
    const flow: CollaborationFlow = {
      id: `draft-${Date.now()}`,
      spaceId: input.spaceId,
      title: input.title?.trim() || "新的协作流程",
      status: "draft",
      trigger: `当 ${space.title} 出现需要重复推进的协作`,
      steps: [
        { id: "trigger", kind: "trigger", title: "监听空间事件", detail: `来自 ${space.title}`, status: "idle" },
        { id: "request", kind: "request_participant", title: "选择下一位参与者", detail: "填写请求内容和等待条件", status: "idle" },
        { id: "post", kind: "post_to_space", title: "写回协作空间", detail: "流程完成后记录结果", status: "idle" }
      ]
    };
    store.flows.push(flow);
    space.hasActiveFlow = true;
    space.lastActivityAt = new Date().toISOString();
    space.lastPreview = "新的协作流程草稿已创建。";
    store.messages[input.spaceId] = [
      ...(store.messages[input.spaceId] || []),
      flowEvent(`flow-created-${Date.now()}`, input.spaceId, "新的协作流程草稿已绑定到此空间。", flow.id)
    ];
    return wait(flow);
  }

  async createFlowFromMessage(spaceId: string, messageId: string): Promise<CollaborationFlow> {
    const flow: CollaborationFlow = {
      id: `draft-${Date.now()}`,
      spaceId,
      title: "基于消息的新流程",
      status: "draft",
      trigger: "当这条消息的上下文需要重复协作",
      steps: [
        { id: "trigger", kind: "trigger", title: "引用触发消息", detail: `消息 ${messageId}`, status: "completed" },
        { id: "request", kind: "request_participant", title: "选择下一位参与者", detail: "等待补充请求内容", status: "idle" },
        { id: "post", kind: "post_to_space", title: "写回协作空间", detail: "流程完成后记录结果", status: "idle" }
      ]
    };
    store.flows.push(flow);
    store.spaces.find((space) => space.id === spaceId)!.hasActiveFlow = true;
    store.messages[spaceId] = [
      ...(store.messages[spaceId] || []),
      flowEvent(`flow-created-${Date.now()}`, spaceId, "已基于此消息创建协作流程草稿。", flow.id)
    ];
    return wait(flow);
  }

  async inviteParticipantToSpace(spaceId: string, participantId: string): Promise<CollaborationSpace> {
    const space = store.spaces.find((item) => item.id === spaceId);
    const participant = store.participants.find((item) => item.id === participantId);
    if (!space) throw new Error("没有找到协作空间");
    if (!participant) throw new Error("没有找到参与者");
    if (participant.relationship !== "connected" && participant.relationship !== "self") {
      throw new Error("请先建立联系，再邀请参与者加入空间");
    }
    if (!space.participantIds.includes(participantId)) {
      space.participantIds = [...space.participantIds, participantId];
      space.kind = space.participantIds.length > 2 ? "multi" : "direct";
      space.lastActivityAt = new Date().toISOString();
      space.lastPreview = `${participant.displayName} 已加入协作空间。`;
      store.messages[spaceId] = [
        ...(store.messages[spaceId] || []),
        {
          id: `invite-${Date.now()}`,
          spaceId,
          kind: "system_event",
          blocks: [{ type: "text", text: `${participant.displayName} 已加入协作空间。` }],
          createdAt: space.lastActivityAt,
          deliveryState: "sent"
        }
      ];
    }
    return wait(space);
  }
}
