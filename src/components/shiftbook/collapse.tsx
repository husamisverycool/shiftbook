import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A body that opens and closes with Primer's state-change timing (motion.transition.stateChange lists
 * expand/collapse; decision 0037). Closed, it is out of the tab order and hidden from assistive tech,
 * as when it was not drawn at all; the hiding waits for the close to finish.
 */
export function Collapse({ open, id, className, children }: { open: boolean; id?: string; className?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn("grid transition-[grid-template-rows,visibility] motion-state motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "invisible grid-rows-[0fr]")}
    >
      <div className={cn("min-h-0 overflow-hidden", className)}>{children}</div>
    </div>
  );
}

/** The chevron that turns as its body opens (one icon, rotated, rather than two swapped). */
export const TURNING = "transition-transform motion-state motion-reduce:transition-none";
