import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import type { QueryToken } from "../search/types.ts";

export function useCompaction(
  tokens: QueryToken[],
  scroller: RefObject<HTMLDivElement | null>,
  measurements: RefObject<HTMLDivElement | null>,
  revision: string,
) {
  const [layout, setLayout] = useState<Record<string, { compact: boolean; width: number }>>({});
  useLayoutEffect(() => {
    const viewport = scroller.current;
    const measuring = measurements.current;
    if (!viewport || !measuring) return;
    const measure = () => {
      const sizes = tokens.map((token) => ({
        id: token.id,
        full:
          measuring.querySelector(`[data-full="${token.id}"]`)?.getBoundingClientRect().width ?? 0,
        short:
          measuring.querySelector(`[data-short="${token.id}"]`)?.getBoundingClientRect().width ?? 0,
      }));
      const editor =
        measuring.querySelector("[data-editor-size]")?.getBoundingClientRect().width ?? 8;
      let total = 34 + Math.max(8, editor) + sizes.reduce((sum, size) => sum + size.full + 2, 0);
      const next: typeof layout = {};
      for (const size of sizes) {
        const compact = total > viewport.clientWidth && size.short < size.full;
        const width = compact ? size.short : size.full;
        total -= size.full - width;
        next[size.id] = { compact, width };
      }
      setLayout((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(measuring);
    measure();
    return () => observer.disconnect();
  }, [tokens, scroller, measurements, revision]);
  return layout;
}
