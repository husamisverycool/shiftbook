// Pattern: docs/patterns/site.md §3 — Attio's "Your whole stack, connected": a centred eyebrow and
// two-tone heading, then two rows of tiles drifting opposite ways, faded at both edges and still under
// the pointer. Each tile is a payroll system's name set in our own type, with the file it takes in mono
// under it — never the system's logo. Linear's mono caption closes it.
import { Eyebrow, Mono } from "@/components/site/v6/ui";
import { cn } from "@/lib/utils";

export interface SystemTile {
  name: string;
  file: string;
}

function Row({ tiles, reverse }: { tiles: SystemTile[]; reverse?: boolean }) {
  // Twice over, so the row can loop by moving half its width.
  const loop = [...tiles, ...tiles];
  return (
    <div className="site-edge-fade overflow-hidden">
      <ul className={cn("flex w-max gap-3 animate-site-marquee hover:[animation-play-state:paused]", reverse && "[animation-direction:reverse]")}>
        {loop.map((t, i) => (
          <li key={i} aria-hidden={i >= tiles.length || undefined} className="flex h-16 w-[188px] shrink-0 flex-col justify-center gap-1 rounded-xl bg-white/[0.035] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-white/[0.07] ring-inset">
            <span className="truncate text-[14px] font-medium text-white">{t.name}</span>
            <Mono className="text-[10px] text-white/40">{t.file}</Mono>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Systems({ id, eyebrow, title, muted, caption, tiles }: { id: string; eyebrow: string; title: string; muted: string; caption: string; tiles: SystemTile[] }) {
  const half = Math.ceil(tiles.length / 2);
  return (
    <section aria-labelledby={id} data-tone="ink" className="px-0 pt-8 pb-28 text-white md:pb-36">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col items-center px-6 text-center">
        <Eyebrow tone="dark" className="site-reveal">
          {eyebrow}
        </Eyebrow>
        <h2 id={id} className="site-reveal mt-5 max-w-[24em] text-[clamp(1.5rem,1.2vw+1.1rem,2.125rem)] leading-[1.15] font-[500] tracking-[-0.025em] text-balance [--reveal-delay:80ms]">
          {title} <span className="text-white/45">{muted}</span>
        </h2>
      </div>
      <div className="site-reveal mt-12 flex flex-col gap-3 [--reveal-delay:160ms]">
        <Row tiles={[...tiles.slice(0, half), ...tiles.slice(half)]} />
        <Row tiles={[...tiles.slice(half), ...tiles.slice(0, half)]} reverse />
      </div>
      <p className="mt-10 text-center">
        <Mono className="text-white/35">{caption}</Mono>
      </p>
    </section>
  );
}
