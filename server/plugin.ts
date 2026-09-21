import type { Plugin } from "vite";
import { createApi } from "./api.ts";
import { loadIndex, loadPortfolio } from "./data.ts";

export function searchApi(): Plugin {
  return {
    name: "local-search-api",
    async configureServer(server) {
      const [index, portfolio] = await Promise.all([loadIndex(), loadPortfolio()]);
      server.middlewares.use(createApi(index, portfolio));
    },
    async configurePreviewServer(server) {
      const [index, portfolio] = await Promise.all([loadIndex(), loadPortfolio()]);
      server.middlewares.use(createApi(index, portfolio));
    },
  };
}
