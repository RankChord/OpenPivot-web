import type { QueryClient } from "@tanstack/react-query";
import type { RustHttpAdapter } from "../adapters/rustHttpAdapter";
import type { AuthTokens, ProductMode } from "../types";
import type {
  CollaborationFlow,
  SessionState,
  WorkspaceEnvironment
} from "../domain/models";
import type { WorkspaceAdapter } from "../domain/workspaceAdapter";

export type ThemeMode = "light" | "dark";

export interface AppContextValue {
  mode: ProductMode;
  requestMode: (mode: ProductMode) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  apiBaseUrl: string;
  setApiBaseUrl: (url: string) => void;
  session: SessionState;
  setSession: (session: SessionState) => void;
  workspaceVersion: number;
  refreshWorkspace: () => void;
  workspace: WorkspaceAdapter | null;
  environment: WorkspaceEnvironment;
  rustAdapter: RustHttpAdapter;
  setConnectedTokens: (tokens: AuthTokens, username?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function invalidateWorkspaceQueries(queryClient: QueryClient, mode: ProductMode) {
  return queryClient.invalidateQueries({ queryKey: ["workspace", mode], refetchType: "all" });
}

export function applyInboxApprovalToFlowCache(flow: CollaborationFlow | null | undefined, stepId: string, action: "approve" | "reject" | "dismiss") {
  if (!flow) return flow;
  const steps = flow.steps.map((step) => ({ ...step }));
  const stepIndex = steps.findIndex((step) => step.id === stepId);
  if (stepIndex < 0) return flow;

  if (action === "reject") {
    steps[stepIndex].status = "failed";
    return { ...flow, status: "paused" as const, waitingStepId: undefined, steps };
  }

  steps[stepIndex].status = "completed";
  const nextStep = steps[stepIndex + 1];
  if (nextStep) nextStep.status = "completed";
  const status = steps.every((step) => step.status === "completed") ? "completed" as const : flow.status;
  return { ...flow, status, waitingStepId: undefined, steps };
}
