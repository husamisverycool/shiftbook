"use client";

import { useEffect, useRef, useState } from "react";

/**
 * True for a moment after a copy, so the button shows a check where its copy icon was (Primer
 * ClipboardCopy; decision 0037).
 */
export function useCopied(ms = 2000): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [
    copied,
    () => {
      clearTimeout(timer.current);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), ms);
    },
  ];
}
