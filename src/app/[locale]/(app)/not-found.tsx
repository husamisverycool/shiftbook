// Pattern: docs/patterns/home.md — Not found keeps the frame, with a way Home
// (docs/patterns/_components/error.md: GitHub's 404 keeps the site's header).
import { PageNotFound } from "@/components/shiftbook/page-error";

export default function NotFound() {
  return <PageNotFound />;
}
