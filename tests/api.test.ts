import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "../server/api.ts";
import { index } from "./fixtures.ts";

const api = createApi(index, {
  source_url: "https://example.com/collection",
  captured_at: "2026-09-20T00:00:00Z",
  public_item_count: 2,
  excluded_ungraded_count: 0,
  item_ids: ["a", "d"],
});
const server = createServer((request, response) => {
  void api(request, response, () => {
    response.writeHead(404).end();
  });
});
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("REST search", () => {
  it("derives the portfolio total and preferences from the selected holdings", async () => {
    const response = await fetch(`${baseUrl}/api/portfolio`);
    expect(response.status).toBe(200);
    const snapshot = await response.json();
    expect(snapshot).toMatchObject({
      item_count: 2,
      valued_item_count: 2,
      total_value: 160,
      preferences: { price_range: [80, 80] },
    });
    expect(snapshot.items.map((item: { id: string }) => item.id)).toEqual(["a", "d"]);
    expect(snapshot.items[0]).toMatchObject({ subject: "Slaking", fair_market_value: 80 });
  });
  it("publishes data-derived vocabulary", async () => {
    const response = await fetch(`${baseUrl}/api/dictionary`);
    expect(response.status).toBe(200);
    expect((await response.json()).entries).toContainEqual(
      expect.objectContaining({ value: "Michael Jordan" }),
    );
  });
  it("filters results without applying the unaccepted suggestion", async () => {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "Slaking", user: { wallet_balance: 398.28 } }),
    });
    const result = await response.json();
    expect(result.total).toBe(4);
    expect(result.suggestion.text).toBe("under $100");
    expect(result.items.some((item: { listed_value: number }) => item.listed_value === 120)).toBe(
      true,
    );
  });
  it("paginates matching results while preserving the total", async () => {
    const firstResponse = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "Slaking", page: 0, page_size: 2 }),
    });
    const first = await firstResponse.json();
    expect(first.items.map((item: { id: string }) => item.id)).toEqual(["c", "b"]);
    expect(first.total).toBe(4);
    expect(first.has_more).toBe(true);
    const secondResponse = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "Slaking", page: 1, page_size: 2 }),
    });
    const second = await secondResponse.json();
    expect(second.items.map((item: { id: string }) => item.id)).toEqual(["a", "d"]);
    expect(second.total).toBe(4);
    expect(second.has_more).toBe(false);
  });
  it("completes an earlier clause with later filters still applied", async () => {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "Sla under $100", active_range: [0, 3] }),
    });
    expect((await response.json()).suggestion.text).toBe("Slaking");
  });
  it("keeps later filters while editing an incomplete earlier clause", async () => {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "Slaking under $ grade 10", active_range: [8, 15] }),
    });
    expect((await response.json()).items.map((item: { id: string }) => item.id)).toEqual([
      "c",
      "d",
    ]);
  });
  it("uses small preference hints for ranking and completion without reducing the matches", async () => {
    const user = {
      preferred_values: { subject: ["Michael Jordan"], grade: [8] },
      price_range: [900, 1100],
    };
    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "", user, page_size: 2 }),
    });
    const first = await response.json();
    expect(first.total).toBe(index.records.length);
    expect(first.items[0].id).toBe("e");
    expect(first.suggestion.text).toBe("Michael Jordan");
    const next = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "", user, page: 1, page_size: 2 }),
    });
    const nextIds = (await next.json()).items.map((item: { id: string }) => item.id);
    expect(first.items.every((item: { id: string }) => !nextIds.includes(item.id))).toBe(true);
  });
  it.each([
    ["mine", ["a", "d"]],
    ["vaulted", ["a", "d"]],
    ["mine cheapest", ["d", "a"]],
    ["vaulted low to high", ["d", "a"]],
    ["mine most expensive", ["a", "d"]],
    ["vaulted high to low", ["a", "d"]],
    ["mine under $50", ["d"]],
  ])("applies ownership and explicit price ordering: %s", async (query, ids) => {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({
        query,
        user: { preferred_values: { subject: ["Michael Jordan"] }, price_range: [900, 1100] },
      }),
    });
    const result = await response.json();
    expect(result.items.map((item: { id: string }) => item.id)).toEqual(ids);
    expect(result.total).toBe(ids.length);
  });
  it("adds local purchases to ownership for one request without changing the shared portfolio", async () => {
    const purchased = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "mine", purchased_ids: ["a", "c"] }),
    });
    expect(purchased.status).toBe(200);
    expect((await purchased.json()).items.map((item: { id: string }) => item.id)).toEqual([
      "a",
      "c",
      "d",
    ]);
    for (const purchased_ids of [undefined, []]) {
      const response = await fetch(`${baseUrl}/api/search`, {
        method: "POST",
        body: JSON.stringify({ query: "mine", purchased_ids }),
      });
      expect((await response.json()).items.map((item: { id: string }) => item.id)).toEqual([
        "a",
        "d",
      ]);
    }
    const snapshot = await (await fetch(`${baseUrl}/api/portfolio`)).json();
    expect(snapshot.items.map((item: { id: string }) => item.id)).toEqual(["a", "d"]);
    expect(snapshot.total_value).toBe(160);
    const all = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "Slaking", purchased_ids: ["c"] }),
    });
    expect((await all.json()).items.map((item: { id: string }) => item.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });
  it("applies local sales as ownership removals without changing the shared portfolio", async () => {
    const sold = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "mine", sold_ids: ["a"] }),
    });
    expect(sold.status).toBe(200);
    expect((await sold.json()).items.map((item: { id: string }) => item.id)).toEqual(["d"]);
    const restored = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "mine", sold_ids: ["a"], purchased_ids: ["a"] }),
    });
    expect((await restored.json()).items.map((item: { id: string }) => item.id)).toEqual([
      "a",
      "d",
    ]);
    const snapshot = await (await fetch(`${baseUrl}/api/portfolio`)).json();
    expect(snapshot.items.map((item: { id: string }) => item.id)).toEqual(["a", "d"]);
  });
  it("keeps locally purchased ownership and price ordering stable across pages", async () => {
    const pages = [];
    for (const page of [0, 1]) {
      const response = await fetch(`${baseUrl}/api/search`, {
        method: "POST",
        body: JSON.stringify({
          query: "vaulted cheapest",
          purchased_ids: ["b", "c"],
          page,
          page_size: 2,
        }),
      });
      expect(response.status).toBe(200);
      pages.push(await response.json());
    }
    expect(pages.map((page) => page.items.map((item: { id: string }) => item.id))).toEqual([
      ["d", "a"],
      ["b", "c"],
    ]);
    expect(pages.map((page) => page.total)).toEqual([4, 4]);
    expect(pages.map((page) => page.has_more)).toEqual([true, false]);
  });
  it.each([
    ["null", null],
    ["non-array", "c"],
    ["null item", [null]],
    ["numeric item", [3]],
    ["empty item", [""]],
    ["unknown item", ["unknown-card"]],
    ["duplicate items", ["c", "c"]],
    ["oversized item", ["x".repeat(101)]],
    ["too many items", Array.from({ length: 501 }, (_, position) => `card-${position}`)],
  ])("rejects invalid local purchase identifiers: %s", async (_reason, purchased_ids) => {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "mine", purchased_ids }),
    });
    expect(response.status).toBe(400);
  });
  it.each([
    ["unknown item", ["unknown-card"]],
    ["duplicate items", ["a", "a"]],
  ])("rejects invalid local sale identifiers: %s", async (_reason, sold_ids) => {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "mine", sold_ids }),
    });
    expect(response.status).toBe(400);
  });
  it.each([
    null,
    [],
    { query: 123 },
    { query: "", user: { wallet_balance: -1 } },
    { query: "", user: [] },
    { query: "", user: { preferred_values: { grade: [null] } } },
    { query: "", user: { preferred_values: { subject: "Slaking" } } },
    { query: "", user: { preferred_values: { subject: [" "] } } },
    { query: "", user: { price_range: [100, 10] } },
    { query: "", user: { price_range: [0, "100"] } },
    { query: "Sla", active_range: [0, 5] },
    { query: "Slaking", page: -1 },
    { query: "Slaking", page_size: 0 },
    { query: "Slaking", page_size: 101 },
  ])("rejects invalid requests: %j", async (body) => {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
  });
  it("handles malformed JSON and unsupported methods", async () => {
    expect((await fetch(`${baseUrl}/api/search`, { method: "POST", body: "{" })).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/search`)).status).toBe(405);
  });
});
