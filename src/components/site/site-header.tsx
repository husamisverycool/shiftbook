"use client";

// Pattern: docs/patterns/_layouts/site.md — Linear's bar with Stripe's menu. Fixed, 64px; see-through over
// the page's opening photograph; once scrolled, a frosted bar with a hairline whose colour follows the part
// of the page under it (dark over the dark bands, light over the light ones); it slides away while the
// reader scrolls down and returns on the way up. "Product" and "How it works" open Stripe's single floating
// panel, which changes size and slides under whichever trigger is open, its contents crossfading, with a
// caret following. Hover opens after a short pause; click, Enter, Space or ↓ open it too; Escape closes.
// Linear's mobile menu (a labelled two-bar button, a full-width panel).
import { BookOpen, CalendarClock, ChevronDown, CircleCheck, FileText, Inbox, Receipt, Route, Scale, Share2, Smartphone, type LucideIcon } from "lucide-react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TabuladoLogo } from "@/components/shiftbook/brand-mark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { otherLanguagePath } from "@/lib/site-routing";
import { cn } from "@/lib/utils";

export interface SiteMenuLabels {
  title: string;
  items: { title: string; body: string }[];
  foot: string;
}

export interface SiteHeaderLabels {
  skip: string;
  home: string;
  main: string;
  product: string;
  how: string;
  pricing: string;
  security: string;
  tools: string;
  logIn: string;
  demo: string;
  start: string;
  menu: string;
  otherLanguage: string;
  otherLanguageName: string;
  otherLanguageCode: string;
  menus: { product: SiteMenuLabels; how: SiteMenuLabels };
}

export interface SiteHeaderLinks {
  home: string;
  product: string;
  pricing: string;
  security: string;
  tools: string;
  logIn: string;
  demo: string | null;
  start: string;
}

type MenuKey = "product" | "how";
const MENUS: MenuKey[] = ["product", "how"];
const ICONS: Record<MenuKey, LucideIcon[]> = { product: [Inbox, Scale, FileText, Receipt, Smartphone], how: [CalendarClock, CircleCheck, BookOpen, Route, Share2] };
const ANCHORS: Record<MenuKey, string[]> = {
  product: ["#tour", "#rules-title", "#file-title", "#tour", "#highlights-title"],
  how: ["#tour", "#twice-title", "#payline-title", "#rules-title", "#hub-title"],
};
const FOOT: Record<MenuKey, string> = { product: "#systems-title", how: "#specs-title" };
const WIDTH: Record<MenuKey, number> = { product: 560, how: 360 };
const DARK_TONES = new Set(["ink", "deep", "night", "black", "flow"]);

const PANEL_LINK = "border-b border-[var(--s-line)] py-4 text-lg font-medium text-[var(--s-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]";

export function SiteHeader({ labels, links }: { labels: SiteHeaderLabels; links: SiteHeaderLinks }) {
  const [scrolled, setScrolled] = useState(false);
  const [dark, setDark] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [sheet, setSheet] = useState(false);
  const [place, setPlace] = useState<{ left: number; caret: number; height: number } | null>(null);
  const otherLanguage = otherLanguagePath(usePathname());
  const bar = useRef<HTMLDivElement>(null);
  const triggers = useRef<Record<MenuKey, HTMLButtonElement | null>>({ product: null, how: null });
  const contents = useRef<Record<MenuKey, HTMLDivElement | null>>({ product: null, how: null });
  const timer = useRef<number>(0);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Scrolled or not; which band is under the bar; hiding on the way down.
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 24);
      if (Math.abs(y - last) > 6) {
        setHidden(y > last && y > 640 && openRef.current === null);
        last = y;
      }
      const under = document.elementsFromPoint(window.innerWidth / 2, 40).find((el) => !el.closest("header"));
      const tone = (under?.closest("[data-tone]") as HTMLElement | null)?.dataset.tone;
      setDark(tone ? DARK_TONES.has(tone) : false);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Where the one panel stands under the open trigger, and how tall it is for that menu.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggers.current[open];
    const content = contents.current[open];
    const box = bar.current?.getBoundingClientRect();
    if (!trigger || !content || !box) return;
    const t = trigger.getBoundingClientRect();
    const centre = t.left + t.width / 2 - box.left;
    const left = Math.max(8, Math.min(centre - WIDTH[open] / 2, box.width - WIDTH[open] - 8));
    setPlace({ left, caret: centre - left, height: content.offsetHeight });
  }, [open]);

  const show = useCallback((key: MenuKey, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(key), delay);
  }, []);
  const hide = useCallback((delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(null), delay);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      triggers.current[open]?.focus();
      setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const light = scrolled && !dark;
  // Linear's header anchor: 32px tall, 12px sides, 13px, grey turning white on a faint glass hover.
  const link = cn("inline-flex h-8 items-center rounded-full px-3 text-[13px] outline-none site-color-slow focus-visible:ring-2 aria-expanded:bg-white/[0.08] aria-expanded:text-[var(--l-text)]", light ? "text-[var(--s-text)]/70 hover:bg-black/[0.06] hover:text-[var(--s-text)] focus-visible:ring-[var(--s-accent-soft)]" : "text-[var(--l-text-3)] hover:bg-white/[0.08] hover:text-[var(--l-text)] focus-visible:ring-white/50");
  const href = (anchor: string) => `${links.home}${anchor}`;

  return (
    <>
      <a href="#content" className="sr-only rounded-md bg-white px-3 py-2 text-sm font-medium text-[var(--s-text)] focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:ring-2 focus:ring-[var(--s-accent-soft)]">
        {labels.skip}
      </a>
      <header className={cn("fixed inset-x-0 top-[var(--banner-height,0px)] z-40 site-morph", hidden ? "-translate-y-full" : "translate-y-0")} onPointerLeave={() => hide(260)}>
        {/* The frosted bar: invisible over the photograph, dark or light by the band under it. */}
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 border-b backdrop-blur-xl site-crossfade", !scrolled ? "border-transparent opacity-0" : dark ? "border-white/[0.08] bg-[var(--l-bg)]/90 opacity-100" : "border-[var(--s-line)] bg-[var(--s-paper)]/85 opacity-100")} />
        <div ref={bar} className="relative mx-auto flex h-16 w-full max-w-[1320px] items-center gap-10 px-6">
          <NextLink href={links.home} aria-label={labels.home} className={cn("rounded-md outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-white/60", light ? "text-[var(--s-text)]" : "text-white")}>
            <TabuladoLogo className="h-6" title="Tabulado" />
          </NextLink>
          <nav aria-label={labels.main} className="hidden flex-1 items-center justify-center gap-7 lg:flex">
            {MENUS.map((key) => (
              <button
                key={key}
                ref={(el) => {
                  triggers.current[key] = el;
                }}
                type="button"
                aria-expanded={open === key}
                aria-controls={`menu-${key}`}
                onPointerEnter={(e) => e.pointerType === "mouse" && show(key, open ? 0 : 90)}
                onClick={() => setOpen(open === key ? null : key)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setOpen(key);
                    window.setTimeout(() => contents.current[key]?.querySelector("a")?.focus(), 0);
                  }
                }}
                className={cn(link, "inline-flex items-center gap-1")}
              >
                {key === "product" ? labels.product : labels.how}
                <ChevronDown aria-hidden className={cn("size-3.5 opacity-60 motion-state", open === key && "rotate-180")} />
              </button>
            ))}
            {[
              { href: links.pricing, label: labels.pricing },
              { href: links.security, label: labels.security },
              { href: links.tools, label: labels.tools },
            ].map((n) => (
              <NextLink key={n.label} href={n.href} className={link} onPointerEnter={() => hide(120)}>
                {n.label}
              </NextLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-6 lg:ml-0 lg:flex">
            <NextLink href={otherLanguage} hrefLang={labels.otherLanguageCode} lang={labels.otherLanguageCode} aria-label={labels.otherLanguageName} className={link}>
              {labels.otherLanguage}
            </NextLink>
            <a href={links.logIn} className={link}>
              {labels.logIn}
            </a>
            <a href={links.start} className="inline-flex h-8 items-center rounded-full bg-[#e5e5e6] px-3 text-[13px] font-[510] text-[#08090a] shadow-[0_0_1px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.07),0_3px_2px_rgba(0,0,0,0.04)] outline-none site-color-slow hover:bg-white focus-visible:ring-2 focus-visible:ring-white/60">
              {labels.start}
            </a>
          </div>

          {/* Stripe's one panel: it changes size and slides under the open trigger. */}
          <div
            className={cn("absolute top-[calc(100%-4px)] hidden lg:block", open ? "pointer-events-auto" : "pointer-events-none")}
            style={{ left: place?.left ?? 0, width: open ? WIDTH[open] : WIDTH.product, transition: "left 260ms cubic-bezier(0.2,0.8,0.2,1), width 260ms cubic-bezier(0.2,0.8,0.2,1)" }}
            onPointerEnter={() => window.clearTimeout(timer.current)}
          >
            <div className={cn("relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#08090a]/90 shadow-[0_8px_32px_#08090a] backdrop-blur-[32px] site-crossfade", open ? "scale-100 opacity-100" : "scale-[0.98] opacity-0")} style={{ height: place?.height ?? 0, transformOrigin: "top", transition: "height 220ms, opacity 180ms, transform 180ms" }}>
              {MENUS.map((key) => {
                const m = labels.menus[key];
                return (
                  <div
                    key={key}
                    id={`menu-${key}`}
                    ref={(el) => {
                      contents.current[key] = el;
                    }}
                    aria-hidden={open !== key}
                    className={cn("absolute inset-x-0 top-0 site-crossfade", open === key ? "opacity-100" : "pointer-events-none opacity-0")}
                    style={{ width: WIDTH[key] }}
                  >
                    <p className="sr-only">{m.title}</p>
                    <ul className={cn("grid gap-2 p-2", key === "product" ? "grid-cols-2" : "grid-cols-1")}>
                      {m.items.map((item, i) => {
                        const I = ICONS[key][i]!;
                        return (
                          <li key={item.title} className={key === "product" && i === m.items.length - 1 ? "col-span-2" : undefined}>
                            <a href={href(ANCHORS[key][i]!)} tabIndex={open === key ? 0 : -1} onClick={() => setOpen(null)} className="group/item flex h-full gap-3 rounded-[10px] bg-white/[0.04] p-4 outline-none site-color-slow hover:bg-white/[0.08] focus-visible:bg-white/[0.08] focus-visible:ring-1 focus-visible:ring-white/20">
                              <span aria-hidden className="mt-px flex shrink-0 text-[var(--l-text-2)]">
                                <I className="size-4" strokeWidth={1.6} />
                              </span>
                              <span className="flex flex-col gap-1.5">
                                <span className="text-[13px] leading-none font-[510] text-[var(--l-text)]">{item.title}</span>
                                <span className="text-[13px] leading-snug text-[var(--l-text-3)] opacity-80 group-hover/item:text-[var(--l-text-2)]">{item.body}</span>
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                    <a href={href(FOOT[key])} tabIndex={open === key ? 0 : -1} onClick={() => setOpen(null)} className="mx-2 mb-2 flex items-center justify-between rounded-md px-4 py-3 text-[13px] text-[var(--l-text-3)] outline-none site-color-slow hover:bg-white/[0.04] hover:text-[var(--l-text)] focus-visible:text-[var(--l-text)]">
                      {m.foot}
                      <span aria-hidden>→</span>
                    </a>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <a href={links.start} className="inline-flex h-8 items-center rounded-full bg-[#e5e5e6] px-3 text-[13px] font-[510] text-[#08090a] shadow-[0_0_1px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.07),0_3px_2px_rgba(0,0,0,0.04)] outline-none site-color-slow hover:bg-white focus-visible:ring-2 focus-visible:ring-white/60">
              {labels.start}
            </a>
            <Sheet open={sheet} onOpenChange={setSheet}>
              <SheetTrigger aria-label={labels.menu} className={cn("inline-flex size-10 items-center justify-center rounded-full outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-white/60", light ? "text-[var(--s-text)]" : "text-white")}>
                {/* Linear's two bars. */}
                <span aria-hidden className="flex w-4 flex-col gap-1.5">
                  <span className="h-px w-full bg-current" />
                  <span className="h-px w-full bg-current" />
                </span>
              </SheetTrigger>
              <SheetContent side="top" className="site gap-0 border-[var(--s-line)] bg-[var(--s-paper)] px-6 pt-4 pb-8 text-[var(--s-text)]" showCloseButton>
                <SheetTitle className="sr-only">{labels.menu}</SheetTitle>
                <nav aria-label={labels.main} className="mt-10 flex flex-col">
                  {[
                    { href: href("#tour"), label: labels.product },
                    { href: href("#twice-title"), label: labels.how },
                    { href: links.pricing, label: labels.pricing },
                    { href: links.security, label: labels.security },
                    { href: links.tools, label: labels.tools },
                  ].map((n) => (
                    <NextLink key={n.label} href={n.href} onClick={() => setSheet(false)} className={PANEL_LINK}>
                      {n.label}
                    </NextLink>
                  ))}
                  <a href={links.logIn} className={PANEL_LINK}>
                    {labels.logIn}
                  </a>
                  {links.demo && (
                    <a href={links.demo} className={PANEL_LINK}>
                      {labels.demo}
                    </a>
                  )}
                  <NextLink href={otherLanguage} hrefLang={labels.otherLanguageCode} lang={labels.otherLanguageCode} onClick={() => setSheet(false)} className={cn(PANEL_LINK, "border-b-0 text-[var(--s-muted)]")}>
                    {labels.otherLanguage}
                  </NextLink>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}
