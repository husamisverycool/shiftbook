// The website's shared pieces (slice aa): sections, two-tone headings (Attio, Linear), the window frame
// product pictures sit in (Stripe Billing's browser frames, Resend's window bar), the hero's lines.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Resend's h-10 button with the product's own corners. */
export const SITE_BUTTON = "h-10 px-4 text-sm";

/** A page section: 1280px container, 24px sides, 96px between sections on desktop and 64px on phones. */
export function Section({ id, className, children, labelledBy }: { id?: string; className?: string; children: ReactNode; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("mx-auto w-full max-w-7xl scroll-mt-20 px-6 py-16 md:py-24", className)}>
      {children}
    </section>
  );
}

/** Attio's and Linear's two-tone heading: the first sentence in the foreground colour, the rest muted. */
export function TwoTone({ id, strong, muted, className, as: Tag = "h2" }: { id?: string; strong: string; muted?: string; className?: string; as?: "h1" | "h2" }) {
  return (
    <Tag id={id} className={cn("max-w-[22em] text-3xl font-semibold leading-[1.1] tracking-[-0.02em] text-balance md:text-[2.5rem]", className)}>
      {strong}
      {muted && <span className="text-muted-foreground"> {muted}</span>}
    </Tag>
  );
}

/** Stripe's and Resend's window frame: a neutral address bar over the product picture. */
export function ProductWindow({ address, label, children, className }: { address: string; label: string; children: ReactNode; className?: string }) {
  return (
    <figure aria-label={label} className={cn("min-w-0 overflow-hidden rounded-xl border bg-background shadow-[0_0_0_1px_rgb(0_0_0/0.02),0_1px_1px_rgb(0_0_0/0.04),0_8px_24px_-8px_rgb(0_0_0/0.12),0_24px_64px_-24px_rgb(0_0_0/0.16)] dark:shadow-none", className)}>
      <div className="flex h-10 items-center gap-3 border-b bg-muted/50 px-4">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </span>
        <span className="mx-auto max-w-[60%] truncate rounded-md bg-background px-3 py-0.5 text-xs text-muted-foreground tabular-nums">{address}</span>
        <span aria-hidden className="w-[42px]" />
      </div>
      {children}
    </figure>
  );
}

/** A small "sample data" label, so no picture passes for a real customer's numbers. */
export function SampleLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted-foreground", className)}>{children}</p>;
}
