"use client";

import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A tooltip on an existing element, in place of the browser's `title` box (Primer React tooltip:
 * opens after 50ms, fades in, closes at once; decision 0037). No label, no tooltip.
 */
export function Tip({ label, side, children }: { label?: ReactNode; side?: "top" | "bottom" | "left" | "right"; children: ReactElement }) {
  if (label === undefined || label === null || label === "") return children;
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
