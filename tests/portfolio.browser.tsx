import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { App } from "../src/demo/App.tsx";
import { summarizePortfolio } from "../src/demo/portfolio.ts";
import type { PortfolioSummary, PortfolioSnapshot } from "../src/demo/portfolio.ts";
import type { Collectible } from "../src/demo/collectibles.ts";
import type { SearchContext } from "../src/search/types.ts";
import type { SearchResponse } from "../src/search/types.ts";
import { card } from "./fixtures.ts";

let container: HTMLDivElement;
let root: Root;
const searchbox = () => page.getByRole("searchbox", { name: "Search collectibles" });
const holdings = [50, 60, 100, 150, 200, 674.56, undefined, undefined].map((value, i) =>
  card(`portfolio-${i}`, { subject: "Alakazam", grade: 10, fair_market_value: value }),
);
const portfolio: PortfolioSnapshot = {
  ...summarizePortfolio(
    holdings,
    holdings.map((item) => item.id),
  ),
  items: holdings,
};

beforeEach(async () => {
  await page.viewport(1280, 832);
  window.history.replaceState(window.history.state, "", window.location.pathname);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function renderApp() {
  flushSync(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
}

async function ready() {
  await expect
    .poll(() => container.querySelector(".results")?.getAttribute("aria-busy"))
    .toBe("false");
}

describe("portfolio integration", () => {
  it("uses the full portfolio estimate and preferences without changing the current query", async () => {
    const originalFetch = window.fetch.bind(window);
    const requests: { query: string; user: SearchContext }[] = [];
    const pending: { resolve: (response: Response) => void; signal: AbortSignal }[] = [];
    vi.spyOn(window, "fetch").mockImplementation((input, init) => {
      if (input === "/api/portfolio")
        return new Promise((resolve) => pending.push({ resolve, signal: init!.signal! }));
      if (input === "/api/search") requests.push(JSON.parse(String(init?.body)));
      return originalFetch(input, init);
    });
    renderApp();
    expect(container.querySelector(".portfolio strong")!.textContent).toBe("…");
    await ready();
    await searchbox().fill("Slaking");
    await expect.poll(() => requests.at(-1)?.query).toBe("Slaking");
    await ready();
    const input = container.querySelector("input");
    const resultCount = container.querySelector(".results output")!.textContent;
    const requestCount = pending.length;
    pending.findLast((request) => !request.signal.aborted)!.resolve(Response.json(portfolio));
    await expect
      .poll(() => container.querySelector(".portfolio strong")!.textContent)
      .toBe("$1,234.56");
    await expect
      .poll(() => requests.at(-1)?.user)
      .toEqual({
        wallet_balance: 398.28,
        ...portfolio.preferences,
      });
    await ready();
    await expect.element(searchbox()).toHaveValue("Slaking");
    expect(container.querySelector("input")).toBe(input);
    expect(container.querySelectorAll("[data-chip]").length).toBe(0);
    expect(requests.at(-1)?.query).toBe("Slaking");
    expect(container.querySelector(".results output")!.textContent).toBe(resultCount);
    expect(
      [...container.querySelectorAll(".collectible-card")].every((card) =>
        /slaking/i.test(card.getAttribute("aria-label")!),
      ),
    ).toBe(true);
    await searchbox().fill("Slaking ex");
    await expect.poll(() => requests.at(-1)?.query).toBe("Slaking ex");
    await ready();
    expect(container.querySelector(".portfolio strong")!.textContent).toBe("$1,234.56");
    expect(container.querySelector(".wallet strong")!.textContent).toBe("$398.28");
    expect(pending.length).toBe(requestCount);
    for (const request of pending.filter((request) => request.signal.aborted))
      request.resolve(Response.json({ ...portfolio, total_value: 9999 }));
    await new Promise(requestAnimationFrame);
    expect(container.querySelector(".portfolio strong")!.textContent).toBe("$1,234.56");
  });

  it("keeps wallet-only search available when the portfolio cannot load", async () => {
    const originalFetch = window.fetch.bind(window);
    const requests: { query: string; user: SearchContext }[] = [];
    vi.spyOn(window, "fetch").mockImplementation((input, init) => {
      if (input === "/api/portfolio")
        return Promise.resolve(Response.json({ error: "Unavailable" }, { status: 503 }));
      if (input === "/api/search") requests.push(JSON.parse(String(init?.body)));
      return originalFetch(input, init);
    });
    renderApp();
    await expect.poll(() => container.querySelector(".portfolio strong")!.textContent).toBe("—");
    await searchbox().fill("Slaking");
    await expect.poll(() => requests.at(-1)?.query).toBe("Slaking");
    await ready();
    expect(requests.at(-1)?.user).toEqual({ wallet_balance: 398.28 });
    expect(container.querySelectorAll(".collectible-card").length).toBeGreaterThan(0);
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  });

  it("cancels the portfolio request when the app unmounts", async () => {
    const originalFetch = window.fetch.bind(window);
    const pending: { resolve: (response: Response) => void; signal: AbortSignal }[] = [];
    vi.spyOn(window, "fetch").mockImplementation((input, init) => {
      if (input === "/api/portfolio")
        return new Promise((resolve) => pending.push({ resolve, signal: init!.signal! }));
      return originalFetch(input, init);
    });
    renderApp();
    expect(pending.some((request) => !request.signal.aborted)).toBe(true);
    flushSync(() => root.render(null));
    expect(pending.every((request) => request.signal.aborted)).toBe(true);
    for (const request of pending) request.resolve(Response.json(portfolio));
  });

  it("chips ownership and price sorting against the real portfolio API", async () => {
    const summary = (await fetch("/api/portfolio").then((response) =>
      response.json(),
    )) as PortfolioSummary;
    expect(summary.item_count).toBeGreaterThan(0);
    renderApp();
    await ready();
    for (const [owner, order] of [
      ["mine", "cheapest"],
      ["vaulted", "most expensive"],
    ] as const) {
      await searchbox().fill(`${owner} ${order}`);
      await userEvent.keyboard("{Enter}");
      await expect
        .element(page.getByRole("button", { name: `Edit ${owner}`, exact: true }))
        .toBeVisible();
      await expect
        .element(page.getByRole("button", { name: `Edit ${order}`, exact: true }))
        .toBeVisible();
      await expect
        .poll(() => container.querySelector(".results output")!.textContent)
        .toBe(`${summary.item_count} collectibles found`);
      await ready();
      const expected = (await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: `${owner} ${order}`, page_size: 100 }),
      }).then((response) => response.json())) as SearchResponse<Collectible>;
      expect(
        [...container.querySelectorAll<HTMLElement>(".collectible-card")].map(
          (card) => card.dataset.itemId,
        ),
      ).toEqual(expected.items.map((item) => item.id));
      await page.getByRole("button", { name: "Clear search" }).click();
    }
  });
});
