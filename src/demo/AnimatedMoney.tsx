import { useEffect, useRef, useState } from "react";
import { formatMoney } from "./collectibles.ts";

export function AnimatedMoney({ value }: { value: number }) {
  const [initialValue] = useState(value);
  const text = useRef<HTMLSpanElement>(null);
  const displayed = useRef(value);

  useEffect(() => {
    const element = text.current;
    if (!element || displayed.current === value) return;
    const from = displayed.current;
    const started = performance.now();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    function update(amount: number) {
      displayed.current = amount;
      element!.textContent = formatMoney(amount);
    }

    function finish() {
      cancelAnimationFrame(frame);
      update(value);
    }

    function tick(now: number) {
      const progress = Math.min(1, Math.max(0, (now - started) / 450));
      update(from + (value - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    function motionChanged() {
      if (motion.matches) finish();
    }

    if (motion.matches) finish();
    else frame = requestAnimationFrame(tick);
    motion.addEventListener("change", motionChanged);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", motionChanged);
    };
  }, [value]);

  return (
    <span aria-label={formatMoney(value)}>
      <span ref={text} aria-hidden="true">
        {formatMoney(initialValue)}
      </span>
    </span>
  );
}
