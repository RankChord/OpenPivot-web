import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { DemoWorkspaceAdapter } from "../domain/demoWorkspaceAdapter";
import { ConnectedWorkspaceAdapter } from "../domain/connectedWorkspaceAdapter";
import { environmentForMode } from "../domain/capabilities";
import type { SessionState } from "../domain/models";
import type { WorkspaceAdapter } from "../domain/workspaceAdapter";
import { RustHttpAdapter } from "../adapters/rustHttpAdapter";
import { LocalRefreshTokenStore } from "../adapters/tokenStore";
import { defaultApiBaseUrl } from "../config";
import type { AuthTokens, ProductMode } from "../types";
import { Shell } from "./AppShell";
import type { AppContextValue, ThemeMode } from "./AppContext";
import { InboxPage } from "../features/inbox/InboxPage";
import { SpacesPage, CreateSpacePage, SpaceTimelinePage, SpaceParticipantsPage, SpaceFlowsPage } from "../features/spaces/SpacePages";
import { FlowsOverviewPage, FlowDetailPage, CreateFlowPage } from "../features/flows/FlowPages";
import { ParticipantsPage, ParticipantDetailPage } from "../features/participants/ParticipantPages";
import { SettingsPage } from "../features/settings/SettingsPage";
import { AuthPage, AuthRequired, BootingPage } from "../features/auth/AuthPages";
import { restoreConnectedSession } from "./sessionBootstrap";

const tokenStore = new LocalRefreshTokenStore();
function App() {
  const queryClient = useQueryClient();
  const [mode, setModeState] = useState<ProductMode>(() => (localStorage.getItem("openpivot.web.mode") as ProductMode) || "demo");
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("openpivot.web.theme") as ThemeMode) || "light");
  const [apiBaseUrl, setApiBaseUrl] = useState(() => localStorage.getItem("openpivot.web.apiBaseUrl") || defaultApiBaseUrl());
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState>(() => mode === "demo"
    ? { status: "authenticated", userId: "me", username: "Ling" }
    : { status: "booting" });
  const [workspaceVersion, setWorkspaceVersion] = useState(0);

  const rustAdapter = useMemo(() => {
    const adapter = new RustHttpAdapter({ baseUrl: apiBaseUrl, refreshTokenStore: tokenStore });
    adapter.setAccessToken(accessToken);
    return adapter;
  }, [apiBaseUrl, accessToken]);

  useEffect(() => {
    localStorage.setItem("openpivot.web.mode", mode);
    localStorage.setItem("openpivot.web.theme", theme);
    localStorage.setItem("openpivot.web.visualSystem", "marvis");
    localStorage.setItem("openpivot.web.apiBaseUrl", apiBaseUrl);
    document.documentElement.dataset.theme = theme;
  }, [mode, theme, apiBaseUrl]);

  useEffect(() => {
    let canceled = false;
    if (mode === "demo") {
      setAccessToken(null);
      setSession({ status: "authenticated", userId: "me", username: "Ling" });
      return;
    }

    const boot = async () => {
      const adapter = new RustHttpAdapter({ baseUrl: apiBaseUrl, refreshTokenStore: tokenStore });
      if (!canceled) setSession({ status: "booting" });
      const result = await restoreConnectedSession(adapter, tokenStore);
      if (!canceled) {
        setAccessToken(result.accessToken);
        setSession(result.session);
      }
    };

    void boot();
    return () => {
      canceled = true;
    };
  }, [mode, apiBaseUrl]);

  const workspace = useMemo<WorkspaceAdapter | null>(() => {
    if (mode === "demo") return new DemoWorkspaceAdapter();
    if (session.status !== "authenticated" || !session.sourceUserId) return null;
    return new ConnectedWorkspaceAdapter(rustAdapter, session.sourceUserId);
  }, [mode, rustAdapter, session]);

  const currentUserId = session.status === "authenticated" ? session.userId : "anonymous";
  const environment = useMemo(() => environmentForMode(mode, currentUserId), [mode, currentUserId]);

  const requestMode = useCallback((nextMode: ProductMode) => {
    if (nextMode === mode) return;
    const ok = window.confirm("切换数据环境会离开当前环境，并清空当前页面缓存。继续吗？");
    if (!ok) return;
    queryClient.clear();
    setWorkspaceVersion((current) => current + 1);
    setAccessToken(null);
    setModeState(nextMode);
    setSession(nextMode === "demo" ? { status: "authenticated", userId: "me", username: "Ling" } : { status: "booting" });
  }, [mode, queryClient]);

  const refreshWorkspace = useCallback(() => {
    setWorkspaceVersion((current) => current + 1);
  }, []);

  const setConnectedTokens = useCallback(async (tokens: AuthTokens, username?: string) => {
    setAccessToken(tokens.accessToken);
    rustAdapter.setAccessToken(tokens.accessToken);
    const me = await rustAdapter.me();
    setSession({ status: "authenticated", userId: `user-${me.user_id}`, username, sourceUserId: me.user_id });
    refreshWorkspace();
    await queryClient.invalidateQueries();
  }, [queryClient, refreshWorkspace, rustAdapter]);

  const logout = useCallback(async () => {
    try {
      await rustAdapter.logout();
    } finally {
      tokenStore.clear();
      setAccessToken(null);
      setSession(mode === "demo" ? { status: "authenticated", userId: "me", username: "Ling" } : { status: "anonymous" });
      refreshWorkspace();
      queryClient.clear();
    }
  }, [mode, queryClient, refreshWorkspace, rustAdapter]);

  const app: AppContextValue = {
    mode,
    requestMode,
    theme,
    setTheme,
    apiBaseUrl,
    setApiBaseUrl,
    session,
    setSession,
    workspaceVersion,
    refreshWorkspace,
    workspace,
    environment,
    rustAdapter,
    setConnectedTokens,
    logout
  };

  return (
    <Routes>
      <Route element={<Shell app={app} />}>
        <Route index element={<Navigate to="/inbox" replace />} />
        <Route path="/inbox" element={<RequireWorkspace app={app}><InboxPage app={app} /></RequireWorkspace>} />
        <Route path="/spaces" element={<RequireWorkspace app={app}><SpacesPage app={app} /></RequireWorkspace>} />
        <Route path="/spaces/new" element={<RequireWorkspace app={app}><CreateSpacePage app={app} /></RequireWorkspace>} />
        <Route path="/spaces/:spaceId" element={<RequireWorkspace app={app}><SpaceTimelinePage app={app} /></RequireWorkspace>} />
        <Route path="/spaces/:spaceId/participants" element={<RequireWorkspace app={app}><SpaceParticipantsPage app={app} /></RequireWorkspace>} />
        <Route path="/spaces/:spaceId/flows" element={<RequireWorkspace app={app}><SpaceFlowsPage app={app} /></RequireWorkspace>} />
        <Route path="/spaces/:spaceId/flows/:flowId" element={<RequireWorkspace app={app}><FlowDetailPage app={app} /></RequireWorkspace>} />
        <Route path="/participants" element={<RequireWorkspace app={app}><ParticipantsPage app={app} /></RequireWorkspace>} />
        <Route path="/participants/:participantId" element={<RequireWorkspace app={app}><ParticipantDetailPage app={app} /></RequireWorkspace>} />
        <Route path="/flows" element={<RequireWorkspace app={app}><FlowsOverviewPage app={app} /></RequireWorkspace>} />
        <Route path="/flows/new" element={<RequireWorkspace app={app}><CreateFlowPage app={app} /></RequireWorkspace>} />
        <Route path="/settings" element={<SettingsPage app={app} />} />
        <Route path="/login" element={<AuthPage app={app} kind="login" />} />
        <Route path="/register" element={<AuthPage app={app} kind="register" />} />
        <Route path="/messages" element={<LegacyMessagesRedirect />} />
        <Route path="/workflows" element={<Navigate to="/flows" replace />} />
        <Route path="/contacts" element={<Navigate to="/participants" replace />} />
        <Route path="/requests" element={<Navigate to="/inbox" replace />} />
        <Route path="/connections" element={<Navigate to="/settings" replace />} />
        <Route path="*" element={<Navigate to="/inbox" replace />} />
      </Route>
    </Routes>
  );
}

function RequireWorkspace({ app, children }: { app: AppContextValue; children: ReactNode }) {
  if (app.mode === "connected") {
    if (app.session.status === "booting") return <BootingPage />;
    if (app.session.status !== "authenticated") return <AuthRequired app={app} />;
  }
  return <>{children}</>;
}

export function LegacyMessagesRedirect() {
  const [params] = useSearchParams();
  const chat = params.get("chat");
  if (!chat) return <Navigate to="/inbox" replace />;
  const legacySpaceIds = new Set(["core", "release", "protocol", "orion", "lin"]);
  const spaceId = legacySpaceIds.has(chat) ? chat : "";
  if (!spaceId) return <Navigate to="/inbox" replace />;
  return <Navigate to={`/spaces/${spaceId}`} replace />;
}

export default App;
