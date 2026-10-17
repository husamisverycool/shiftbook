"use client";

import { useLayoutEffect, useRef } from "react";

/** Where each tab row's underline last stood, so a new page's tabs start it there and slide it over. */
const last = new Map<string, { left: number; width: number }>();

/**
 * The chosen tab's underline, sliding to the tab chosen next (Primer motion.transition.stateChange lists
 * "tab-switch"; decision 0037). Until it has measured, the chosen link keeps its own border, so the
 * page reads the same before the script runs.
 */
export function TabUnderline({ id }: { id: string }) {
  const bar = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = bar.current;
    const nav = el?.parentElement;
    if (!el || !nav) return;
    const place = (animate: boolean) => {
      const active = nav.querySelector<HTMLElement>("[aria-current=page]");
      if (!active) {
        el.style.opacity = "0";
        return;
      }
      const at = { left: active.offsetLeft, width: active.offsetWidth };
      el.style.transitionProperty = animate ? "" : "none";
      el.style.translate = `${at.left}px 0`;
      el.style.width = `${at.width}px`;
      el.style.opacity = "1";
      last.set(id, at);
    };
    const from = last.get(id);
    if (from) {
      el.style.transitionProperty = "none";
      el.style.translate = `${from.left}px 0`;
      el.style.width = `${from.width}px`;
      el.style.opacity = "1";
      void el.offsetWidth; // the start position takes effect before the slide
    }
    place(Boolean(from));
    nav.dataset.underline = "ready";
    const moved = new MutationObserver(() => place(true));
    moved.observe(nav, { subtree: true, attributeFilter: ["aria-current"] });
    const resized = new ResizeObserver(() => place(false));
    resized.observe(nav);
    return () => {
      moved.disconnect();
      resized.disconnect();
    };
  }, [id]);

  return (
    <span
      ref={bar}
      aria-hidden
      className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-foreground opacity-0 transition-[translate,width] motion-state motion-reduce:transition-none"
    />
  );
}
