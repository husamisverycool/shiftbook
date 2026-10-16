import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Cache Components is off: every Shiftbook page shows live, per-agency data, and its loading
  // placeholders would need a design reference we do not have. See docs/decisions/0007.
  cacheComponents: false,
  // No generated agent-instruction files in the repository.
  agentRules: false,
  experimental: {
    // Uploads go one file per request: a timesheet up to 25 MB (intake/upload.ts) and a placement
    // file up to 10 MB, plus room for the form's own bytes. Next's default is 1 MB.
    serverActions: { bodySizeLimit: "26mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: [
    "sharp",
    "tesseract.js",
    "@napi-rs/canvas",
    "pdfjs-dist",
    "heic-convert",
    "@react-pdf/renderer",
    "exceljs",
    "postgres",
  ],
  // Client approval links carry a secret in the path (decision 0013): never cached, never indexed,
  // never sent on as a referrer.
  async headers() {
    return [
      {
        source: "/:locale(en|es)/approve/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // Invite and password reset links carry a secret in the path too (decision K1).
      ...["/:locale(en|es)/invite/:token*", "/:locale(en|es)/sign-in/reset/:token+"].map((source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
    ];
  },
  async redirects() {
    return [
      { source: "/", destination: "/en/convert", permanent: false },
      { source: "/:locale(en|es)", destination: "/:locale/convert", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
