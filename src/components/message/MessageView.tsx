import { GitBranch } from "lucide-react";
import type { MessageBlock, Participant, SpaceMessage } from "../../domain/models";
import { blockText, deliveryLabel, shortTime } from "../../shared/format";
import { ActorAvatar } from "../avatar/ActorAvatar";
export function MessageView({ message, participants, currentUserId, canCreateFlow, onCreateFlow, createFlowPending, onRetryMessage, retryPending }: {
  message: SpaceMessage;
  participants: Participant[];
  currentUserId?: string;
  canCreateFlow: boolean;
  onCreateFlow: (messageId: string) => void;
  createFlowPending: boolean;
  onRetryMessage?: (messageId: string) => void;
  retryPending?: boolean;
}) {
  const sender = participants.find((participant) => participant.id === message.senderId);
  const isOwn = !!currentUserId && message.senderId === currentUserId;
  const canRetry = message.deliveryState === "failed" && !!onRetryMessage;
  const showActions = canRetry || canCreateFlow;
  if (message.kind !== "message") {
    return (
      <div className="tool-line" data-message-id={message.id} id={message.id}>
        <span />
        <p>{message.blocks.map(blockText).join(" ")}</p>
      </div>
    );
  }
  return (
    <article className="space-message" data-own={isOwn ? "true" : "false"} data-delivery-state={message.deliveryState || "sent"} data-message-id={message.id} id={message.id}>
      <div className="message-author">
        <ActorAvatar id={sender?.id || "system"} size="sm" />
        <span>
          <strong>{sender?.displayName || "系统"}</strong>
          <small>{shortTime(message.createdAt)} · {deliveryLabel(message.deliveryState)}</small>
        </span>
      </div>
      <div className="content-card">
        {message.blocks.map((block, index) => <MessageBlockView block={block} key={`${message.id}-${index}`} />)}
      </div>
      {showActions && <div className="message-actions">
        {canRetry && (
          <button className="text-button" disabled={retryPending} onClick={() => onRetryMessage?.(message.id)}>
            重试
          </button>
        )}
        {canCreateFlow && (
          <button className="text-button" disabled={createFlowPending || message.deliveryState === "sending" || message.deliveryState === "failed"} onClick={() => onCreateFlow(message.id)}>
            基于此消息创建协作流程
          </button>
        )}
      </div>}
    </article>
  );
}

export function MessageBlockView({ block }: { block: MessageBlock }) {
  if (block.type === "code") return <pre><code>{block.source}</code></pre>;
  if (block.type === "file") return <p>{block.name}{block.size ? ` · ${block.size}` : ""}</p>;
  if (block.type === "quote") return <blockquote>引用消息 {block.messageId}</blockquote>;
  if (block.type === "markdown") {
    return (
      <>
        {block.source.split("\n").filter(Boolean).map((line) => line.startsWith("- ")
          ? <ul key={line}><li>{line.slice(2)}</li></ul>
          : <p key={line}>{line}</p>)}
      </>
    );
  }
  return <p>{block.text}</p>;
}
