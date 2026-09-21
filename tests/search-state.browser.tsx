import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { StrictMode } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { App } from "../src/demo/App.tsx";
import { demoUser } from "../src/demo/collectibles.ts";
import { useSearch } from "../src/demo/useSearch.ts";
import { useScrollHeader } from "../src/demo/useScrollHeader.ts";
import { emptySearch } from "../src/search/types.ts";
import type { SearchValue } from "../src/search/types.ts";
import { card, index } from "./fixtures.ts";

let container: HTMLDivElement;
let root: Root;

type SearchRequest = { query: string; active_range: [number, number]; page: number };

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

function render(element: ReactNode) {
  flushSync(() => root.render(<StrictMode>{element}</StrictMode>));
}

function mockSearch(
  handler: (request: SearchRequest, signal: AbortSignal) => Response | Promise<Response>,
) {
  const original = window.fetch.bind(window);
  vi.spyOn(window, "fetch").mockImplementation((input, init) => {
    if (input === "/api/portfolio")
      return Promise.resolve(
        Response.json({
          item_count: 0,
          valued_item_count: 0,
          total_value: 0,
          preferences: {},
          items: [],
        }),
      );
    if (input === "/api/dictionary") return Promise.resolve(Response.json(index.dictionary));
    if (input === "/api/search")
      return Promise.resolve(handler(JSON.parse(String(init?.body)), init!.signal!));
    return original(input, init);
  });
}

function response(ids: string[], page = 0, hasMore = false) {
  return Response.json({
    items: ids.map((id) => card(id, { subject: id })),
    total: 50,
    page,
    page_size: 24,
    has_more: hasMore,
    suggestion: null,
  });
}

function SearchHarness({ value = emptySearch }: { value?: SearchValue }) {
  const search = useSearch(value, demoUser);
  return (
    <>
      <output>{search.items.map((item) => item.id).join(",")}</output>
      <button type="button" onClick={search.loadMore}>
        Load more
      </button>
    </>
  );
}

function HeaderHarness() {
  return <output>{String(useScrollHeader())}</output>;
}

describe("search lifecycle", () => {
  it("searches restored URL chips with an empty active draft", async () => {
    const query = "Slaking under $100";
    const url = new URL(window.location.href);
    url.searchParams.set("q", query);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    const requests: SearchRequest[] = [];
    mockSearch((request) => {
      requests.push(request);
      return response([]);
    });
    render(<App />);
    await expect.element(page.getByRole("button", { name: "Edit under $100" })).toBeVisible();
    await expect.poll(() => requests.at(-1)?.active_range).toEqual([query.length, query.length]);
    expect(requests.at(-1)?.query).toBe(query);
  });

  it("cancels a pending next page when the search unmounts", async () => {
    let nextPageSignal: AbortSignal | undefined;
    let finishPage: ((result: Response) => void) | undefined;
    mockSearch((request, signal) => {
      if (!request.page) return response(["first"], 0, true);
      nextPageSignal = signal;
      return new Promise((resolve) => {
        finishPage = resolve;
      });
    });
    render(<SearchHarness />);
    await expect.element(page.getByRole("status")).toHaveTextContent("first");
    await page.getByRole("button", { name: "Load more" }).click();
    await expect.poll(() => nextPageSignal).toBeDefined();
    render(null);
    expect(nextPageSignal!.aborted).toBe(true);
    finishPage!(response(["late"], 1));
  });

  it("ignores a late next page after changing the query", async () => {
    let finishPage: ((result: Response) => void) | undefined;
    let nextPageSignal: AbortSignal | undefined;
    let pageRequests = 0;
    mockSearch((request, signal) => {
      if (request.query) return response(["new-query"]);
      if (!request.page) return response(["old-query"], 0, true);
      pageRequests++;
      nextPageSignal = signal;
      return new Promise((resolve) => {
        finishPage = resolve;
      });
    });
    render(<SearchHarness />);
    await expect.element(page.getByRole("status")).toHaveTextContent("old-query");
    await page.getByRole("button", { name: "Load more" }).dblClick();
    expect(pageRequests).toBe(1);
    render(<SearchHarness value={{ ...emptySearch, draft: "Pikachu" }} />);
    await expect.element(page.getByRole("status")).toHaveTextContent("new-query");
    expect(nextPageSignal!.aborted).toBe(true);
    finishPage!(response(["late-old-query"], 1));
    await new Promise(requestAnimationFrame);
    expect(container.querySelector("output")!.textContent).toBe("new-query");
  });

  it("waits for an explicit retry after a next-page failure", async () => {
    let pageRequests = 0;
    mockSearch((request) => {
      if (!request.page)
        return response(
          Array.from({ length: 24 }, (_, i) => `card-${i}`),
          0,
          true,
        );
      pageRequests++;
      return pageRequests === 1
        ? Response.json({ error: "Unavailable" }, { status: 503 })
        : response(["last-card"], 1);
    });
    render(<App />);
    await expect.poll(() => container.querySelectorAll(".collectible-card").length).toBe(24);
    container.querySelector("[data-results-sentinel]")!.scrollIntoView();
    await expect.element(page.getByRole("button", { name: "Try loading more" })).toBeVisible();
    window.scrollTo(0, 0);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    container.querySelector("[data-results-sentinel]")!.scrollIntoView();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    expect(pageRequests).toBe(1);
    await page.getByRole("button", { name: "Try loading more" }).click();
    await expect.poll(() => container.querySelectorAll(".collectible-card").length).toBe(25);
    expect(pageRequests).toBe(2);
  });

  it("restores the sticky header when scrolling the last pixel to the top", async () => {
    let scrollY = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
    render(<HeaderHarness />);
    scrollY = 3;
    window.dispatchEvent(new Event("scroll"));
    await expect.element(page.getByRole("status")).toHaveTextContent("true");
    for (const position of [2, 1, 0]) {
      scrollY = position;
      window.dispatchEvent(new Event("scroll"));
    }
    await expect.element(page.getByRole("status")).toHaveTextContent("false");
  });
});
