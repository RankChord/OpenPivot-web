import type {
  CollaborationFlow,
  CollaborationSpace,
  ContactRequest,
  FlowRunStartResult,
  FlowTaskCompleteResult,
  InboxItem,
  Participant,
  SpaceMessage
} from "./models";

export interface WorkspaceAdapter {
  listSpaces(): Promise<CollaborationSpace[]>;
  getSpace(spaceId: string): Promise<CollaborationSpace | null>;
  listMessages(spaceId: string): Promise<SpaceMessage[]>;
  sendMessage(spaceId: string, content: string, clientId?: string): Promise<SpaceMessage>;
  retryMessage?(spaceId: string, messageId: string): Promise<SpaceMessage>;

  listParticipants(): Promise<Participant[]>;
  getParticipant(participantId: string): Promise<Participant | null>;
  searchParticipants(query: string): Promise<Participant[]>;
  createSpace?(input: { title: string; participantIds: string[] }): Promise<CollaborationSpace>;
  createDirectSpace(participantId: string): Promise<CollaborationSpace>;

  listContactRequests(): Promise<ContactRequest[]>;
  createContactRequest(participantId: string, message?: string): Promise<ContactRequest>;
  acceptContactRequest(requestId: string): Promise<ContactRequest>;
  rejectContactRequest(requestId: string): Promise<ContactRequest>;

  listInboxItems(): Promise<InboxItem[]>;
  completeInboxItem(itemId: string, action?: "approve" | "reject" | "dismiss"): Promise<void>;

  listFlows(spaceId?: string): Promise<CollaborationFlow[]>;
  getFlow(spaceId: string, flowId: string): Promise<CollaborationFlow | null>;
  createFlow(input: { spaceId: string; title?: string }): Promise<CollaborationFlow>;
  createFlowFromMessage(spaceId: string, messageId: string): Promise<CollaborationFlow>;
  startFlowRun?(input: { spaceId: string; flowId: string; assigneeId: string; taskTitle: string; taskDescription?: string }): Promise<FlowRunStartResult>;
  completeFlowTask?(taskId: string, result: string): Promise<FlowTaskCompleteResult>;
  inviteParticipantToSpace(spaceId: string, participantId: string): Promise<CollaborationSpace>;
}
