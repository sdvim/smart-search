import { createRequestApi, loadIndex, loadPortfolio } from "../../server/api.ts";

const api = Promise.all([loadIndex(), loadPortfolio()]).then(([index, portfolio]) =>
  createRequestApi(index, portfolio),
);

export default async function handler(request: Request) {
  return (await api)(request);
}
