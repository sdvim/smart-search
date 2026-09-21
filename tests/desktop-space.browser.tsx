import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { App } from "../src/demo/App.tsx";

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  await page.viewport(1280, 832);
  window.history.replaceState(window.history.state, "", window.location.pathname);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => root.render(<App />));
  await expect
    .poll(() => container.querySelector(".results")?.getAttribute("aria-busy"))
    .toBe("false");
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
});

describe("desktop Space", () => {
  it.each(["Space", "Shift+Space", "text input"])(
    "commits the typed price without the suggested digits using %s",
    async (inputMethod) => {
      const searchbox = page.getByRole("searchbox", { name: "Search collectibles" });
      await searchbox.fill("under $30");
      await expect
        .element(page.getByRole("button", { name: /^Accept suggestion under \$30\d+$/ }))
        .toBeVisible();

      if (inputMethod === "text input") await cdp().send("Input.insertText", { text: " " });
      else await userEvent.keyboard(inputMethod === "Space" ? " " : "{Shift>} {/Shift}");

      await expect
        .element(page.getByRole("button", { name: "Edit under $30", exact: true }))
        .toBeVisible();
      await expect.element(searchbox).toHaveValue("");
      expect(new URL(window.location.href).searchParams.get("q")).toBe("under $30");
      await userEvent.keyboard("grade 9");
      await expect.element(searchbox).toHaveValue("grade 9");
    },
  );
});
