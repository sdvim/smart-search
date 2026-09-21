import { createRequestApi } from "../../server/api.ts";
import { loadIndex, loadPortfolio } from "../../server/data.ts";

const api = Promise.all([loadIndex(), loadPortfolio()]).then(([index, portfolio]) =>
  createRequestApi(index, portfolio),
);

export default async function handler(request: Request) {
  return (await api)(request);
}
