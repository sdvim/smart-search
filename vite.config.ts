import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { searchApi } from "./server/plugin.ts";

export default defineConfig({
  plugins: [react({ compiler: { logDiagnostics: true } }), searchApi()],
});
