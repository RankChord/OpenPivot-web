import { AtSign, Code2, Paperclip, Send } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { unavailableReason } from "../../domain/capabilities";
import type { ProductCapabilities } from "../../domain/models";
export function Composer({ placeholder, sending, onSend, capabilities }: {
  placeholder: string;
  sending: boolean;
  onSend: (text: string) => void;
  capabilities: ProductCapabilities;
}) {
  const [value, setValue] = useState("");
  const [composing, setComposing] = useState(false);
  const submit = () => {
    const text = value.trim();
    if (!text || sending) return;
    onSend(text);
    setValue("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !composing) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <form className="floating-composer" onSubmit={(event) => {
      event.preventDefault();
      submit();
    }}>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        placeholder={placeholder}
      />
      <div className="composer-bottom">
        <div className="composer-actions">
          <DisabledAction icon={<Paperclip size={16} />} label="附件" reason={unavailableReason("attachments", capabilities)} />
          <DisabledAction icon={<AtSign size={16} />} label="提及" reason="提及选择器尚未接入，先用文本 @ 说明。" />
          <DisabledAction icon={<Code2 size={16} />} label="代码" reason={unavailableReason("richMessages", capabilities)} />
          <DisabledAction icon={<GitBranch size={16} />} label="流程动作" reason="请先从具体消息创建协作流程。" />
        </div>
        <button className={clsx("send-circle", value.trim() && "active")} aria-label="发送" disabled={!value.trim() || sending}>
          <Send size={17} />
        </button>
      </div>
      <small>Enter 发送 · Shift + Enter 换行</small>
    </form>
  );
}

export function DisabledAction({ icon, label, reason }: { icon: ReactNode; label: string; reason: string | null }) {
  return <button type="button" disabled title={reason || `${label}尚未开放`}>{icon}</button>;
}
import clsx from "clsx";
import { GitBranch } from "lucide-react";
