import type { Plugin } from "vite";
import { createApi, loadIndex, loadPortfolio } from "./api.ts";

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
