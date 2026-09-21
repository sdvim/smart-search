import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { searchApi } from "./server/plugin.ts";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/**/*.test.ts"] } },
      {
        plugins: [react({ compiler: { logDiagnostics: true } }), searchApi()],
        test: {
          name: "browser",
          include: ["tests/**/*.browser.tsx"],
          browser: {
            enabled: true,
            provider: playwright({
              launchOptions: { executablePath: process.env.BROWSER_EXECUTABLE_PATH },
              contextOptions: { hasTouch: true, colorScheme: "light" },
            }),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
