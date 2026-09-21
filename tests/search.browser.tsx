import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { StrictMode } from "react";
import { App } from "../src/demo/App.tsx";
import { CollectibleCard } from "../src/demo/CollectibleCard.tsx";
import { card, index, records } from "./fixtures.ts";

let container: HTMLDivElement;
let root: Root;
const searchbox = () => page.getByRole("searchbox", { name: "Search collectibles" });

beforeEach(async () => {
  const originalFetch = window.fetch.bind(window);
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    input === "/api/portfolio"
      ? Promise.resolve(
          Response.json({
            item_count: 0,
            valued_item_count: 0,
            total_value: 0,
            preferences: {},
            items: [],
          }),
        )
      : originalFetch(input, init),
  );
  await page.viewport(1280, 832);
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.hash}`,
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

async function swipe(element: Element, distance: number) {
  const box = element.getBoundingClientRect();
  const frame = window.frameElement?.getBoundingClientRect();
  const x = box.left + Math.min(box.width / 2, 12) + (frame?.left ?? 0);
  const y = box.top + box.height / 2 + (frame?.top ?? 0);
  await cdp().send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 5; step++)
    await cdp().send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (distance * step) / 5, y }],
    });
  await cdp().send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function clickAt(x: number, y: number) {
  await cdp().send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await cdp().send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

describe("real search interaction", () => {
  it("cycles through broad-to-specific empty search examples", async () => {
    renderApp();
    await ready();
    expect(container.querySelector<HTMLInputElement>("input")?.placeholder).toBe(
      "Slaking grade 9+ listed",
    );
    expect(getComputedStyle(container.querySelector(".search-placeholder")!).animationName).toBe(
      "search-placeholder-enter",
    );
    await expect
      .poll(() => container.querySelector<HTMLInputElement>("input")?.placeholder, {
        timeout: 5000,
      })
      .toBe("Pikachu between $100 and $300");
    expect(getComputedStyle(container.querySelector(".search-placeholder")!).animationName).toBe(
      "search-placeholder-enter",
    );
  });

  it("restores the query from before the portfolio toggle", async () => {
    renderApp();
    await ready();
    await page.getByRole("button", { name: "Show my portfolio", exact: true }).click();
    await expect
      .element(page.getByRole("button", { name: "Edit mine", exact: true }))
      .toBeVisible();
    await page.getByRole("button", { name: "Show all collectibles", exact: true }).click();
    expect(container.querySelectorAll("[data-chip]")).toHaveLength(0);
    expect(new URL(window.location.href).searchParams.get("q")).toBeNull();

    await searchbox().fill("Slaking under $100");
    await userEvent.keyboard(" ");
    await expect
      .element(page.getByRole("button", { name: "Edit Slaking", exact: true }))
      .toBeVisible();
    await page.getByRole("button", { name: "Show my portfolio", exact: true }).click();
    await expect
      .element(page.getByRole("button", { name: "Edit mine", exact: true }))
      .toBeVisible();
    await page.getByRole("button", { name: "Show all collectibles", exact: true }).click();
    await expect
      .element(page.getByRole("button", { name: "Edit Slaking", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Edit under $100", exact: true }))
      .toBeVisible();
    expect(new URL(window.location.href).searchParams.get("q")).toBe("Slaking under $100");
  });

  it("accepts contextual completions, edits chips in place, removes and clears", async () => {
    renderApp();
    await ready();
    await searchbox().click();
    await userEvent.keyboard("Sla");
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking", exact: true }))
      .toBeVisible();
    await userEvent.keyboard("{Tab}");
    await expect
      .element(page.getByRole("button", { name: "Edit Slaking", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion under $100", exact: true }))
      .toBeVisible();
    expect(
      container.querySelector(".search-suggestion")!.getBoundingClientRect().left -
        container.querySelector("[data-chip]")!.getBoundingClientRect().right,
    ).toBeLessThan(8);
    await userEvent.keyboard("{Tab}");
    await expect.element(page.getByRole("button", { name: "Edit under $100" })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion grade 9+" }))
      .toBeVisible();
    await userEvent.keyboard("{Tab}");
    await page.getByRole("button", { name: "Edit under $100" }).click();
    await expect.element(searchbox()).toHaveValue("under $100");
    await searchbox().fill("under $50");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("button", { name: "Edit under $50" })).toBeVisible();
    expect(
      [...container.querySelectorAll(".chip-edit")].map((element) => element.textContent),
    ).toEqual(["Slaking", "under $50", "grade 9+"]);
    await page.getByRole("button", { name: "Remove grade 9+" }).click();
    await userEvent.keyboard("{Backspace}");
    await expect.element(searchbox()).toHaveValue("under $50");
    await userEvent.keyboard("{Escape}");
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect.element(searchbox()).toHaveValue("");
    expect(container.querySelectorAll("[data-chip]").length).toBe(0);
  });

  it("keeps multiword drafts editable and lets Escape release Tab focus", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Slaking e");
    expect(container.querySelectorAll("[data-chip]").length).toBe(0);
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking ex", exact: true }))
      .toBeVisible();
    await userEvent.keyboard("{Escape}{Tab}");
    await expect.element(searchbox()).not.toHaveFocus();
    container
      .querySelector(".search-track")!
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    await expect.element(searchbox()).toHaveFocus();
    await searchbox().fill("Slaking ex under $100");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("button", { name: "Edit Slaking ex", exact: true }))
      .toBeVisible();
    await expect.element(searchbox()).toHaveValue("");
  });

  it("keeps focus when Backspace opens the last chip for editing", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Slaking ex under $100");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("button", { name: "Edit under $100", exact: true }))
      .toBeVisible();
    await expect.element(searchbox()).toHaveValue("");
    container.querySelector<HTMLInputElement>("input")!.blur();
    await expect.element(searchbox()).not.toHaveFocus();
    await searchbox().click();
    await expect.element(searchbox()).toHaveFocus();
    await userEvent.keyboard("{Backspace}");
    await expect.element(searchbox()).toHaveValue("under $100");
    await expect.element(searchbox()).toHaveFocus();
  });

  it("keeps family subjects editable until a following query starts", async () => {
    renderApp();
    await ready();
    await searchbox().click();
    await userEvent.keyboard("jp slakin");
    await expect.element(page.getByRole("button", { name: "Edit jp" })).toBeVisible();
    await expect.element(searchbox()).toHaveValue("slakin");
    await userEvent.keyboard("g");
    await expect.element(searchbox()).toHaveValue("slaking");
    await searchbox().fill("slaking");
    await userEvent.keyboard(" ");
    await expect.element(searchbox()).toHaveValue("slaking ");
    expect(container.querySelectorAll("[data-chip]")).toHaveLength(1);
    await userEvent.keyboard("ex");
    await expect.element(searchbox()).toHaveValue("slaking ex");
    await userEvent.keyboard(" ");
    await expect.element(searchbox()).toHaveValue("slaking ex ");
    await userEvent.keyboard("be");
    await expect.element(page.getByRole("button", { name: "Edit Slaking ex" })).toBeVisible();
    await expect.element(searchbox()).toHaveValue("be");
    let suffix = "be";
    for (const character of ["f", "o", "r", "e"]) {
      suffix += character;
      await userEvent.keyboard(character);
      await expect.element(searchbox()).toHaveValue(suffix);
    }
  });

  it("does not accept an unfinished suggestion with Space", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Sla");
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking", exact: true }))
      .toBeVisible();
    await userEvent.keyboard(" ");
    await expect.element(searchbox()).toHaveValue("Sla ");
    expect(container.querySelectorAll("[data-chip]")).toHaveLength(0);
  });

  it("keeps natural numeric suggestions editable after Space", async () => {
    renderApp();
    await ready();
    await searchbox().fill("over");
    await expect
      .element(page.getByRole("button", { name: /Accept suggestion over / }))
      .toBeVisible();
    await userEvent.keyboard(" ");
    await expect.element(searchbox()).toHaveValue("over ");
    await expect
      .element(page.getByRole("button", { name: /Accept suggestion over / }))
      .toBeVisible();
    await userEvent.keyboard("whatever");
    await expect.element(searchbox()).toHaveValue("over whatever");
  });

  it("chips a recognized draft when Space completes it", async () => {
    renderApp();
    await ready();
    await searchbox().fill("under $100");
    await userEvent.keyboard(" ");
    await expect.element(searchbox()).toHaveValue("");
    await expect.element(page.getByRole("button", { name: "Edit under $100" })).toBeVisible();
    await searchbox().fill("<202");
    await userEvent.keyboard("0 ");
    await expect.element(searchbox()).toHaveValue("");
    expect(
      [...container.querySelectorAll(".chip-edit")].map((element) =>
        element.getAttribute("aria-label"),
      ),
    ).toEqual(["Edit under $100", "Edit before 2020"]);
  });

  it("keeps approximate filters readable while accepting their shorthand", async () => {
    renderApp();
    await ready();
    await searchbox().fill("about $100");
    await userEvent.keyboard(" ");
    await expect.element(page.getByRole("button", { name: "Edit about $100" })).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await searchbox().fill("~$100");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("button", { name: "Edit about $100" })).toBeVisible();
  });

  it("inserts a native Space inside a recognized query without committing", async () => {
    renderApp();
    await ready();
    await searchbox().fill("under $100");
    const input = container.querySelector<HTMLInputElement>("input")!;
    input.setSelectionRange(3, 3);
    await userEvent.keyboard(" ");
    await expect.element(searchbox()).toHaveValue("und er $100");
    expect(input.selectionStart).toBe(4);
    expect(container.querySelectorAll("[data-chip]")).toHaveLength(0);
  });

  it("keeps the same input and accepts keyboard-free Space after editing a chip", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Slaking under $100");
    const input = container.querySelector<HTMLInputElement>("input")!;
    await cdp().send("Input.insertText", { text: " " });
    await expect.element(page.getByRole("button", { name: "Edit under $100" })).toBeVisible();
    await userEvent.keyboard("{Backspace}");
    await expect.element(searchbox()).toHaveValue("under $100");
    expect(container.querySelector("input")).toBe(input);
    await cdp().send("Input.insertText", { text: " " });
    await expect.element(page.getByRole("button", { name: "Edit under $100" })).toBeVisible();
    expect(container.querySelector("input")).toBe(input);
    await expect.element(searchbox()).toHaveFocus();
  });

  it.each(["keyboard", "text input"])(
    "preserves whitespace and incomplete drafts from %s",
    async (method) => {
      renderApp();
      await ready();
      for (const draft of [" ", " Sla"]) {
        await searchbox().fill(draft);
        if (method === "keyboard") await userEvent.keyboard(" ");
        else await cdp().send("Input.insertText", { text: " " });
        await expect.element(searchbox()).toHaveValue(`${draft} `);
        expect(container.querySelectorAll("[data-chip]")).toHaveLength(0);
      }
    },
  );

  it("syncs committed chips and waits through chip edits", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Slaking under $100");
    await userEvent.keyboard(" ");
    await expect
      .poll(() => new URL(window.location.href).searchParams.get("q"))
      .toBe("Slaking under $100");

    await page.getByRole("button", { name: "Edit under $100" }).click();
    await searchbox().fill("under $50");
    expect(new URL(window.location.href).searchParams.get("q")).toBe("Slaking under $100");
    await userEvent.keyboard("{Enter}");
    await expect
      .poll(() => new URL(window.location.href).searchParams.get("q"))
      .toBe("Slaking under $50");

    await page.getByRole("button", { name: "Edit under $50" }).click();
    await searchbox().fill("");
    expect(new URL(window.location.href).searchParams.get("q")).toBe("Slaking under $50");
    await userEvent.keyboard("{Backspace}");
    await expect.poll(() => new URL(window.location.href).searchParams.get("q")).toBe("Slaking");
    await page.getByRole("button", { name: "Remove Slaking" }).click();
    await expect.poll(() => new URL(window.location.href).searchParams.get("q")).toBe(null);
  });

  it("hydrates committed chips from the q URL parameter", async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("q", "Slaking under $100");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    renderApp();
    await ready();
    await expect.element(page.getByRole("button", { name: "Edit Slaking" })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Edit under $100" })).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("q")).toBe("Slaking under $100");
  });

  it("uses full-width bounded left-aligned result columns as the viewport changes", async () => {
    renderApp();
    await ready();
    for (const [width, expected] of [
      [1600, 7],
      [1280, 5],
      [1050, 4],
      [800, 3],
      [390, 2],
    ] as const) {
      await page.viewport(width, 832);
      await expect
        .poll(() =>
          getComputedStyle(container.querySelector(".result-grid")!).gridTemplateColumns.trim()
            ? getComputedStyle(container.querySelector(".result-grid")!)
                .gridTemplateColumns.trim()
                .split(/\s+/).length
            : 0,
        )
        .toBe(expected);
    }
    expect(getComputedStyle(container.querySelector(".result-grid")!).justifyContent).toBe("start");
    expect(getComputedStyle(container.querySelector(".result-grid")!).justifyItems).toBe("start");
    expect(
      container.querySelector<HTMLElement>(".collectible-card")!.getBoundingClientRect().width,
    ).toBe(160);
  });

  it("loads the next result page when the sentinel enters the viewport", async () => {
    await page.viewport(390, 844);
    renderApp();
    await ready();
    const initialCount = container.querySelectorAll(".collectible-card").length;
    expect(initialCount).toBe(24);
    const sentinel = container.querySelector<HTMLElement>("[data-results-sentinel]")!;
    expect(sentinel.dataset.hasMore).toBe("true");
    sentinel.scrollIntoView({ block: "center" });
    await expect
      .poll(() => container.querySelectorAll(".collectible-card").length)
      .toBeGreaterThan(initialCount);
    expect(container.querySelectorAll(".collectible-card").length).toBe(48);
  });

  it("treats chips as whole words for modifier Backspace", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Slaking under $100");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("button", { name: "Edit under $100" })).toBeVisible();
    const input = container.querySelector<HTMLInputElement>("input")!;
    await searchbox().fill("free text");
    input.setSelectionRange(0, 0);
    await userEvent.keyboard("{Control>}{Backspace}{/Control}");
    await expect.element(searchbox()).toHaveValue("free text");
    expect(
      [...container.querySelectorAll(".chip-edit")].map((element) => element.textContent),
    ).toEqual(["Slaking"]);
  });

  it("continues through chips when Backspace repeats", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Slaking under $100 grade 9+ before 2020");
    await userEvent.keyboard("{Enter}");
    expect(container.querySelectorAll("[data-chip]")).toHaveLength(4);
    container.querySelector<HTMLInputElement>("input")!.blur();
    await expect.element(searchbox()).not.toHaveFocus();
    await searchbox().click();
    await expect.element(searchbox()).toHaveFocus();
    await userEvent.keyboard("{Backspace}");
    await expect.element(searchbox()).toHaveValue("before 2020");
    for (const count of [3, 2, 1, 0]) {
      await cdp().send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Backspace",
        code: "Backspace",
        windowsVirtualKeyCode: 8,
        nativeVirtualKeyCode: 8,
        autoRepeat: true,
      });
      await expect.poll(() => container.querySelectorAll("[data-chip]").length).toBe(count);
    }
    await cdp().send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });
    await expect.element(searchbox()).toHaveValue("");
  });

  it("keeps repeated Backspace native when editing the middle of a chip", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Slaking ex");
    await userEvent.keyboard("{Enter}{Backspace}");
    await expect.element(searchbox()).toHaveValue("Slaking ex");
    const input = container.querySelector<HTMLInputElement>("input")!;
    input.setSelectionRange(3, 3);
    await cdp().send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
      autoRepeat: true,
    });
    await cdp().send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });
    await expect.element(searchbox()).toHaveValue("Slking ex");
    expect(input.selectionStart).toBe(2);
    expect(new URL(window.location.href).searchParams.get("q")).toBe("Slaking ex");
  });

  it("keeps arbitrary text editable instead of forcing the ghost completion", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Slaking");
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking ex", exact: true }))
      .toBeVisible();
    await userEvent.keyboard(" something-unexpected");
    await expect.element(searchbox()).toHaveValue("something-unexpected");
    await expect.element(page.getByRole("button", { name: "Edit Slaking" })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking ex", exact: true }))
      .not.toBeInTheDocument();
  });

  it("accepts a real touch swipe over ghost text", async () => {
    await page.viewport(390, 844);
    renderApp();
    await ready();
    await searchbox().fill("Sla");
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking", exact: true }))
      .toBeVisible();
    expect(getComputedStyle(container.querySelector(".search-suggestion")!).fontSize).toBe("16px");
    expect(getComputedStyle(container.querySelector(".search-suggestion")!).lineHeight).toBe(
      "24px",
    );
    expect(getComputedStyle(container.querySelector(".search-suggestion")!).pointerEvents).toBe(
      "none",
    );
    await swipe(container.querySelector(".search-suggestion")!, 72);
    await expect
      .element(page.getByRole("button", { name: "Edit Slaking", exact: true }))
      .toBeVisible();
  });

  it("accepts a short swipe from anywhere in the editable search area", async () => {
    await page.viewport(390, 844);
    renderApp();
    await ready();
    await searchbox().fill("Sla");
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking", exact: true }))
      .toBeVisible();
    await swipe(container.querySelector(".search-track")!, 36);
    await expect
      .element(page.getByRole("button", { name: "Edit Slaking", exact: true }))
      .toBeVisible();
  });

  it("accepts a swipe when earlier chips leave a narrow editor", async () => {
    await page.viewport(390, 844);
    renderApp();
    await ready();
    await searchbox().click();
    await userEvent.keyboard("Sla");
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking", exact: true }))
      .toBeVisible();
    await userEvent.keyboard("{Tab}");
    await expect
      .element(page.getByRole("button", { name: "Edit Slaking", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion under $100", exact: true }))
      .toBeVisible();
    await userEvent.keyboard("{Tab}");
    await expect
      .element(page.getByRole("button", { name: "Edit under $100", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion grade 9+", exact: true }))
      .toBeVisible();
    await swipe(container.querySelector(".search-suggestion")!, 36);
    await expect
      .element(page.getByRole("button", { name: "Edit grade 9+", exact: true }))
      .toBeVisible();
  });

  it("accepts a completion from right-arrow movement", async () => {
    await page.viewport(390, 844);
    renderApp();
    await ready();
    await searchbox().fill("Sla");
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking", exact: true }))
      .toBeVisible();
    await userEvent.keyboard("{ArrowRight}");
    await expect
      .element(page.getByRole("button", { name: "Edit Slaking", exact: true }))
      .toBeVisible();
    await expect.element(searchbox()).toHaveValue("");
  });

  it("does not rewrite native caret positions while selecting within a draft", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Slaking");
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking ex" }))
      .toBeVisible();
    const input = container.querySelector<HTMLInputElement>("input")!;
    await userEvent.keyboard("{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}");
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking ex" }))
      .not.toBeInTheDocument();
    expect(input.selectionStart).toBe(5);
    expect(input.selectionEnd).toBe(7);
    await userEvent.keyboard("X");
    await expect.element(searchbox()).toHaveValue("SlakiX");
    expect(input.selectionStart).toBe(6);
    expect(input.selectionEnd).toBe(6);
  });

  it("selects chips with Cmd/Ctrl+A and supports copy, delete, and replacement paste", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Slaking under $100");
    await userEvent.keyboard("{Enter}");
    const input = container.querySelector<HTMLInputElement>("input")!;
    await searchbox().click();
    await userEvent.keyboard("{Control>}a{/Control}");
    expect(
      [...container.querySelectorAll("[data-chip]")].every(
        (chip) => chip.getAttribute("data-selected") === "true",
      ),
    ).toBe(true);

    const copied = new DataTransfer();
    input.dispatchEvent(
      new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: copied }),
    );
    expect(copied.getData("text/plain")).toBe("Slaking under $100");

    await userEvent.keyboard("{Backspace}");
    expect(container.querySelectorAll("[data-chip]")).toHaveLength(0);
    await searchbox().fill("Slaking under $100");
    await userEvent.keyboard("{Enter}");
    await searchbox().click();
    await userEvent.keyboard("{Control>}a{/Control}");
    const replacement = new DataTransfer();
    replacement.setData("text/plain", "not jp");
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: replacement,
      }),
    );
    await expect.element(searchbox()).toHaveValue("not jp");
    expect(container.querySelectorAll("[data-chip]")).toHaveLength(0);
  });

  it("keeps focus when a touch lands at the end of a draft", async () => {
    await page.viewport(390, 844);
    renderApp();
    await ready();
    await searchbox().fill("Sla");
    await expect
      .element(page.getByRole("button", { name: "Accept suggestion Slaking", exact: true }))
      .toBeVisible();
    const input = container.querySelector<HTMLInputElement>("input")!;
    const box = input.getBoundingClientRect();
    const frame = window.frameElement?.getBoundingClientRect();
    input.blur();
    await expect.element(searchbox()).not.toHaveFocus();
    const x = box.right + 1 + (frame?.left ?? 0);
    const y = box.top + box.height / 2 + (frame?.top ?? 0);
    await cdp().send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await cdp().send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.element(searchbox()).toHaveFocus();
    expect(document.activeElement).toBe(input);
  });

  it("focuses the input synchronously when tapping the search shell", async () => {
    await page.viewport(390, 844);
    renderApp();
    await ready();
    const input = container.querySelector("input")!;
    const shell = container.querySelector(".search-track")!;
    shell.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    expect(document.activeElement).toBe(input);
  });

  it("focuses the input from any desktop shell hit area", async () => {
    renderApp();
    await ready();
    const input = container.querySelector<HTMLInputElement>("input")!;
    const shell = container.querySelector<HTMLElement>(".smart-search")!;
    const box = shell.getBoundingClientRect();
    const frame = window.frameElement?.getBoundingClientRect();
    const y = box.top + box.height / 2 + (frame?.top ?? 0);
    for (const offset of [box.left + 100, box.left + 240, box.right - 100]) {
      input.blur();
      await clickAt(offset + (frame?.left ?? 0), y);
      await expect.element(searchbox()).toHaveFocus();
    }
  });

  it("compacts before overflowing, pans chips, and keeps Clear fixed", async () => {
    await page.viewport(390, 844);
    renderApp();
    await ready();
    await searchbox().fill("Slaking under $100 grade 9+ before 2010 reverse holo");
    await userEvent.keyboard("{Enter}");
    await expect
      .poll(() =>
        [...container.querySelectorAll(".chip-edit")].map((element) => element.textContent),
      )
      .toEqual(["Slaking", "<$100", "9+", "<2010", "reverse holo"]);
    const scroller = container.querySelector<HTMLDivElement>(".search-scroll")!;
    await expect.poll(() => scroller.scrollLeft).toBeGreaterThan(0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    const clear = container.querySelector(".search-clear")!.getBoundingClientRect();
    const start = scroller.scrollLeft;
    await swipe([...container.querySelectorAll(".chip-edit")].at(-1)!, 60);
    await expect.poll(() => scroller.scrollLeft).toBeLessThan(start);
    expect(container.querySelector(".search-clear")!.getBoundingClientRect().right).toBe(
      clear.right,
    );
    await expect.element(searchbox()).toHaveValue("");
    await page.viewport(1280, 832);
    await expect
      .poll(() => container.querySelector('.chip-edit[aria-label="Edit under $100"]')?.textContent)
      .toBe("under $100");
  });

  it("hides the header while scrolling down and restores it while scrolling up", async () => {
    renderApp();
    await ready();
    const header = container.querySelector(".demo-header")!;
    const descriptor = Object.getOwnPropertyDescriptor(window, "scrollY");
    let scrollY = 0;
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => scrollY,
    });
    try {
      scrollY = 320;
      window.dispatchEvent(new Event("scroll"));
      await expect.poll(() => header.classList.contains("is-hidden")).toBe(true);
      scrollY = 120;
      window.dispatchEvent(new Event("scroll"));
      await expect.poll(() => header.classList.contains("is-hidden")).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(window, "scrollY", descriptor);
      else Reflect.deleteProperty(window, "scrollY");
    }
  });

  it("does not tokenize during IME composition", async () => {
    renderApp();
    await ready();
    await searchbox().click();
    const input = container.querySelector("input")!;
    await cdp().send("Input.imeSetComposition", {
      text: "Slaking ex",
      selectionStart: 10,
      selectionEnd: 10,
    });
    await expect.element(searchbox()).toHaveValue("Slaking ex");
    expect(container.querySelectorAll("[data-chip]").length).toBe(0);
    await cdp().send("Input.insertText", { text: "Slaking ex" });
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true }),
    );
    await expect.element(searchbox()).toHaveValue("Slaking ex");
    expect(container.querySelectorAll("[data-chip]").length).toBe(0);
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("button", { name: "Edit Slaking ex", exact: true }))
      .toBeVisible();
  });

  it("shows an empty result state for an unknown subject", async () => {
    renderApp();
    await ready();
    await searchbox().fill("Seaking");
    await expect.element(page.getByText("No matching collectibles.")).toBeVisible();
    expect(container.querySelectorAll(".collectible-card").length).toBe(0);
  });
});

describe("asynchronous boundaries", () => {
  it("ignores late responses even when transport cancellation is ineffective", async () => {
    const original = window.fetch.bind(window);
    const pending = new Map<string, (response: Response) => void>();
    vi.spyOn(window, "fetch").mockImplementation((input, init) => {
      if (input === "/api/dictionary") return Promise.resolve(Response.json(index.dictionary));
      if (input === "/api/search")
        return new Promise((resolve) => pending.set(JSON.parse(String(init?.body)).query, resolve));
      return original(input, init);
    });
    renderApp();
    await expect.poll(() => pending.has("")).toBe(true);
    pending.get("")!(Response.json({ items: [], total: 0, suggestion: null }));
    await searchbox().fill("Sla");
    await expect.poll(() => pending.has("Sla")).toBe(true);
    await searchbox().fill("Michael");
    await expect.poll(() => pending.has("Michael")).toBe(true);
    pending.get("Michael")!(Response.json({ items: [records[4]], total: 1, suggestion: null }));
    await expect.element(page.getByRole("heading", { name: /Michael Jordan/ })).toBeVisible();
    pending.get("Sla")!(Response.json({ items: [records[0]], total: 1, suggestion: null }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.querySelector("h2")?.textContent).toContain("Michael Jordan");
  });

  it("reports an API failure and recovers through Retry", async () => {
    const original = window.fetch.bind(window);
    let fail = true;
    vi.spyOn(window, "fetch").mockImplementation((input, init) =>
      input === "/api/search" && fail
        ? Promise.resolve(Response.json({ error: "Unavailable" }, { status: 503 }))
        : original(input, init),
    );
    renderApp();
    await expect.element(page.getByRole("alert")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect
      .poll(() => container.querySelectorAll(".collectible-card").length)
      .toBeGreaterThan(0);
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  });

  it("uses LQIP while loading and falls back when an image fails", async () => {
    const image =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="236"><rect width="140" height="236" fill="white"/></svg>',
      );
    flushSync(() =>
      root.render(
        <CollectibleCard
          item={card("photo", {
            image_url: image,
            lqip_base64: "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
          })}
        />,
      ),
    );
    expect(container.querySelector(".card-lqip")).not.toBeNull();
    await expect
      .poll(() => container.querySelector(".card-image")?.getAttribute("data-loaded"))
      .toBe("true");
    expect(container.querySelector(".card-lqip")).toBeNull();
    flushSync(() =>
      root.render(
        <CollectibleCard item={card("photo", { image_url: "/missing-test-card.jpg" })} />,
      ),
    );
    await expect.poll(() => container.querySelector(".card-placeholder")).not.toBeNull();
  });

  it("renders the placeholder and an enabled Buy button with a client callback", async () => {
    const buy = vi.fn();
    flushSync(() =>
      root.render(
        <CollectibleCard
          item={card("buy", { listed_value: 25 })}
          balance={100}
          ready
          onBuy={buy}
        />,
      ),
    );
    expect(container.querySelector(".card-placeholder")).not.toBeNull();
    const button = page.getByRole("button", { name: "Buy for $25.00" });
    const background = getComputedStyle(container.querySelector(".buy-button")!).backgroundColor;
    await button.hover();
    await expect
      .poll(() => getComputedStyle(container.querySelector(".buy-button")!).backgroundColor)
      .not.toBe(background);
    const location = window.location.href;
    const requests = vi.spyOn(window, "fetch");
    await button.click();
    expect(buy).toHaveBeenCalledOnce();
    expect(window.location.href).toBe(location);
    expect(requests).not.toHaveBeenCalled();
  });
});
