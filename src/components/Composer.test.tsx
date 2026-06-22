import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "../App";
import { demoCapabilities } from "../domain/capabilities";

describe("Composer", () => {
  it("sends with Enter when there is text", () => {
    const onSend = vi.fn();
    render(<Composer placeholder="输入消息" sending={false} onSend={onSend} capabilities={demoCapabilities} />);
    const textarea = screen.getByPlaceholderText("输入消息");

    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledWith("hello");
    expect(textarea).toHaveValue("");
  });

  it("keeps Shift Enter as a newline action", () => {
    const onSend = vi.fn();
    render(<Composer placeholder="输入消息" sending={false} onSend={onSend} capabilities={demoCapabilities} />);
    const textarea = screen.getByPlaceholderText("输入消息");

    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("hello");
  });

  it("does not send while IME composition is active", () => {
    const onSend = vi.fn();
    render(<Composer placeholder="输入消息" sending={false} onSend={onSend} capabilities={demoCapabilities} />);
    const textarea = screen.getByPlaceholderText("输入消息");

    fireEvent.change(textarea, { target: { value: "你好" } });
    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: "Enter" });
    fireEvent.compositionEnd(textarea);

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("你好");
  });
});
