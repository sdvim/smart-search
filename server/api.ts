import type { IncomingMessage, ServerResponse } from "node:http";
import type { Collectible } from "../src/demo/collectibles.ts";
import type { PortfolioSource } from "../src/demo/portfolio.ts";
import type { SearchIndex } from "../src/search/index-data.ts";
import type { SearchContext } from "../src/search/types.ts";
import { createSearchService } from "./search-service.ts";

const resultPageSize = 24;
const maximumPageSize = 100;
const maximumBodyLength = 65536;
const apiPaths = new Set(["/api/dictionary", "/api/search", "/api/portfolio"]);

function readContext(value: unknown): SearchContext | null {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { wallet_balance, preferred_values, price_range } = value as SearchContext;
  if (
    wallet_balance !== undefined &&
    (typeof wallet_balance !== "number" || !Number.isFinite(wallet_balance) || wallet_balance < 0)
  )
    return null;
  if (preferred_values !== undefined) {
    if (
      !preferred_values ||
      typeof preferred_values !== "object" ||
      Array.isArray(preferred_values)
    )
      return null;
    const entries = Object.entries(preferred_values);
    if (
      entries.length > 10 ||
      entries.some(
        ([key, values]) =>
          key.length > 100 ||
          !Array.isArray(values) ||
          values.length > 5 ||
          values.some((entry) =>
            typeof entry === "string"
              ? !entry.trim() || entry.length > 100
              : typeof entry !== "number" || !Number.isFinite(entry),
          ),
      )
    )
      return null;
  }
  if (
    price_range !== undefined &&
    (!Array.isArray(price_range) ||
      price_range.length !== 2 ||
      price_range.some(
        (price) => typeof price !== "number" || !Number.isFinite(price) || price < 0,
      ) ||
      price_range[0] > price_range[1])
  )
    return null;
  return { wallet_balance, preferred_values, price_range };
}

function apiPath(value: string) {
  const path = value.split("?")[0];
  const functionPrefix = "/.netlify/functions/api";
  return path.startsWith(functionPrefix) ? `/api${path.slice(functionPrefix.length)}` : path;
}

function jsonResponse(status: number, value: unknown) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function createRequestApi(
  sourceIndex: SearchIndex<Collectible>,
  portfolio?: PortfolioSource,
): (request: Request) => Promise<Response> {
  const service = createSearchService(sourceIndex, portfolio);
  return async (request: Request) => {
    const path = apiPath(new URL(request.url).pathname);
    if (!apiPaths.has(path)) return new Response(null, { status: 404 });
    if (path === "/api/dictionary" && request.method === "GET")
      return jsonResponse(200, service.dictionary);
    if (path === "/api/portfolio" && request.method === "GET")
      return jsonResponse(200, service.portfolio);
    if (path !== "/api/search" || request.method !== "POST")
      return jsonResponse(405, { error: "Method not allowed" });
    try {
      const body = await request.text();
      if (body.length > maximumBodyLength)
        return jsonResponse(413, { error: "Search request is too large" });
      const data = JSON.parse(body);
      if (!data || typeof data !== "object" || Array.isArray(data))
        return jsonResponse(400, { error: "A search request object is required" });
      if (typeof data.query !== "string" || data.query.length > 4096)
        return jsonResponse(400, {
          error: "A query string of at most 4096 characters is required",
        });
      const context = readContext(data.user);
      if (!context) return jsonResponse(400, { error: "Invalid user search preferences" });
      const purchasedIds = data.purchased_ids === undefined ? [] : data.purchased_ids;
      const soldIds = data.sold_ids === undefined ? [] : data.sold_ids;
      for (const [name, ids] of [
        ["purchased_ids", purchasedIds],
        ["sold_ids", soldIds],
      ] as const) {
        if (
          !Array.isArray(ids) ||
          ids.length > 500 ||
          ids.some(
            (id) => typeof id !== "string" || !id || id.length > 100 || !service.hasKnownId(id),
          ) ||
          new Set(ids).size !== ids.length
        )
          return jsonResponse(400, {
            error: `${name} must contain at most 500 unique known item IDs`,
          });
      }
      const range = data.active_range ?? [data.query.length, data.query.length];
      if (
        !Array.isArray(range) ||
        range.length !== 2 ||
        range.some((value) => !Number.isInteger(value)) ||
        range[0] < 0 ||
        range[1] < range[0] ||
        range[1] > data.query.length
      )
        return jsonResponse(400, { error: "Invalid active_range" });
      const page = data.page ?? 0;
      const pageSize = data.page_size ?? resultPageSize;
      if (
        !Number.isInteger(page) ||
        page < 0 ||
        page > 100000 ||
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > maximumPageSize
      )
        return jsonResponse(400, {
          error: "page must be nonnegative and page_size must be between 1 and 100",
        });
      return jsonResponse(
        200,
        service.search({
          query: data.query,
          activeRange: range as [number, number],
          user: context,
          purchasedIds,
          soldIds,
          page,
          pageSize,
        }),
      );
    } catch (error) {
      if (error instanceof SyntaxError) return jsonResponse(400, { error: "Invalid JSON" });
      else {
        console.error(error);
        return jsonResponse(500, { error: "Search is temporarily unavailable" });
      }
    }
  };
}

async function readNodeBody(request: IncomingMessage) {
  let body = "";
  for await (const chunk of request) {
    body += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    if (body.length > maximumBodyLength) return null;
  }
  return body;
}

function nodeHeaders(request: IncomingMessage) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(", "));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

export function createApi(sourceIndex: SearchIndex<Collectible>, portfolio?: PortfolioSource) {
  const handler = createRequestApi(sourceIndex, portfolio);
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = apiPath(request.url ?? "/");
    if (!apiPaths.has(path)) return next();
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await readNodeBody(request);
    if (body === null) {
      response.writeHead(413, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Search request is too large" }));
      return;
    }
    const webRequest = new Request(
      `http://${request.headers.host ?? "localhost"}${request.url ?? "/"}`,
      {
        method: request.method,
        headers: nodeHeaders(request),
        body,
      },
    );
    const webResponse = await handler(webRequest);
    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
    response.end(await webResponse.text());
  };
}
