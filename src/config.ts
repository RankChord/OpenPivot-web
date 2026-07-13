const DEFAULT_API_BASE_URL = import.meta.env.VITE_OPENPIVOT_API_URL ?? "";

export function defaultApiBaseUrl(): string {
  return DEFAULT_API_BASE_URL.replace(/\/+$/, "");
}

export const APP_COPY = {
  connectedOnlyNotice: "当前界面只展示真实后端已经实现的能力。",
  previewOnly: "仅作预览 · 执行引擎未接入"
};
