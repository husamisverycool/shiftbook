// Pattern: docs/patterns/site.md — Linear's homepage parts, measured from linear.app (2026-10-20): the
// keyline between sections (a hairline with a faint glow), and a product section: the title at the left
// in two lines (48px, weight 510), the description at the right from about 52% of the width (20px, grey),
// a wide product scene that fades into the page at its edges, and a "Features" row — the label at the left,
// the feature names at the right in two columns split by a hairline, each with a "+" that opens a sentence.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Linear's keyline: one hairline across the page with a faint glow above it. */
export function Keyline() {
  return (
    <div aria-hidden className="relative h-px w-full">
      <div className="absolute inset-x-0 -top-px h-px bg-white/[0.06] shadow-[0_0_24px_1px_rgba(255,255,255,0.06)]" />
    </div>
  );
}

export function Inset({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1440px] px-6 md:px-20", className)}>{children}</div>;
}

export interface Feature {
  name: string;
  text: string;
}

function Features({ label, items }: { label: string; items: Feature[] }) {
  const half = Math.ceil(items.length / 2);
  const column = (list: Feature[]) => (
    <ul className="flex flex-col">
      {list.map((f) => (
        <li key={f.name}>
          <details className="group/f">
            <summary className="cursor-pointer list-none rounded-sm py-1 l-text-regular text-[var(--l-text-3)] outline-none site-color-slow hover:text-[var(--l-text)] focus-visible:ring-2 focus-visible:ring-white/30 [&::-webkit-details-marker]:hidden">
              {f.name}
              <span aria-hidden className="ml-1.5 inline-block text-[var(--l-text-4)] motion-state group-open/f:rotate-45">
                +
              </span>
            </summary>
            <p className="max-w-[34ch] pt-1 pb-3 l-text-regular text-[var(--l-text-4)]">{f.text}</p>
          </details>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <p className="l-text-regular text-[var(--l-text-4)]">{label}</p>
      <div className="grid grid-cols-2 gap-x-6">
        <div className="pr-6">{column(items.slice(0, half))}</div>
        <div className="border-l border-[var(--l-line)] pl-6">{column(items.slice(half))}</div>
      </div>
    </div>
  );
}

/** One of Linear's product sections. The title takes a line break where `title` has "\n". */
export function ProductSection({ id, title, body, link, scene, featuresLabel, features }: { id: string; title: string; body: string; link?: { href: string; label: string }; scene: ReactNode; featuresLabel: string; features: Feature[] }) {
  const [first, second] = title.split("\n");
  return (
    <section aria-labelledby={id} className="py-32 md:py-40">
      <Inset className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <h2 id={id} className="site-reveal l-title-6 max-w-[18ch] text-balance text-[var(--l-text)]">
          {first}
          {second && (
            <>
              <br />
              {second}
            </>
          )}
        </h2>
        <div className="site-reveal flex flex-col items-start gap-8 [--reveal-delay:100ms]">
          <p className="max-w-[34ch] l-title-2 text-pretty text-[var(--l-text-2)]">{body}</p>
          {link && (
            <a href={link.href} className="group/l inline-flex items-center gap-1.5 rounded-sm l-text-regular text-[var(--l-text)] outline-none focus-visible:ring-2 focus-visible:ring-white/40">
              {link.label}
              <span aria-hidden className="motion-state group-hover/l:translate-x-0.5">
                →
              </span>
            </a>
          )}
        </div>
      </Inset>
      <div className="site-reveal relative mx-auto mt-16 w-full max-w-[1440px] overflow-hidden [--reveal-delay:150ms] md:mt-20">{scene}</div>
      <Inset className="mt-12 md:mt-16">
        <Features label={featuresLabel} items={features} />
      </Inset>
    </section>
  );
}
