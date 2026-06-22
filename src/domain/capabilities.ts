import type { ProductCapabilities, WorkspaceEnvironment } from "./models";
import type { ProductMode } from "../types";

export const demoCapabilities: ProductCapabilities = {
  directSpaces: true,
  groupSpaces: true,
  participantSearch: true,
  contactRequests: true,
  realtimeMessages: false,
  attachments: false,
  richMessages: true,
  collaborationFlows: true,
  flowRuns: true,
  approvals: true,
  connectionManagement: true
};

export const rustCapabilities: ProductCapabilities = {
  directSpaces: true,
  groupSpaces: false,
  participantSearch: true,
  contactRequests: true,
  realtimeMessages: false,
  attachments: false,
  richMessages: false,
  collaborationFlows: false,
  flowRuns: false,
  approvals: false,
  connectionManagement: false
};

export function environmentForMode(mode: ProductMode, currentUserId: string): WorkspaceEnvironment {
  return {
    mode,
    currentUserId,
    capabilities: mode === "demo" ? demoCapabilities : rustCapabilities
  };
}

export function unavailableReason(feature: keyof ProductCapabilities, capabilities: ProductCapabilities): string | null {
  if (capabilities[feature]) return null;
  const labels: Record<keyof ProductCapabilities, string> = {
    directSpaces: "当前环境暂不支持一对一协作空间。",
    groupSpaces: "当前后端暂不支持多人协作空间。",
    participantSearch: "当前环境暂不支持参与者搜索。",
    contactRequests: "当前环境暂不支持联系请求。",
    realtimeMessages: "当前版本使用轮询同步，实时推送尚未接入。",
    attachments: "附件能力尚未接入后端协议。",
    richMessages: "富文本消息尚未接入当前后端协议。",
    collaborationFlows: "协作流程是演示能力，真实后端暂未接入。",
    flowRuns: "流程运行记录是演示能力，真实后端暂未接入。",
    approvals: "审批处理是演示能力，真实后端暂未接入。",
    connectionManagement: "连接管理不在当前后端协议范围内。"
  };
  return labels[feature];
}
