import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "../server/api.ts";
import { index } from "./fixtures.ts";

const api = createApi(index);
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
    expect(first.items.map((item: { id: string }) => item.id)).toEqual(["a", "b"]);
    expect(first.total).toBe(4);
    expect(first.has_more).toBe(true);
    const secondResponse = await fetch(`${baseUrl}/api/search`, {
      method: "POST",
      body: JSON.stringify({ query: "Slaking", page: 1, page_size: 2 }),
    });
    const second = await secondResponse.json();
    expect(second.items.map((item: { id: string }) => item.id)).toEqual(["c", "d"]);
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
  it.each([
    null,
    [],
    { query: 123 },
    { query: "", user: { wallet_balance: -1 } },
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
