import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Cache Components is off: every Shiftbook page shows live, per-agency data, and its loading
  // placeholders would need a design reference we do not have. See docs/decisions/0007.
  cacheComponents: false,
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
  async redirects() {
    return [
      { source: "/", destination: "/en/convert", permanent: false },
      { source: "/:locale(en|es)", destination: "/:locale/convert", permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
