// The settings pieces keep the shape and measurements docs/patterns/_components/settings.md takes from
// Linear's settings screenshots (decision 0029 rule 11).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
// The page header's links need Next's router, which a unit test has not got.
vi.mock("@/i18n/navigation", () => ({ Link: (props: Record<string, unknown>) => h("a", props) }));

import { SettingsEmpty, SettingsFooter, SettingsPage, SettingsPanel, SettingsRow, SettingsRows, SettingsSection, SettingsTile } from "./settings-panel";

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);
const doc = (markup: string) => {
  // A tiny reader: the classes of the first element carrying a marker attribute.
  const classOf = (marker: string) => markup.match(new RegExp(`<[^>]*${marker}[^>]*class="([^"]*)"|<[^>]*class="([^"]*)"[^>]*${marker}`))?.slice(1).find(Boolean) ?? "";
  return { classOf };
};

describe("settings page", () => {
  it("is one centred column, 688px wide inside 32px side padding, the header 32px above the sections and the sections 48px apart", () => {
    const out = html(h(SettingsPage, { context: "Settings", title: "Your account", children: h("p", null, "body") }));
    expect(out).toContain("max-w-188");
    expect(out).toContain("mx-auto");
    expect(out).toContain("gap-8");
    expect(out).toContain('<h1 class="');
    expect(out).toMatch(/<div class="flex min-w-0 flex-col gap-12"><p>body<\/p><\/div>/);
  });
});

describe("settings section", () => {
  it("is a heading (16px, medium) with one muted line 2px under, named by its heading, its panels 18px under and 12px apart", () => {
    const out = html(h(SettingsSection, { id: "s", title: "Passkeys", description: "One muted line.", children: h("i", null, "panel") }));
    expect(out).toMatch(/<section aria-labelledby="s"/);
    expect(out).toContain('<h2 id="s" class="text-base font-medium">Passkeys</h2>');
    expect(out).toContain('<div class="text-sm text-muted-foreground">One muted line.</div>');
    expect(doc(out).classOf('aria-labelledby="s"')).toContain("gap-4.5");
    expect(out).toContain('<div class="flex min-w-0 flex-1 flex-col gap-0.5"><h2');
    expect(out).toContain('<div class="flex min-w-0 flex-col gap-3"><i>panel</i></div>');
  });

  it("keeps the heading for screen readers only when a tab above already names the section", () => {
    const out = html(h(SettingsSection, { id: "s", title: "Earning codes", titleHidden: true, children: null }));
    expect(out).toContain('<h2 id="s" class="sr-only">Earning codes</h2>');
  });

  it("puts its action at the heading's right", () => {
    const out = html(h(SettingsSection, { id: "s", title: "Employer taxes", action: h("button", null, "Add rate"), children: null }));
    expect(out).toMatch(/<\/div><div class="flex shrink-0 flex-wrap items-center gap-2"><button>Add rate<\/button><\/div>/);
  });
});

describe("settings panels and rows", () => {
  it("is a rounded bordered panel on the card colour, its rows 16px in, the hairline between rows stopping at that padding", () => {
    const out = html(h(SettingsRows, { as: "ul", "aria-label": "Your passkeys", testId: "list" }, h("li", null, "a"), h("li", null, "b")));
    expect(out).toMatch(/^<div class="min-w-0 rounded-lg border bg-card text-card-foreground">/);
    expect(out).toContain('<ul class="flex flex-col divide-y px-4" data-testid="list" aria-label="Your passkeys">');
  });

  it("is a row at least 60px tall: the label (14px, medium) over a muted 13px line, the control at the right, centred", () => {
    const out = html(h(SettingsRow, { label: "Language", description: "Your screens.", htmlFor: "lang", control: h("select", { id: "lang" }) }));
    expect(out).toMatch(/^<div class="flex min-h-15 items-center gap-4 py-2.5">/);
    expect(out).toMatch(/<label data-slot="label" class="[^"]*text-sm[^"]*font-medium[^"]*leading-5" for="lang">Language<\/label>/);
    expect(out).toContain('<div class="text-[13px] leading-[18px] text-muted-foreground">Your screens.</div>');
    expect(out).toMatch(/<div class="flex shrink-0 flex-wrap items-center justify-end gap-2"><select id="lang"><\/select><\/div><\/div>$/);
  });

  it("leads a row with a 32px tile when it has one", () => {
    const out = html(h(SettingsRow, { label: "Google", leading: h(SettingsTile, { children: "G" }) }));
    expect(out).toContain("size-8 shrink-0 items-center justify-center rounded-md bg-muted");
    expect(out).toContain("flex min-w-0 flex-1 items-center gap-2.5");
  });

  it("says when a panel has nothing yet in one muted row of the same height", () => {
    expect(html(h(SettingsEmpty, { testId: "none", children: "No passkeys yet." }))).toBe('<div class="flex min-h-15 items-center py-2.5 text-sm text-muted-foreground" data-testid="none">No passkeys yet.</div>');
  });

  it("pads a panel of free content by 16px and ends it with a footer: a hairline, the note at the left, the action at the right", () => {
    const out = html(h(SettingsPanel, { footer: h(SettingsFooter, { note: "Last changed today." }, h("button", null, "Save")) }, h("p", null, "form")));
    expect(out).toContain('<div class="flex min-w-0 flex-col gap-4 p-4"><p>form</p></div>');
    expect(out).toContain('<div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3"><div class="mr-auto min-w-0 text-[13px] text-muted-foreground">Last changed today.</div><button>Save</button></div>');
  });
});
