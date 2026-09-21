import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { App } from "../src/demo/App.tsx";
import { card, index } from "./fixtures.ts";

const image =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="236"><rect width="140" height="236" rx="10" fill="#aaa"/><rect x="12" y="35" width="116" height="186" fill="#ecc74a"/></svg>',
  );
const items = Array.from({ length: 48 }, (_, index) =>
  card(`transition-${index}`, {
    title: `Slaking transition ${index + 1}`,
    image_url: image,
    listed_value: 10,
  }),
);
let container: HTMLDivElement;
let root: Root;
let requestedPages: number[];
let errors: unknown[][];
let startDescriptor: PropertyDescriptor | undefined;

beforeEach(async () => {
  await page.viewport(390, 844);
  window.history.replaceState(window.history.state, "", window.location.pathname);
  window.scrollTo(0, 0);
  startDescriptor = Object.getOwnPropertyDescriptor(document, "startViewTransition");
  requestedPages = [];
  errors = [];
  const originalError = console.error;
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args);
    originalError(...args);
  });
  const originalFetch = window.fetch.bind(window);
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
    if (input === "/api/search") {
      const request = JSON.parse(String(init?.body));
      const start = request.page * request.page_size;
      requestedPages.push(request.page);
      return Promise.resolve(
        Response.json({
          items: items.slice(start, start + request.page_size),
          total: items.length,
          page: request.page,
          page_size: request.page_size,
          has_more: start + request.page_size < items.length,
          suggestion: null,
        }),
      );
    }
    return originalFetch(input, init);
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await Promise.all(viewAnimations().map((animation) => animation.finished.catch(() => undefined)));
  flushSync(() => root.unmount());
  container.remove();
  if (startDescriptor) Object.defineProperty(document, "startViewTransition", startDescriptor);
  else Reflect.deleteProperty(document, "startViewTransition");
  vi.restoreAllMocks();
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  expect(errors).toEqual([]);
});

function viewAnimations() {
  return document
    .getAnimations()
    .filter((animation) =>
      (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith("::view-transition"),
    );
}

function gridButton(index: number) {
  return container.querySelector<HTMLButtonElement>(
    `[data-item-id="${items[index].id}"] .card-open`,
  )!;
}

async function renderApp() {
  flushSync(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
  await expect.poll(() => container.querySelectorAll(".collectible-card").length).toBe(24);
  await expect
    .poll(() => gridButton(0).querySelector(".card-image")?.getAttribute("data-loaded"))
    .toBe("true");
}

async function imageMorph(index: number, trigger: () => Promise<void>) {
  let animation: Animation | undefined;
  let content: Animation | undefined;
  let frame = 0;
  const previous = new Set(viewAnimations());
  const pseudo = `::view-transition-group(card-image-${items[index].id})`;
  function observe() {
    const current = viewAnimations();
    animation = current.find(
      (candidate) =>
        !previous.has(candidate) &&
        (candidate.effect as KeyframeEffect).pseudoElement === pseudo &&
        (candidate.effect as KeyframeEffect).getKeyframes().some((keyframe) => keyframe.width),
    );
    content =
      current.find(
        (candidate) =>
          !previous.has(candidate) &&
          (candidate.effect as KeyframeEffect).pseudoElement ===
            "::view-transition-new(detail-information)",
      ) ??
      current.find((candidate) => {
        const pseudoElement = (candidate.effect as KeyframeEffect).pseudoElement ?? "";
        return !previous.has(candidate) && /detail-information|detail-content/.test(pseudoElement);
      });
    if (!animation) frame = requestAnimationFrame(observe);
  }
  observe();
  try {
    await trigger();
    await expect.poll(() => animation).toBeDefined();
    return {
      animation: animation!,
      content,
      frames: (animation!.effect as KeyframeEffect).getKeyframes(),
    };
  } finally {
    cancelAnimationFrame(frame);
  }
}

function dimensions(frames: ComputedKeyframe[]) {
  return [frames[0], frames.at(-1)!].map((frame) => ({
    width: Number.parseFloat(String(frame.width)),
    height: Number.parseFloat(String(frame.height)),
  }));
}

async function gallerySlide(trigger: () => Promise<void>) {
  const captures: Promise<Animation[]>[] = [];
  const start = document.startViewTransition.bind(document);
  const spy = vi.spyOn(document, "startViewTransition").mockImplementation((options) => {
    const transition = start(options);
    captures.push(
      transition.ready.then(() =>
        viewAnimations().filter((animation) =>
          /^::view-transition-(old|new)\(detail-gallery\)$/.test(
            (animation.effect as KeyframeEffect).pseudoElement ?? "",
          ),
        ),
      ),
    );
    return transition;
  });
  try {
    await trigger();
    await expect.poll(() => captures.length).toBe(1);
    return await captures[0];
  } finally {
    spy.mockRestore();
  }
}

async function contentSlide(trigger: () => Promise<void>) {
  const captures: Promise<Animation[]>[] = [];
  const start = document.startViewTransition.bind(document);
  const spy = vi.spyOn(document, "startViewTransition").mockImplementation((options) => {
    const transition = start(options);
    captures.push(
      transition.ready.then(() =>
        viewAnimations().filter((animation) => {
          const pseudoElement = (animation.effect as KeyframeEffect).pseudoElement ?? "";
          return /detail-information|detail-content/.test(pseudoElement);
        }),
      ),
    );
    return transition;
  });
  try {
    await trigger();
    await expect.poll(() => captures.length).toBe(1);
    return await captures[0];
  } finally {
    spy.mockRestore();
  }
}

describe("native shared image transitions", () => {
  it("grows and shrinks the same image through real browser keyframes without moving a visible return target", async () => {
    await renderApp();
    const button = gridButton(0);
    const initialScroll = window.scrollY;
    const gridBounds = button.querySelector(".card-image")!.getBoundingClientRect();
    const opening = await imageMorph(0, () => userEvent.click(button));
    await expect.poll(() => opening.content).toBeDefined();
    const contentFrames = (opening.content!.effect as KeyframeEffect).getKeyframes();
    expect(contentFrames[0].opacity).toBe("0");
    expect(contentFrames[0].transform).toBe("translateY(24px)");
    expect(contentFrames.at(-1)!.opacity).toBe("1");
    const [small, large] = dimensions(opening.frames);
    expect(small.width).toBeCloseTo(gridBounds.width, 0);
    expect(small.height).toBeCloseTo(gridBounds.height, 0);
    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
    await opening.animation.finished;
    const detailBounds = container
      .querySelector(".detail-current .card-image")!
      .getBoundingClientRect();
    expect(large.width).toBeCloseTo(detailBounds.width, 0);
    const closing = await imageMorph(0, () =>
      page.getByRole("button", { name: "Close item details" }).click(),
    );
    await expect.poll(() => closing.content).toBeDefined();
    const closingContentFrames = (closing.content!.effect as KeyframeEffect).getKeyframes();
    expect(closingContentFrames.at(-1)!.opacity).toBe("0");
    expect(closingContentFrames.at(-1)!.transform).toBe("translateY(24px)");
    expect(Number(closing.content!.effect!.getTiming().duration)).toBeLessThan(200);
    const [from, to] = dimensions(closing.frames);
    expect(from.width).toBeCloseTo(large.width, 0);
    expect(to.width).toBeCloseTo(small.width, 0);
    expect(to.height).toBeCloseTo(small.height, 0);
    await closing.animation.finished;
    expect(window.scrollY).toBeCloseTo(initialScroll, 0);
    expect(document.activeElement).toBe(button);
    expect(container.querySelector("dialog")).toBeNull();
    expect(button.querySelector(".card-image")!.getAttribute("data-loaded")).toBe("true");
  });

  it("slides next and previous galleries in opposite directions and settles on the selected item", async () => {
    await renderApp();
    const opening = await imageMorph(0, () => userEvent.click(gridButton(0)));
    await opening.animation.finished;
    for (const [label, index, direction] of [
      ["Next", 1, -1],
      ["Previous", 0, 1],
    ] as const) {
      const animations = await gallerySlide(() =>
        page.getByRole("button", { name: label, exact: true }).click(),
      );
      for (const snapshot of ["old", "new"]) {
        const animation = animations.find(
          (candidate) =>
            (candidate.effect as KeyframeEffect).pseudoElement ===
            `::view-transition-${snapshot}(detail-gallery)`,
        );
        expect(animation).toBeDefined();
        const frames = (animation!.effect as KeyframeEffect).getKeyframes();
        expect([frames[0].transform, frames.at(-1)!.transform]).toEqual(
          snapshot === "old"
            ? ["none", `translateX(${direction * 100}%)`]
            : [`translateX(${-direction * 100}%)`, "none"],
        );
        expect(Number(animation!.effect!.getTiming().duration)).toBeGreaterThan(0);
      }
      await Promise.all(animations.map((animation) => animation.finished));
      await expect
        .element(page.getByRole("heading", { name: items[index].title, exact: true }))
        .toBeVisible();
      expect(container.querySelectorAll(".detail-gallery")).toHaveLength(1);
    }
  });

  it("slides detail content with the direction of navigation", async () => {
    await renderApp();
    const opening = await imageMorph(0, () => userEvent.click(gridButton(0)));
    await opening.animation.finished;
    for (const [label, direction] of [
      ["Next", 1],
      ["Previous", -1],
    ] as const) {
      const animations = await contentSlide(() =>
        page.getByRole("button", { name: label, exact: true }).click(),
      );
      for (const snapshot of ["old", "new"]) {
        const animation = animations.find(
          (candidate) =>
            (candidate.effect as KeyframeEffect).pseudoElement ===
            `::view-transition-${snapshot}(detail-information)`,
        );
        expect(animation).toBeDefined();
        const frames = (animation!.effect as KeyframeEffect).getKeyframes();
        expect([frames[0].transform, frames.at(-1)!.transform]).toEqual(
          snapshot === "old"
            ? ["none", `translateX(${direction * -24}px)`]
            : [`translateX(${direction * 24}px)`, "none"],
        );
        expect(Number(animation!.effect!.getTiming().duration)).toBeGreaterThan(0);
      }
      await Promise.all(animations.map((animation) => animation.finished));
    }
  });

  it("returns a lazily loaded current item to its own grid position after navigating away from the opener", async () => {
    await renderApp();
    gridButton(8).scrollIntoView({ block: "center" });
    await expect
      .poll(() => gridButton(8).querySelector(".card-image")?.getAttribute("data-loaded"))
      .toBe("true");
    const opening = await imageMorph(8, () => userEvent.click(gridButton(8)));
    await opening.animation.finished;
    const initialScroll = window.scrollY;
    expect(requestedPages).not.toContain(1);
    for (let index = 9; index <= 27; index++) {
      const next = page.getByRole("button", { name: "Next", exact: true });
      await expect.element(next).toBeEnabled();
      await next.click();
      await expect
        .element(page.getByRole("heading", { name: items[index].title, exact: true }))
        .toBeVisible();
    }
    expect(requestedPages).toContain(1);
    expect(container.querySelectorAll(".collectible-card")).toHaveLength(48);
    expect(gridButton(27).getBoundingClientRect().top).toBeGreaterThan(window.innerHeight);
    const closing = await imageMorph(27, () =>
      page.getByRole("button", { name: "Close item details" }).click(),
    );
    const [from, to] = dimensions(closing.frames);
    expect(to.height).toBeLessThan(from.height);
    await closing.animation.finished;
    const bounds = gridButton(27).getBoundingClientRect();
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(window.scrollY).toBeGreaterThan(initialScroll);
    expect(document.activeElement).toBe(gridButton(27));
    expect(document.activeElement).not.toBe(gridButton(8));
  });

  it("preserves every rapid keyboard step and reversal while slide transitions are pending", async () => {
    await renderApp();
    const opening = await imageMorph(0, () => userEvent.click(gridButton(0)));
    await opening.animation.finished;
    for (let step = 0; step < 5; step++) {
      await userEvent.keyboard("{ArrowRight}");
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    await expect
      .element(page.getByRole("heading", { name: items[5].title, exact: true }))
      .toBeVisible();
    await Promise.all(viewAnimations().map((animation) => animation.finished));
    const slides: Promise<{ types: string[]; animation: string | undefined }>[] = [];
    const start = document.startViewTransition.bind(document);
    vi.spyOn(document, "startViewTransition").mockImplementation((options) => {
      const transition = start(options);
      slides.push(
        transition.ready.then(() => ({
          types: [...transition.types],
          animation: (
            viewAnimations().find(
              (animation) =>
                (animation.effect as KeyframeEffect).pseudoElement ===
                "::view-transition-new(detail-gallery)",
            ) as CSSAnimation | undefined
          )?.animationName,
        })),
      );
      return transition;
    });
    for (const key of ["{ArrowRight}", "{ArrowLeft}", "{ArrowRight}", "{ArrowRight}"]) {
      await userEvent.keyboard(key);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    await expect
      .element(page.getByRole("heading", { name: items[7].title, exact: true }))
      .toBeVisible();
    expect(await slides.at(-1)).toEqual({
      types: ["detail-navigation"],
      animation: "detail-enter-right",
    });
  });

  it.each(["reduced motion", "unsupported browser"])(
    "keeps open, next, previous, and close usable with %s",
    async (mode) => {
      const durations: Promise<{ type: string; values: string[] }>[] = [];
      if (mode === "reduced motion") {
        await cdp().send("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        const start = document.startViewTransition.bind(document);
        vi.spyOn(document, "startViewTransition").mockImplementation((options) => {
          const transition = start(options);
          durations.push(
            transition.ready.then(() => {
              const type = [...transition.types].find((type) => type.startsWith("detail-"));
              const pseudos = type
                ? ["::view-transition-old(detail-gallery)", "::view-transition-new(detail-gallery)"]
                : [`::view-transition-group(card-image-${items[0].id})`];
              const values = pseudos.map(
                (pseudo) => getComputedStyle(document.documentElement, pseudo).animationDuration,
              );
              return { type: type ?? "morph", values };
            }),
          );
          return transition;
        });
      } else
        Object.defineProperty(document, "startViewTransition", {
          configurable: true,
          writable: true,
          value: undefined,
        });
      await renderApp();
      const button = gridButton(0);
      await userEvent.click(button);
      await expect.element(page.getByRole("dialog")).toBeVisible();
      for (const [label, index] of [
        ["Next", 1],
        ["Previous", 0],
      ] as const) {
        await page.getByRole("button", { name: label, exact: true }).click();
        await expect
          .element(page.getByRole("heading", { name: items[index].title, exact: true }))
          .toBeVisible();
      }
      await page.getByRole("button", { name: "Close item details" }).click();
      await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
      if (mode === "reduced motion")
        expect(await Promise.all(durations)).toEqual([
          { type: "morph", values: ["0s"] },
          { type: "detail-navigation", values: ["0s", "0s"] },
          { type: "detail-navigation", values: ["0s", "0s"] },
          { type: "morph", values: ["0s"] },
        ]);
      expect(document.activeElement).toBe(button);
      expect(document.body.style.overflow).toBe("");
    },
  );
});
