"use client";

// Pattern: docs/patterns/_layouts/site.md — Mercury's header: fixed over the page's dark opening band,
// see-through with white text there; once the page scrolls past it, Ramp's and Stripe's blurred light bar
// with a hairline fades in and the text turns dark. One accent pill ("Start free") at the right, as
// Mercury's "Open account". Linear's mobile menu (a labelled two-bar button, a full-width panel).
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { TabuladoLogo } from "@/components/shiftbook/brand-mark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { otherLanguagePath } from "@/lib/site-routing";
import { cn } from "@/lib/utils";

export interface SiteHeaderLabels {
  skip: string;
  home: string;
  main: string;
  product: string;
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

const LINK =
  "rounded-md text-[15px] font-medium outline-none site-color-slow text-white/80 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 group-data-scrolled/header:text-[var(--s-text)]/70 group-data-scrolled/header:hover:text-[var(--s-text)] group-data-scrolled/header:focus-visible:ring-[var(--s-accent-soft)]";
const PANEL_LINK = "border-b border-[var(--s-line)] py-4 text-lg font-medium text-[var(--s-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]";

export function SiteHeader({ labels, links }: { labels: SiteHeaderLabels; links: SiteHeaderLinks }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const otherLanguage = otherLanguagePath(usePathname());
  useEffect(() => {
    const read = () => setScrolled(window.scrollY > 24);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);
  const nav = [
    { href: links.product, label: labels.product },
    { href: links.pricing, label: labels.pricing },
    { href: links.security, label: labels.security },
    { href: links.tools, label: labels.tools },
  ];
  return (
    <>
      <a href="#content" className="sr-only rounded-md bg-white px-3 py-2 text-sm font-medium text-[var(--s-text)] focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:ring-2 focus:ring-[var(--s-accent-soft)]">
        {labels.skip}
      </a>
      <header data-scrolled={scrolled || undefined} className="group/header fixed inset-x-0 top-[var(--banner-height,0px)] z-40">
        {/* The light bar: invisible over the dark band, fades in on scroll. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 border-b border-transparent opacity-0 motion-state group-data-scrolled/header:border-[var(--s-line)] group-data-scrolled/header:bg-[var(--s-paper)]/85 group-data-scrolled/header:opacity-100 group-data-scrolled/header:backdrop-blur-xl" />
        <div className="relative mx-auto flex h-16 w-full max-w-[1320px] items-center gap-10 px-6">
          <NextLink href={links.home} aria-label={labels.home} className="rounded-md text-white outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-white/60 group-data-scrolled/header:text-[var(--s-text)]">
            <TabuladoLogo className="h-6" title="Tabulado" />
          </NextLink>
          <nav aria-label={labels.main} className="hidden flex-1 items-center justify-center gap-8 lg:flex">
            {nav.map((n) => (
              <NextLink key={n.label} href={n.href} className={LINK}>
                {n.label}
              </NextLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-6 lg:ml-0 lg:flex">
            <NextLink href={otherLanguage} hrefLang={labels.otherLanguageCode} lang={labels.otherLanguageCode} aria-label={labels.otherLanguageName} className={LINK}>
              {labels.otherLanguage}
            </NextLink>
            <a href={links.logIn} className={LINK}>
              {labels.logIn}
            </a>
            <a href={links.start} className="inline-flex h-10 items-center rounded-full bg-[var(--s-accent)] px-5 text-[15px] font-medium text-white outline-none site-color-slow hover:bg-[var(--s-accent-2)] focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)] focus-visible:ring-offset-2">
              {labels.start}
            </a>
          </div>
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <a href={links.start} className="inline-flex h-9 items-center rounded-full bg-[var(--s-accent)] px-4 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--s-accent-soft)]">
              {labels.start}
            </a>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger aria-label={labels.menu} className="inline-flex size-10 items-center justify-center rounded-full text-white outline-none site-color-slow focus-visible:ring-2 focus-visible:ring-white/60 group-data-scrolled/header:text-[var(--s-text)]">
                {/* Linear's two bars. */}
                <span aria-hidden className="flex w-4 flex-col gap-1.5">
                  <span className="h-px w-full bg-current" />
                  <span className="h-px w-full bg-current" />
                </span>
              </SheetTrigger>
              <SheetContent side="top" className="site gap-0 border-[var(--s-line)] bg-[var(--s-paper)] px-6 pt-4 pb-8 text-[var(--s-text)]" showCloseButton>
                <SheetTitle className="sr-only">{labels.menu}</SheetTitle>
                <nav aria-label={labels.main} className="mt-10 flex flex-col">
                  {nav.map((n) => (
                    <NextLink key={n.label} href={n.href} onClick={() => setOpen(false)} className={PANEL_LINK}>
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
                  <NextLink href={otherLanguage} hrefLang={labels.otherLanguageCode} lang={labels.otherLanguageCode} onClick={() => setOpen(false)} className={cn(PANEL_LINK, "border-b-0 text-[var(--s-muted)]")}>
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
