import type { MessageBlock, Participant, SpaceMessage } from "../domain/models";

export function blockText(block: MessageBlock) {
  if (block.type === "text") return block.text;
  if (block.type === "markdown") return block.source;
  if (block.type === "code") return block.source;
  if (block.type === "file") return block.name;
  return `引用 ${block.messageId}`;
}

export function shortDate(value?: string) {
  if (!value) return "暂无动态";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function shortTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function deliveryLabel(state?: SpaceMessage["deliveryState"]) {
  if (state === "sending") return "发送中";
  if (state === "failed") return "发送失败";
  return "已发送";
}

export function directSubtitle(participants: Participant[]) {
  if (!participants.length) return "一对一协作空间";
  return participants.map((participant) => participant.displayName).join("、");
}

export function relationshipLabel(value: Participant["relationship"]) {
  if (value === "self") return "当前身份";
  if (value === "connected") return "已建立联系";
  if (value === "pending_inbound") return "等待你处理联系请求";
  if (value === "pending_outbound") return "联系请求已发送";
  return "尚未建立联系";
}
