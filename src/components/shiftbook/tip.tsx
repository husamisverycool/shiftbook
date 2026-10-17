"use client";

import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A tooltip on an existing element, in place of the browser's `title` box (Primer React tooltip:
 * opens after 50ms, fades in, closes at once; decision 0037). No label, no tooltip.
 * `describes`: the label says something the element does not (a flag's reason, a void reason), so it
 * is also in the page for screen readers, and a non-interactive element takes keyboard focus to show
 * it (`focusable`). A label that only repeats truncated text needs neither.
 */
export function Tip({
  label,
  side,
  describes = false,
  focusable = false,
  children,
}: {
  label?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  describes?: boolean;
  focusable?: boolean;
  children: ReactElement;
}) {
  if (label === undefined || label === null || label === "") return children;
  return (
    <>
      <Tooltip>
        <TooltipTrigger render={children} tabIndex={focusable ? 0 : undefined} />
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
      {describes && <span className="sr-only">{label}</span>}
    </>
  );
}
