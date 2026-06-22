const DEFAULT_API_BASE_URL = import.meta.env.VITE_OPENPIVOT_API_URL ?? "";

export function defaultApiBaseUrl(): string {
  return DEFAULT_API_BASE_URL.replace(/\/+$/, "");
}

export const APP_COPY = {
  connectedOnlyNotice: "真实后端模式只展示当前 Rust 后端已经实现的能力。",
  demoLabel: "概念预览 · 演示数据",
  previewOnly: "仅作预览 · 执行引擎未接入"
};
