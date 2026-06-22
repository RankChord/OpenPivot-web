import clsx from "clsx";
import { LogOut } from "lucide-react";
import { useState } from "react";
import type { AppContextValue } from "../../app/AppContext";
import { PageTitle } from "../../components/feedback/Feedback";
export function SettingsPage({ app }: { app: AppContextValue }) {
  const [apiUrl, setApiUrl] = useState(app.apiBaseUrl);
  return (
    <section className="center-page page-fade">
      <div className="main-column narrow">
        <PageTitle title="我的" subtitle="Demo 和真实后端是两个独立数据环境，切换时会离开当前环境。" />
        <div className="settings-list">
          <section>
            <h2>运行模式</h2>
            <div className="segmented">
              <button className={clsx(app.mode === "connected" && "active")} onClick={() => app.requestMode("connected")}>真实后端</button>
              <button className={clsx(app.mode === "demo" && "active")} onClick={() => app.requestMode("demo")}>演示数据</button>
            </div>
          </section>
          <section>
            <h2>Rust 后端地址</h2>
            <div className="inline-field">
              <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder="同源 /v1 代理" />
              <button onClick={() => app.setApiBaseUrl(apiUrl)}>保存</button>
            </div>
          </section>
          <section>
            <h2>主题</h2>
            <div className="segmented">
              <button className={clsx(app.theme === "light" && "active")} onClick={() => app.setTheme("light")}>浅色</button>
              <button className={clsx(app.theme === "dark" && "active")} onClick={() => app.setTheme("dark")}>深色</button>
            </div>
          </section>
          <section>
            <h2>会话</h2>
            <button className="danger-button" onClick={() => void app.logout()}>
              <LogOut size={16} />
              退出登录
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}
