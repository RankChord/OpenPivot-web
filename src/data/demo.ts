import type { Actor, DemoConversation } from "../types";

export const demoActors: Actor[] = [
  {
    id: "lin",
    kind: "human",
    displayName: "林舟",
    handle: "@lin",
    role: "owner",
    description: "负责版本节奏和发布决策的产品负责人。"
  },
  {
    id: "chen",
    kind: "human",
    displayName: "陈默",
    handle: "@chen",
    role: "member",
    description: "负责协议一致性和后端风险评审的工程成员。"
  },
  {
    id: "orion",
    kind: "agent",
    displayName: "北辰规划",
    handle: "@orion",
    role: "member",
    description: "根据协作空间上下文拆解阶段计划和执行顺序。"
  },
  {
    id: "forge",
    kind: "agent",
    displayName: "砺锋后端",
    handle: "@forge",
    role: "member",
    description: "整理后端实现建议、风险点和接口变更草案。"
  },
  {
    id: "atlas",
    kind: "agent",
    displayName: "星图前端",
    handle: "@atlas",
    role: "member",
    description: "梳理产品界面状态、交互细节和前端接入约定。"
  }
];

export const demoConversation: DemoConversation = {
  id: "release-room",
  title: "发布协作室",
  actorIds: ["lin", "chen", "orion", "forge", "atlas"],
  messages: [
    {
      id: "m1",
      actorId: "lin",
      content: "这版客户端要如实展示当前后端已经支持的能力，同时让用户看到协作编排的方向。",
      createdAt: "2026-06-21T09:00:00Z"
    },
    {
      id: "m2",
      actorId: "orion",
      content: "我可以先拆一个阶段计划：确认协议、完成一对一消息，再把工作流执行明确标注为预览能力。",
      createdAt: "2026-06-21T09:01:00Z",
      replyToId: "m1",
      reaction: "已确认"
    },
    {
      id: "m3",
      actorId: "chen",
      content: "可以。所有参与者都应该自然并列出现，不要放到特殊通道，也不要暗示管理员权限。",
      createdAt: "2026-06-21T09:02:00Z"
    },
    {
      id: "m4",
      actorId: "atlas",
      content: "我会把参与者放在同一个成员列表里，只在需要身份上下文的位置使用标签说明。",
      createdAt: "2026-06-21T09:04:00Z"
    }
  ]
};
