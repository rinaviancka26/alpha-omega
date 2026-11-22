import { useLayoutEffect, useRef, useState } from 'react';

/** Largest box with the given aspect ratio (w/h) that fits inside the container. */
export function useFitBox<T extends HTMLElement>(ratio: number) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth, ch = el.clientHeight;
      const w = Math.min(cw, ch * ratio);
      setBox({ w: Math.floor(w), h: Math.floor(w / ratio) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);
  return [ref, box] as const;
}
