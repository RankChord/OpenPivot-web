import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_OPENPIVOT_PROXY_TARGET || "http://10.0.0.214:3000";
  const apiProxy = {
    "/v1": {
      target: proxyTarget,
      changeOrigin: true
    }
  };

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: apiProxy
    },
    preview: {
      host: "0.0.0.0",
      port: 4173,
      proxy: apiProxy
    }
  };
});
