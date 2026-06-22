import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pivot: {
          ink: "#17212b",
          rail: "#111820",
          muted: "#667588",
          line: "#d9e2ec",
          surface: "#ffffff",
          wash: "#f5f7fa",
          accent: "#0d7c66",
          accentDark: "#075f50",
          blue: "#2463eb"
        }
      },
      boxShadow: {
        panel: "0 18px 44px rgba(17, 24, 32, 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;
