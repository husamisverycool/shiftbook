// Pattern: docs/patterns/[...rest].md — an address that matches no page stays inside the frame and
// shows not found (GitHub's 404 keeps the site's header; docs/patterns/_components/error.md).
import { notFound } from "next/navigation";

export default function Unknown() {
  notFound();
}
