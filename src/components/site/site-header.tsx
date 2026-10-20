"use client";

// Pattern: docs/patterns/_layouts/site.md — Resend's and Attio's sticky header (transparent at the top; a
// blurred background and a hairline border fade in once the page scrolls), Linear's and Mercury's
// contents, Linear's mobile menu (a labelled two-bar button, a full-width panel).
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SITE_BUTTON } from "@/components/site/blocks";
import { TabuladoLogo } from "@/components/shiftbook/brand-mark";
import { buttonVariants } from "@/components/ui/button";
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
  closeMenu: string;
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

const LINK = "rounded-md text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50";

export function SiteHeader({ labels, links }: { labels: SiteHeaderLabels; links: SiteHeaderLinks }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const otherLanguage = otherLanguagePath(usePathname());
  useEffect(() => {
    const read = () => setScrolled(window.scrollY > 8);
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
      <a href="#content" className="sr-only rounded-md bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:ring-2 focus:ring-ring/50">
        {labels.skip}
      </a>
      <header data-scrolled={scrolled || undefined} className="group/header sticky top-[var(--banner-height,0px)] z-40">
        {/* The background layer (Resend's after: layer): invisible at the top, fades in on scroll. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 border-b border-transparent opacity-0 transition-[opacity,border-color] motion-state group-data-scrolled/header:border-border group-data-scrolled/header:bg-background/95 group-data-scrolled/header:opacity-100 group-data-scrolled/header:backdrop-blur-md" />
        <div className="relative mx-auto flex h-15 w-full max-w-7xl items-center gap-6 px-6">
          <NextLink href={links.home} aria-label={labels.home} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <TabuladoLogo className="h-6" title="Tabulado" />
          </NextLink>
          <nav aria-label={labels.main} className="hidden items-center gap-6 md:flex">
            {nav.map((n) => (
              <NextLink key={n.label} href={n.href} className={LINK}>
                {n.label}
              </NextLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-5 md:flex">
            <NextLink href={otherLanguage} hrefLang={labels.otherLanguageCode} lang={labels.otherLanguageCode} aria-label={labels.otherLanguageName} className={LINK}>
              {labels.otherLanguage}
            </NextLink>
            <a href={links.logIn} className={LINK}>
              {labels.logIn}
            </a>
            {links.demo && (
              <a href={links.demo} className={cn(LINK, "hidden lg:inline")}>
                {labels.demo}
              </a>
            )}
            <a href={links.start} className={cn(buttonVariants(), SITE_BUTTON)}>
              {labels.start}
            </a>
          </div>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <a href={links.start} className={cn(buttonVariants(), "h-9 px-3 text-sm")}>
              {labels.start}
            </a>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger aria-label={labels.menu} className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "group/menu")}>
                {/* Linear's two bars. */}
                <span aria-hidden className="flex w-4 flex-col gap-1.5">
                  <span className="h-px w-full bg-current" />
                  <span className="h-px w-full bg-current" />
                </span>
              </SheetTrigger>
              <SheetContent side="top" className="gap-0 px-6 pt-4 pb-8" showCloseButton>
                <SheetTitle className="sr-only">{labels.menu}</SheetTitle>
                <nav aria-label={labels.main} className="mt-10 flex flex-col">
                  {nav.map((n) => (
                    <NextLink key={n.label} href={n.href} onClick={() => setOpen(false)} className="border-b py-3 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      {n.label}
                    </NextLink>
                  ))}
                  <a href={links.logIn} className="border-b py-3 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                    {labels.logIn}
                  </a>
                  {links.demo && (
                    <a href={links.demo} className="border-b py-3 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      {labels.demo}
                    </a>
                  )}
                  <NextLink href={otherLanguage} hrefLang={labels.otherLanguageCode} lang={labels.otherLanguageCode} onClick={() => setOpen(false)} className="py-3 text-base font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
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
