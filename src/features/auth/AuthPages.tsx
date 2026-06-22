import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import type { AppContextValue } from "../../app/AppContext";
import { InlinePage } from "../../components/feedback/Feedback";
export function AuthRequired({ app }: { app: AppContextValue }) {
  return (
    <section className="center-page page-fade">
      <div className="main-column compact auth-required">
        <img src="/brand/logo-symbol.svg" alt="" />
        <h1>连接真实后端</h1>
        <p>当前处于真实后端模式。登录后可以读取真实参与者、联系请求、协作空间和消息。</p>
        <div className="button-row">
          <Link className="primary-button" to="/login">登录</Link>
          <Link className="quiet-button" to="/register">注册</Link>
          <button className="quiet-button" onClick={() => app.requestMode("demo")}>使用演示数据</button>
        </div>
      </div>
    </section>
  );
}

export function AuthPage({ app, kind }: { app: AppContextValue; kind: "login" | "register" }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({ username: "", password: "", nickname: "" });
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (values.username.length < 3) throw new Error("用户名至少 3 位");
      if (values.password.length < 8) throw new Error("密码至少 8 位");
      if (kind === "register" && !values.nickname.trim()) throw new Error("请填写昵称");
      if (kind === "register") await app.rustAdapter.register(values);
      const tokens = await app.rustAdapter.login(values);
      await app.setConnectedTokens(tokens, values.username);
    },
    onSuccess: () => navigate("/inbox"),
    onError: (err) => setError((err as Error).message)
  });

  return (
    <section className="auth-page page-fade">
      <div className="auth-preview-panel">
        <BrandHero />
        <div className="mini-transcript">
          <p>收件箱告诉你现在需要处理什么。</p>
          <p>协作空间保留完整上下文。</p>
        </div>
      </div>
      <form className="auth-form" onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        mutation.mutate();
      }}>
        <img src="/brand/logo-lockup.svg" alt="OpenPivot" />
        <h1>{kind === "login" ? "欢迎回来" : "创建 OpenPivot 身份"}</h1>
        <label>
          <span>用户名</span>
          <input value={values.username} onChange={(event) => setValues({ ...values, username: event.target.value })} autoComplete="username" />
        </label>
        {kind === "register" && (
          <label>
            <span>昵称</span>
            <input value={values.nickname} onChange={(event) => setValues({ ...values, nickname: event.target.value })} autoComplete="nickname" />
          </label>
        )}
        <label>
          <span>密码</span>
          <input value={values.password} type="password" onChange={(event) => setValues({ ...values, password: event.target.value })} autoComplete={kind === "login" ? "current-password" : "new-password"} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={mutation.isPending}>{kind === "login" ? "登录" : "注册并登录"}</button>
        <div className="auth-links">
          <Link to={kind === "login" ? "/register" : "/login"}>{kind === "login" ? "创建账号" : "已有账号"}</Link>
          <button type="button" onClick={() => app.requestMode("demo")}>使用演示数据</button>
        </div>
      </form>
    </section>
  );
}
export function BootingPage() {
  return <InlinePage title="正在恢复登录态" detail="正在检查 Refresh Token 并读取当前用户。" />;
}

export function BrandHero() {
  return (
    <div className="brand-hero">
      <img src="/brand/logo-symbol.svg" alt="" />
      <h1>OpenPivot</h1>
      <p>人与智能体平等协作的通信平台</p>
    </div>
  );
}
