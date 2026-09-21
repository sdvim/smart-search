import { useEffect, useRef, useState } from "react";

const revealDuration = 1000;
const revealExtension = 500;
const revealMaximum = 3000;

export function useScrollHeader(revealKey = 0) {
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const initialRevealKey = useRef(revealKey);
  const revealTimer = useRef<number | null>(null);
  const revealStartedAt = useRef(0);
  const revealDeadline = useRef(0);

  useEffect(() => {
    if (revealKey === initialRevealKey.current) return;
    initialRevealKey.current = revealKey;
    const now = performance.now();
    if (revealDeadline.current <= now) {
      revealStartedAt.current = now;
      revealDeadline.current = now + revealDuration;
    } else {
      revealDeadline.current = Math.min(
        revealStartedAt.current + revealMaximum,
        revealDeadline.current + revealExtension,
      );
    }
    setRevealed(true);
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(
      () => {
        revealTimer.current = null;
        revealStartedAt.current = 0;
        revealDeadline.current = 0;
        setRevealed(false);
      },
      Math.max(0, revealDeadline.current - now),
    );
  }, [revealKey]);

  useEffect(
    () => () => {
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
      revealStartedAt.current = 0;
      revealDeadline.current = 0;
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
