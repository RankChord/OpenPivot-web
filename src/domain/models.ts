import type { ProductMode } from "../types";

export type ParticipantKind = "human" | "agent" | "unknown";
export type SpaceKind = "direct" | "multi";
export type DeliveryState = "sending" | "sent" | "failed";

export interface Participant {
  id: string;
  sourceId?: number;
  kind: ParticipantKind;
  displayName: string;
  handle?: string;
  title?: string;
  description?: string;
  connectionLabel?: string;
  relationship: "self" | "connected" | "pending_inbound" | "pending_outbound" | "none";
}

export interface CollaborationSpace {
  id: string;
  sourceConversationId?: number;
  kind: SpaceKind;
  title: string;
  participantIds: string[];
  pinned?: boolean;
  unreadCount?: number;
  lastActivityAt?: string;
  lastPreview?: string;
  hasActiveFlow?: boolean;
}

export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "markdown"; source: string }
  | { type: "code"; language?: string; source: string }
  | { type: "file"; name: string; size?: number }
  | { type: "quote"; messageId: string };

export interface SpaceMessage {
  id: string;
  spaceId: string;
  senderId?: string;
  kind: "message" | "system_event" | "flow_event";
  blocks: MessageBlock[];
  createdAt: string;
  deliveryState?: DeliveryState;
  relatedFlowId?: string;
  relatedStepId?: string;
}

export type FlowStepKind =
  | "trigger"
  | "request_participant"
  | "wait_for_response"
  | "approval"
  | "parallel"
  | "condition"
  | "delay"
  | "timeout"
  | "retry"
  | "escalate"
  | "post_to_space"
  | "finish";

export interface FlowStep {
  id: string;
  kind: FlowStepKind;
  title: string;
  detail: string;
  participantId?: string;
  status: "idle" | "running" | "waiting" | "completed" | "failed";
}

export interface CollaborationFlow {
  id: string;
  spaceId: string;
  title: string;
  status: "draft" | "active" | "paused" | "completed";
  trigger: string;
  steps: FlowStep[];
  lastRunAt?: string;
  waitingStepId?: string;
}

export interface InboxItem {
  id: string;
  kind: "approval" | "request" | "mention" | "unread" | "system";
  priority: "action" | "notice" | "background";
  title: string;
  detail: string;
  createdAt: string;
  spaceId?: string;
  messageId?: string;
  flowId?: string;
  stepId?: string;
  participantId?: string;
  requestId?: string;
  status: "open" | "done";
}

export interface ContactRequest {
  id: string;
  sourceId?: number;
  participant: Participant;
  message?: string | null;
  status: "pending" | "accepted" | "rejected" | "canceled";
}

export interface ProductCapabilities {
  directSpaces: boolean;
  groupSpaces: boolean;
  participantSearch: boolean;
  contactRequests: boolean;
  realtimeMessages: boolean;
  attachments: boolean;
  richMessages: boolean;
  collaborationFlows: boolean;
  flowRuns: boolean;
  approvals: boolean;
  spaceInvites: boolean;
  connectionManagement: boolean;
}

export type SessionState =
  | { status: "booting" }
  | { status: "anonymous" }
  | { status: "authenticated"; userId: string; username?: string; sourceUserId?: number }
  | { status: "error"; message: string };

export interface WorkspaceEnvironment {
  mode: ProductMode;
  capabilities: ProductCapabilities;
  currentUserId: string;
}
