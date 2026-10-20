// The ordered parts of the sixth design's interactive pieces, shared by the page (on the server) and the
// pieces themselves (in the browser).
export const PARTS = ["hours", "rule", "rate", "arithmetic", "rounding", "law", "reading"] as const;
export type Part = (typeof PARTS)[number];

export const HIGHLIGHTS = ["twice", "explains", "link", "language", "sealed", "cent"] as const;
export type Highlight = (typeof HIGHLIGHTS)[number];
