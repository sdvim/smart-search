import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { collectibleFields } from "../src/demo/collectibles.ts";
import type { Collectible } from "../src/demo/collectibles.ts";
import { buildIndex } from "../src/search/index-data.ts";
import type { SearchIndex } from "../src/search/index-data.ts";
import { parseActiveQuery } from "../src/search/parse.ts";
import { filterRecords } from "../src/search/filter.ts";
import { suggest } from "../src/search/suggest.ts";

const resultPageSize = 24;
const maximumPageSize = 100;

export async function loadIndex() {
  const file = await readFile(new URL("../data/items.jsonl", import.meta.url), "utf8");
  return buildIndex(
    file
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Collectible),
    collectibleFields,
  );
}

export function createApi(index: SearchIndex<Collectible>) {
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = request.url?.split("?")[0];
    if (path !== "/api/dictionary" && path !== "/api/search") return next();
    const send = (status: number, value: unknown) => {
      response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(value));
    };
    if (path === "/api/dictionary" && request.method === "GET") return send(200, index.dictionary);
    if (path !== "/api/search" || request.method !== "POST")
      return send(405, { error: "Method not allowed" });
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 16384) return send(413, { error: "Query is too long" });
      }
      const data = JSON.parse(body);
      if (!data || typeof data !== "object" || Array.isArray(data))
        return send(400, { error: "A search request object is required" });
      if (typeof data.query !== "string" || data.query.length > 4096)
        return send(400, { error: "A query string of at most 4096 characters is required" });
      const wallet = data.user?.wallet_balance;
      if (
        wallet !== undefined &&
        (typeof wallet !== "number" || !Number.isFinite(wallet) || wallet < 0)
      )
        return send(400, { error: "wallet_balance must be a nonnegative number" });
      const range = data.active_range ?? [data.query.length, data.query.length];
      if (
        !Array.isArray(range) ||
        range.length !== 2 ||
        range.some((value) => !Number.isInteger(value)) ||
        range[0] < 0 ||
        range[1] < range[0] ||
        range[1] > data.query.length
      )
        return send(400, { error: "Invalid active_range" });
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
        return send(400, {
          error: "page must be nonnegative and page_size must be between 1 and 100",
        });
      const parsed = parseActiveQuery(data.query, index.dictionary, range as [number, number]);
      const matches = filterRecords(index, parsed);
      const start = page * pageSize;
      const items = matches.slice(start, start + pageSize);
      send(200, {
        items,
        total: matches.length,
        page,
        page_size: pageSize,
        has_more: start + items.length < matches.length,
        suggestion: suggest(index, data.query, range as [number, number], {
          wallet_balance: wallet,
        }),
      });
    } catch (error) {
      if (error instanceof SyntaxError) send(400, { error: "Invalid JSON" });
      else {
        console.error(error);
        send(500, { error: "Search is temporarily unavailable" });
      }
    }
  };
}
