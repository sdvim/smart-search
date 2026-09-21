import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { App } from "../src/demo/App.tsx";
import { demoUser, formatMoney } from "../src/demo/collectibles.ts";
import type { Collectible } from "../src/demo/collectibles.ts";
import { summarizePortfolio } from "../src/demo/portfolio.ts";
import type { PortfolioSnapshot } from "../src/demo/portfolio.ts";
import { sellValue } from "../src/demo/purchase.ts";
import type { SearchContext, SearchResponse } from "../src/search/types.ts";
import { card } from "./fixtures.ts";

let container: HTMLDivElement;
let root: Root;
const searchbox = () => page.getByRole("searchbox", { name: "Search collectibles" });
type SearchRequest = {
  query: string;
  purchased_ids: string[];
  sold_ids: string[];
  user: SearchContext;
};

beforeEach(async () => {
  await page.viewport(1280, 832);
  window.history.replaceState(window.history.state, "", window.location.pathname);
  window.scrollTo(0, 0);
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

function article(id: string) {
  return container.querySelector<HTMLElement>(`article[data-item-id="${CSS.escape(id)}"]`);
}

async function ready() {
  await expect
    .poll(() => container.querySelector(".results")?.getAttribute("aria-busy"))
    .toBe("false");
}

async function amounts(balance: number, total: number) {
  await expect
    .poll(() => container.querySelector(".wallet strong")!.textContent)
    .toBe(formatMoney(balance));
  await expect
    .poll(() => container.querySelector(".portfolio strong")!.textContent)
    .toBe(formatMoney(total));
}

async function showTop() {
  window.scrollTo(0, 0);
  await expect
    .poll(() => container.querySelector(".demo-header")!.classList.contains("is-hidden"))
    .toBe(false);
}

describe("session commerce", () => {
  it("keeps purchased details stable, adds ownership to search, and resets purchases on remount", async () => {
    const snapshot = (await fetch("/api/portfolio").then((response) =>
      response.json(),
    )) as PortfolioSnapshot;
    const query = "Slaking under $100 cheapest";
    const result = (await fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        user: { ...demoUser, ...snapshot.preferences },
        page: 0,
        page_size: 24,
      }),
    }).then((response) => response.json())) as SearchResponse<Collectible>;
    const candidateIndex = result.items.findIndex(
      (item, index) =>
        index < result.items.length - 3 &&
        !snapshot.items.some((owned) => owned.id === item.id) &&
        item.listed_value !== undefined &&
        item.listed_value > 0 &&
        item.fair_market_value !== undefined &&
        item.fair_market_value !== item.listed_value,
    );
    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    const candidate = result.items[candidateIndex];
    const nextItem = result.items[candidateIndex + 1];
    const balance =
      (Math.round(demoUser.wallet_balance * 100) - Math.round(candidate.listed_value! * 100)) / 100;
    const total =
      (Math.round(snapshot.total_value * 100) + Math.round(candidate.fair_market_value! * 100)) /
      100;
    const requests: SearchRequest[] = [];
    const originalFetch = window.fetch.bind(window);
    vi.spyOn(window, "fetch").mockImplementation((input, init) => {
      if (input === "/api/search") requests.push(JSON.parse(String(init?.body)));
      return originalFetch(input, init);
    });
    const url = new URL(window.location.href);
    url.searchParams.set("q", query);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    renderApp();
    await ready();
    await expect.poll(() => article(candidate.id)).not.toBeNull();
    await userEvent.click(article(candidate.id)!.querySelector(".card-open")!);
    await expect
      .element(page.getByRole("heading", { name: candidate.title, exact: true }))
      .toBeVisible();
    expect(new URL(window.location.href).searchParams.get("detail")).toBe(candidate.id);
    expect(container.querySelector(".detail-navigation span")!.textContent).toBe(
      `${candidateIndex + 1} / ${result.total}`,
    );
    const requestCount = requests.length;
    await userEvent.dblClick(container.querySelector(".detail-information .buy-button")!);
    await amounts(balance, total);
    await expect
      .element(page.getByRole("heading", { name: candidate.title, exact: true }))
      .toBeVisible();
    const ownedButton = container.querySelector<HTMLButtonElement>(
      ".detail-information .buy-button",
    )!;
    expect(ownedButton.disabled).toBe(false);
    expect(ownedButton.textContent).toContain("Owned");
    const ownedWidth = ownedButton.getBoundingClientRect().width;
    await userEvent.hover(ownedButton);
    expect(ownedButton.getBoundingClientRect().width).toBe(ownedWidth);
    expect(getComputedStyle(ownedButton).color).toBe("rgb(198, 40, 40)");
    expect(ownedButton.textContent).toContain(`Sell for ${formatMoney(sellValue(candidate)!)}`);
    expect(requests.length).toBe(requestCount);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect
      .poll(() => container.querySelector(".detail-navigation span")!.textContent)
      .toBe(`${candidateIndex + 2} / ${result.total}`);
    await expect
      .element(page.getByRole("heading", { name: nextItem.title, exact: true }))
      .toBeVisible();
    expect(new URL(window.location.href).searchParams.get("detail")).toBe(nextItem.id);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect
      .poll(() => container.querySelector(".detail-navigation span")!.textContent)
      .toBe(`${candidateIndex + 1} / ${result.total}`);
    await expect
      .element(page.getByRole("heading", { name: candidate.title, exact: true }))
      .toBeVisible();
    expect(new URL(window.location.href).searchParams.get("detail")).toBe(candidate.id);
    expect(
      container.querySelector<HTMLButtonElement>(".detail-information .buy-button")!.disabled,
    ).toBe(false);
    await page.getByRole("button", { name: "Close item details" }).click();
    expect(new URL(window.location.href).searchParams.get("detail")).toBeNull();
    expect(requests.length).toBe(requestCount);
    await ready();
    await showTop();
    await page.getByRole("button", { name: "Show my portfolio", exact: true }).click();
    await expect.poll(() => requests.at(-1)?.purchased_ids).toEqual([candidate.id]);
    await expect
      .element(page.getByRole("button", { name: "Edit mine", exact: true }))
      .toBeVisible();
    await expect
      .poll(() => container.querySelector(".results output")!.textContent)
      .toBe(`${snapshot.item_count + 1} collectibles found`);
    await ready();
    if (!article(candidate.id))
      container.querySelector("[data-results-sentinel]")!.scrollIntoView();
    await expect.poll(() => article(candidate.id)).not.toBeNull();
    expect(article(candidate.id)!.querySelector<HTMLButtonElement>(".buy-button")!.disabled).toBe(
      false,
    );
    await showTop();
    await page.getByRole("button", { name: "Show all collectibles", exact: true }).click();
    expect(new URL(window.location.href).searchParams.get("q")).toBeNull();
    expect(container.querySelectorAll("[data-chip]")).toHaveLength(0);
    await amounts(balance, total);
    await searchbox().fill("vaulted");
    await userEvent.keyboard("{Enter}");
    await expect
      .poll(() => container.querySelector(".results output")!.textContent)
      .toBe(`${snapshot.item_count + 1} collectibles found`);
    await expect
      .element(page.getByRole("button", { name: "Show all collectibles", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Show all collectibles", exact: true }).click();
    flushSync(() => root.render(null));
    renderApp();
    await ready();
    await amounts(demoUser.wallet_balance, snapshot.total_value);
    expect(requests.at(-1)?.purchased_ids).toEqual([]);
    await page.getByRole("button", { name: "Show my portfolio", exact: true }).click();
    await expect
      .poll(() => container.querySelector(".results output")!.textContent)
      .toBe(`${snapshot.item_count} collectibles found`);
  });

  it("charges a real double-click once and disables a purchase that would overdraw the wallet", async () => {
    const owned = card("owned", {
      title: "Owned Slaking",
      fair_market_value: 80,
      listed_value: 20,
    });
    const buyable = card("buyable", {
      title: "Buyable Slaking",
      fair_market_value: 400,
      listed_value: 250,
    });
    const unaffordable = card("unaffordable", { title: "Another Slaking", listed_value: 200 });
    const items = [owned, buyable, unaffordable];
    const requests: SearchRequest[] = [];
    const originalFetch = window.fetch.bind(window);
    vi.spyOn(window, "fetch").mockImplementation((input, init) => {
      if (input === "/api/portfolio")
        return Promise.resolve(
          Response.json({
            ...summarizePortfolio([owned], [owned.id]),
            items: [owned],
          }),
        );
      if (input === "/api/search") {
        requests.push(JSON.parse(String(init?.body)));
        return Promise.resolve(
          Response.json({
            items,
            total: items.length,
            suggestion: null,
            page: 0,
            page_size: 24,
            has_more: false,
          }),
        );
      }
      return originalFetch(input, init);
    });
    renderApp();
    await ready();
    expect(article(owned.id)!.querySelector<HTMLButtonElement>(".buy-button")!.disabled).toBe(
      false,
    );
    expect(
      article(unaffordable.id)!.querySelector<HTMLButtonElement>(".buy-button")!.disabled,
    ).toBe(false);
    const requestCount = requests.length;
    await userEvent.dblClick(article(buyable.id)!.querySelector(".buy-button")!);
    await amounts(148.28, 480);
    await ready();
    expect(article(buyable.id)!.querySelector<HTMLButtonElement>(".buy-button")!.disabled).toBe(
      false,
    );
    const blocked = article(unaffordable.id)!.querySelector<HTMLButtonElement>(".buy-button")!;
    expect(blocked.disabled).toBe(true);
    expect(blocked.title).toBe("Insufficient balance");
    blocked.click();
    expect(requests.length).toBe(requestCount);
    expect(requests.at(-1)?.purchased_ids).toEqual([]);
    expect(requests.at(-1)?.user.wallet_balance).toBe(demoUser.wallet_balance);
    await amounts(148.28, 480);
  });

  it("sells an owned card in place and returns the sale proceeds", async () => {
    const owned = card("owned", {
      title: "Owned Slaking",
      listed_value: 20,
      fair_market_value: 100,
    });
    const snapshot: PortfolioSnapshot = {
      ...summarizePortfolio([owned], [owned.id]),
      items: [owned],
    };
    const originalFetch = window.fetch.bind(window);
    let requests = 0;
    vi.spyOn(window, "fetch").mockImplementation((input, init) => {
      if (input === "/api/portfolio") return Promise.resolve(Response.json(snapshot));
      if (input === "/api/search") {
        requests++;
        return Promise.resolve(
          Response.json({
            items: [owned],
            total: 1,
            suggestion: null,
            page: 0,
            page_size: 24,
            has_more: false,
          }),
        );
      }
      return originalFetch(input, init);
    });
    renderApp();
    await ready();
    const button = article(owned.id)!.querySelector<HTMLButtonElement>(".buy-button")!;
    expect(button.disabled).toBe(false);
    await userEvent.hover(button);
    await expect.element(page.getByRole("button", { name: "Sell for $90.00" })).toBeVisible();
    await userEvent.click(button);
    await amounts(488.28, 0);
    expect(requests).toBe(1);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain("Buy for $20.00");
  });

  it("updates a purchased grid card without replacing the search result", async () => {
    const item = card("buyable", { listed_value: 20, fair_market_value: 40 });
    const snapshot: PortfolioSnapshot = {
      ...summarizePortfolio([], []),
      items: [],
    };
    const originalFetch = window.fetch.bind(window);
    let requests = 0;
    vi.spyOn(window, "fetch").mockImplementation((input, init) => {
      if (input === "/api/portfolio") return Promise.resolve(Response.json(snapshot));
      if (input === "/api/search") {
        requests++;
        return Promise.resolve(
          Response.json({
            items: [item],
            total: 1,
            suggestion: null,
            page: 0,
            page_size: 24,
            has_more: false,
          }),
        );
      }
      return originalFetch(input, init);
    });
    renderApp();
    await ready();
    const articleElement = article(item.id)!;
    const image = articleElement.querySelector(".card-image");
    await userEvent.click(articleElement.querySelector(".buy-button")!);
    await amounts(378.28, 40);
    expect(requests).toBe(1);
    expect(article(item.id)!.querySelector(".card-image")).toBe(image);
    expect(article(item.id)!.querySelector(".buy-button")!.textContent).toContain("Owned");
  });

  it("keeps the purchase scroll position and briefly reveals a hidden header", async () => {
    const items = Array.from({ length: 36 }, (_, index) =>
      card(`scroll-${index}`, {
        title: `Scroll Slaking ${index}`,
        listed_value: 10,
        fair_market_value: 12,
      }),
    );
    const snapshot: PortfolioSnapshot = {
      ...summarizePortfolio([], []),
      items: [],
    };
    const originalFetch = window.fetch.bind(window);
    vi.spyOn(window, "fetch").mockImplementation((input, init) => {
      if (input === "/api/portfolio") return Promise.resolve(Response.json(snapshot));
      if (input === "/api/search")
        return Promise.resolve(
          Response.json({
            items,
            total: items.length,
            suggestion: null,
            page: 0,
            page_size: items.length,
            has_more: false,
          }),
        );
      return originalFetch(input, init);
    });
    renderApp();
    await ready();
    const candidate = items[12];
    article(candidate.id)!.scrollIntoView({ block: "center" });
    await expect
      .poll(() => container.querySelector(".demo-header")!.classList.contains("is-hidden"))
      .toBe(true);
    const initialScroll = window.scrollY;
    await userEvent.click(article(candidate.id)!.querySelector(".buy-button")!);
    expect(window.scrollY).toBe(initialScroll);
    await expect
      .poll(() => container.querySelector(".demo-header")!.classList.contains("is-hidden"))
      .toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1150));
    await expect
      .poll(() => container.querySelector(".demo-header")!.classList.contains("is-hidden"))
      .toBe(true);
  });
});
