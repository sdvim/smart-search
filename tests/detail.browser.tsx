import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { StrictMode, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { BuyButton } from "../src/demo/BuyButton.tsx";
import { CollectibleCard } from "../src/demo/CollectibleCard.tsx";
import { CollectibleDetail } from "../src/demo/CollectibleDetail.tsx";
import { card } from "./fixtures.ts";
import "../src/demo/demo.css";

const items = [
  card("first", { title: "First Slaking", listed_value: 25 }),
  card("second", { title: "Second Slaking", listed_value: 500 }),
  card("third", { title: "Third Slaking", fair_market_value: 20 }),
];
let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  await page.viewport(390, 844);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function DetailHarness() {
  const [detail, select] = useState<{ id: string; direction: "next" | "previous" } | null>(null);
  return (
    <>
      <CollectibleCard
        item={items[0]}
        onOpen={() => select({ id: items[0].id, direction: "next" })}
        inDetail={detail?.id === items[0].id}
      />
      {detail ? (
        <CollectibleDetail
          items={items}
          total={items.length}
          selectedId={detail.id}
          direction={detail.direction}
          onNavigate={(direction) =>
            select((current) => {
              const index = items.findIndex((item) => item.id === current?.id);
              const adjacent = items[index + (direction === "next" ? 1 : -1)];
              return adjacent ? { id: adjacent.id, direction } : current;
            })
          }
          onClose={() => select(null)}
          onBuy={() => undefined}
          owns={() => false}
          balance={100}
          ready
        />
      ) : null}
    </>
  );
}

async function openDetail() {
  flushSync(() =>
    root.render(
      <StrictMode>
        <DetailHarness />
      </StrictMode>,
    ),
  );
  await page.getByRole("button", { name: "View First Slaking" }).click();
  await expect.element(page.getByRole("dialog")).toBeVisible();
}

async function swipe(dx: number, dy = 0) {
  const box = container.querySelector(".detail-gallery")!.getBoundingClientRect();
  const frame = window.frameElement?.getBoundingClientRect();
  const x = box.left + box.width / 2 + (frame?.left ?? 0);
  const y = box.top + box.height / 2 + (frame?.top ?? 0);
  await cdp().send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 5; step++)
    await cdp().send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * step) / 5, y: y + (dy * step) / 5 }],
    });
  await cdp().send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

describe("collectible details", () => {
  it("opens a modal, navigates without wrapping, and blurs the opener on Escape", async () => {
    await openDetail();
    const header = container.querySelector(".detail-header")!;
    expect(header.querySelectorAll("button")).toHaveLength(1);
    expect(header.querySelector(".detail-close")).not.toBeNull();
    expect(header.textContent).not.toMatch(/portfolio|balance/i);
    expect(document.body.style.overflow).toBe("hidden");
    await expect
      .element(page.getByRole("button", { name: "Previous", exact: true }))
      .toBeDisabled();
    expect(container.querySelector(".detail-previous")).toBeNull();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(page.getByRole("heading", { name: "First Slaking" })).toBeVisible();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(page.getByRole("heading", { name: "Second Slaking" })).toBeVisible();
    expect(container.querySelectorAll(".detail-neighbor")).toHaveLength(2);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect.element(page.getByRole("heading", { name: "Third Slaking" })).toBeVisible();
    expect(container.querySelector(".detail-next")).toBeNull();
    await expect.element(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(page.getByRole("heading", { name: "Third Slaking" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(document.body);
    expect(document.activeElement).not.toBe(container.querySelector(".card-open"));
  });

  it("accepts horizontal touch swipes without treating vertical scrolling as navigation", async () => {
    await openDetail();
    await swipe(-100);
    await expect.element(page.getByRole("heading", { name: "Second Slaking" })).toBeVisible();
    await swipe(100);
    await expect.element(page.getByRole("heading", { name: "First Slaking" })).toBeVisible();
    await swipe(-25, -120);
    await expect.element(page.getByRole("heading", { name: "First Slaking" })).toBeVisible();
    await swipe(0, 100);
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a small neighbor edge on narrow screens and expands it on wide screens", async () => {
    await openDetail();
    const neighbor = container.querySelector<HTMLElement>(".detail-next")!;
    expect(Number.parseFloat(getComputedStyle(neighbor).width)).toBeCloseTo(24, 0);
    await page.viewport(1200, 844);
    expect(Number.parseFloat(getComputedStyle(neighbor).width)).toBeCloseTo(72, 0);
  });

  it("shows real metadata, a placeholder for missing images, and an inactive unlisted CTA", async () => {
    await openDetail();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Buy for $500.00" })).toBeDisabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect.element(page.getByRole("button", { name: "Est. $20.00" })).toBeDisabled();
    expect(container.querySelector(".detail-current .card-placeholder")?.getAttribute("src")).toBe(
      "/slab-placeholder.svg",
    );
    expect(container.querySelector(".detail-metadata")?.textContent).toContain("6018503138");
    expect(container.querySelector(".detail-metadata")?.textContent).toContain("reverse holo");
    await page.getByRole("button", { name: "Close item details" }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers a failed-page retry at the boundary and disables navigation until more items arrive", async () => {
    const retry = vi.fn();
    const select = vi.fn();
    function renderBoundary(loadingMore: boolean, loadMoreError: boolean, loaded = 1) {
      flushSync(() =>
        root.render(
          <StrictMode>
            <CollectibleDetail
              items={items.slice(0, loaded)}
              total={75}
              selectedId={items[0].id}
              direction="next"
              onNavigate={select}
              onClose={() => undefined}
              onBuy={() => undefined}
              owns={() => false}
              balance={100}
              ready
              loadingMore={loadingMore}
              loadMoreError={loadMoreError}
              onLoadMore={retry}
            />
          </StrictMode>,
        ),
      );
    }
    renderBoundary(false, true);
    expect(container.querySelector(".detail-navigation span")?.textContent).toBe("1 / 75");
    await page.getByRole("button", { name: "Retry loading" }).click();
    expect(retry).toHaveBeenCalledTimes(1);
    renderBoundary(true, false);
    await expect.element(page.getByRole("button", { name: "Loading…" })).toBeDisabled();
    await page.getByRole("button", { name: "Loading…" }).click({ force: true });
    expect(select).not.toHaveBeenCalled();
    expect(container.querySelector(".detail-next")).toBeNull();
    renderBoundary(false, false, 2);
    expect(container.querySelector(".detail-navigation span")?.textContent).toBe("1 / 75");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    expect(select).toHaveBeenCalledExactlyOnceWith("next");
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("guards buying consistently for owned, unlisted, unavailable, invalid, and unaffordable cards", async () => {
    const buy = vi.fn();
    const states = [
      { item: items[0], owned: true, ready: true, balance: 100 },
      { item: items[2], owned: false, ready: true, balance: 100 },
      { item: items[0], owned: false, ready: false, balance: 100 },
      { item: items[1], owned: false, ready: true, balance: 100 },
      {
        item: card("invalid", { listed_value: Number.NaN }),
        owned: false,
        ready: true,
        balance: 100,
      },
    ];
    for (const state of states) {
      flushSync(() => root.render(<BuyButton {...state} onBuy={buy} />));
      const button = container.querySelector("button")!;
      expect(button.disabled).toBe(true);
      button.click();
    }
    expect(buy).not.toHaveBeenCalled();
    flushSync(() =>
      root.render(<BuyButton item={items[0]} owned={false} ready balance={25} onBuy={buy} />),
    );
    await page.getByRole("button", { name: "Buy for $25.00" }).click();
    expect(buy).toHaveBeenCalledTimes(1);
  });
});
