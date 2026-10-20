// Pattern: docs/patterns/site.md §6 — Stripe's "backbone" band: a deep indigo field, a centred heading,
// four figures in a row with thin rules between them and a gradient on the numerals, and below them a
// burst of fine light rays fanning up from a point on the horizon, slowly breathing. Product facts only.
import { cn } from "@/lib/utils";

/** The rays: fine lines from one point, longer and brighter towards the middle. */
function Rays() {
  const rays = Array.from({ length: 140 }, (_, i) => {
    const t = i / 139;
    const angle = -Math.PI * (0.06 + 0.88 * t);
    const centre = 1 - Math.abs(t - 0.5) * 2;
    const length = 120 + centre * 330 + ((i * 37) % 11) * 9;
    return { x: 600 + Math.cos(angle) * length, y: 460 + Math.sin(angle) * length, o: 0.35 + centre * 0.65, w: 0.7 + centre * 1.1 };
  });
  return (
    <svg viewBox="0 0 1200 470" className="w-full" aria-hidden preserveAspectRatio="xMidYMax meet">
      <defs>
        <radialGradient id="ib-glow" cx="50%" cy="100%" r="60%">
          <stop offset="0" stopColor="#dfe3ff" stopOpacity=".85" />
          <stop offset=".45" stopColor="#8a93ff" stopOpacity=".28" />
          <stop offset="1" stopColor="#7c86ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ib-ray" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#aab4ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx="600" cy="470" rx="560" ry="300" fill="url(#ib-glow)" />
      <g className="animate-site-breathe origin-[600px_460px]">
        {rays.map((r, i) => (
          <line key={i} x1="600" y1="460" x2={r.x.toFixed(1)} y2={r.y.toFixed(1)} stroke="url(#ib-ray)" strokeOpacity={r.o.toFixed(2)} strokeWidth={r.w.toFixed(2)} />
        ))}
      </g>
      <circle cx="600" cy="460" r="22" fill="white" opacity=".25" filter="blur(6px)" />
      <circle cx="600" cy="460" r="4" fill="white" />
    </svg>
  );
}

export function IndigoBand({ title, titleLine2, stats, label }: { title: string; titleLine2: string; label: string; stats: { value: string; label: string }[] }) {
  return (
    <section aria-labelledby="indigo-title" data-tone="indigo" className="relative overflow-hidden bg-[linear-gradient(180deg,transparent_0%,rgba(42,47,143,0.6)_55%,#3b3fb3_100%)] px-6 pt-28 text-white md:pt-36">
      <div className="mx-auto w-full max-w-[1200px] text-center">
        <h2 id="indigo-title" className="site-reveal text-[clamp(2rem,2.8vw+1rem,3.5rem)] leading-[1.08] font-[450] tracking-[-0.035em]">
          {title}
          <br />
          {titleLine2}
        </h2>
        <h3 className="sr-only">{label}</h3>
        <dl className="site-reveal mt-14 grid [--reveal-delay:150ms] grid-cols-2 border-y border-white/12 md:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} className={cn("flex flex-col-reverse items-center gap-2 px-4 py-8", i > 0 && "md:border-l md:border-white/12", i % 2 === 1 && "border-l border-white/12")}>
              <dt className="max-w-[18ch] text-[13px] leading-snug text-white/65">{s.label}</dt>
              <dd className="bg-[linear-gradient(180deg,#ffffff,#b9c0ff)] bg-clip-text text-[clamp(2.75rem,3vw+1.5rem,4.25rem)] leading-none font-[400] tracking-[-0.04em] text-transparent tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mx-auto -mt-2 w-full max-w-[1200px]">
        <div data-parallax="-0.08" className="site-parallax">
          <Rays />
        </div>
      </div>
    </section>
  );
}
