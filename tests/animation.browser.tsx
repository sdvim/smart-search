import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { AnimatedMoney } from "../src/demo/AnimatedMoney.tsx";

let container: HTMLDivElement;
let root: Root;
let now: number;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  now = 0;
  nextFrame = 0;
  frames = new Map();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(value: number) {
  flushSync(() =>
    root.render(
      <StrictMode>
        <AnimatedMoney value={value} />
      </StrictMode>,
    ),
  );
}

function advance(milliseconds: number) {
  now += milliseconds;
  const scheduled = [...frames.values()];
  frames.clear();
  for (const callback of scheduled) callback(now);
}

function amount() {
  return Number(container.querySelector("[aria-hidden]")!.textContent!.replace(/[$,]/g, ""));
}

describe("animated currency", () => {
  it("starts at the real value and rebases upward or downward changes from the displayed amount", () => {
    render(100);
    expect(amount()).toBe(100);
    expect(frames.size).toBe(0);
    render(200);
    expect(amount()).toBe(100);
    expect(container.firstElementChild!.getAttribute("aria-label")).toBe("$200.00");
    advance(225);
    const intermediate = amount();
    expect(intermediate).toBeGreaterThan(100);
    expect(intermediate).toBeLessThan(200);
    render(50);
    expect(amount()).toBe(intermediate);
    expect(frames.size).toBe(1);
    advance(225);
    expect(amount()).toBeLessThan(intermediate);
    expect(amount()).toBeGreaterThan(50);
    advance(225);
    expect(amount()).toBe(50);
    expect(frames.size).toBe(0);
    render(0);
    advance(450);
    expect(amount()).toBe(0);
  });

  it("snaps to the final amount when reduced motion is requested", () => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reducedMotion = vi.spyOn(motion, "matches", "get").mockReturnValue(true);
    vi.spyOn(window, "matchMedia").mockReturnValue(motion);
    render(100);
    render(0);
    expect(amount()).toBe(0);
    expect(frames.size).toBe(0);
    reducedMotion.mockReturnValue(false);
    render(100);
    advance(100);
    expect(amount()).toBeLessThan(100);
    reducedMotion.mockReturnValue(true);
    motion.dispatchEvent(new Event("change"));
    expect(amount()).toBe(100);
    expect(frames.size).toBe(0);
  });

  it("cancels a pending frame when the amount unmounts", () => {
    render(100);
    render(200);
    expect(frames.size).toBe(1);
    flushSync(() => root.render(null));
    expect(frames.size).toBe(0);
  });
});
