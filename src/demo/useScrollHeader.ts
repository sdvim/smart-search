import { useEffect, useRef, useState } from "react";

export function useScrollHeader() {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const onScroll = () => {
      const nextScrollY = window.scrollY;
      const direction = nextScrollY - lastScrollY.current;
      lastScrollY.current = nextScrollY;
      if (Math.abs(direction) < 2) return;
      setHidden(nextScrollY > 0 && direction > 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return hidden;
}
