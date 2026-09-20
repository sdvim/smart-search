import type { Plugin } from "vite";
import { createApi, loadIndex } from "./api.ts";

export function searchApi(): Plugin {
  return {
    name: "local-search-api",
    async configureServer(server) {
      server.middlewares.use(createApi(await loadIndex()));
    },
    async configurePreviewServer(server) {
      server.middlewares.use(createApi(await loadIndex()));
    },
  };
}
