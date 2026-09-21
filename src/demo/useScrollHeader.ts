import { useEffect, useRef, useState } from "react";

export function useScrollHeader(revealKey = 0) {
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const initialRevealKey = useRef(revealKey);
  const revealTimer = useRef<number | null>(null);

  useEffect(() => {
    if (revealKey === initialRevealKey.current) return;
    initialRevealKey.current = revealKey;
    setRevealed(true);
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => {
      revealTimer.current = null;
      setRevealed(false);
    }, 1000);
  }, [revealKey]);

  useEffect(
    () => () => {
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    },
    [],
  );

  useEffect(() => {
    let lastScrollY = Math.max(0, window.scrollY);
    const onScroll = () => {
      const nextScrollY = Math.max(0, window.scrollY);
      const direction = nextScrollY - lastScrollY;
      if (nextScrollY > 0 && Math.abs(direction) < 2) return;
      lastScrollY = nextScrollY;
      setHidden(nextScrollY > 0 && direction > 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return hidden && !revealed;
}
