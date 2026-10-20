# 0048 — The website sets its type in Inter, on Linear's scale

Date: 2026-10-20. Status: accepted.

## Context
The owner found the website's type and text "AI-looking" and asked that every font, size and proportion
come from a reference rather than from our own choices. The site mixed Geist with Geist Mono labels and
sizes picked per section.

## Decision
The public website (`src/app/[locale]/(site)`) uses Inter (SIL Open Font License, via `next/font/google`)
at Linear's measured scale, read from linear.app's own stylesheet on 2026-10-20: weights 400/510/590;
title sizes 17, 20, 24, 32, 40, 48, 56, 64, 72px with their line heights and -0.012/-0.022em tracking;
text sizes 17, 15, 14, 13, 12px; Linear's dark colours (#08090a background, #f7f8f8, #d0d6e0, #8a8f98,
#62666d text, #23252a borders). No monospace labels. The product app keeps its own type.

## Consequences
One more font download on the website only. Every website heading and paragraph uses the shared `l-*`
type utilities in globals.css instead of sizes written per component.
