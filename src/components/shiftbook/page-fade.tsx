"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * After a navigation, the new page appears with a quick fade, never a slide (Fluent motion: "a quick
 * fade transition instead of moving or sliding"; decision 0037). Fades the panel it sits in; the first
 * load does not fade. The duration and curve are the stylesheet's tokens.
 */
export function PageFade() {
  const pathname = usePathname();
  const mark = useRef<HTMLSpanElement>(null);
  const seen = useRef(pathname);

  useEffect(() => {
    if (seen.current === pathname) return;
    seen.current = pathname;
    const panel = mark.current?.parentElement;
    if (!panel?.animate) return;
    const css = getComputedStyle(panel);
    panel.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: parseFloat(css.getPropertyValue("--motion-short")) || 0,
      easing: css.getPropertyValue("--ease-enter").trim() || "linear",
    });
  }, [pathname]);

  return <span ref={mark} hidden />;
}
