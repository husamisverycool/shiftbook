"use client";

// Pattern: docs/patterns/sign-up.md — Slack's six code boxes: typing moves on, Backspace moves back,
// pasting fills all six, the sixth digit sends it. One labelled group; each box names its place.
import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export function CodeBoxes({ value, onChange, onComplete, label, disabled, invalid, describedBy }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void; label: string; disabled?: boolean; invalid?: boolean; describedBy?: string }) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
  const set = (next: string, focus: number) => {
    const clean = next.replace(/\D/g, "").slice(0, 6);
    onChange(clean);
    boxes.current[Math.min(focus, 5)]?.focus();
    if (clean.length === 6) onComplete(clean);
  };
  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      set(value.slice(0, i - 1), i - 1);
    } else if (e.key === "ArrowLeft" && i > 0) boxes.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < 5) boxes.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    set(pasted, pasted.length);
  };
  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex justify-center gap-2" data-testid="code-boxes">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={i === 0 ? 6 : 1}
          aria-label={`${label} ${i + 1}/6`}
          aria-invalid={invalid ? true : undefined}
          disabled={disabled}
          autoFocus={i === 0}
          onKeyDown={onKey(i)}
          onPaste={onPaste}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "");
            if (!typed) return set(value.slice(0, i) + value.slice(i + 1), i);
            // A phone's one-time-code autofill puts all six in the first box.
            if (typed.length > 1) return set(value.slice(0, i) + typed, i + typed.length);
            set(value.slice(0, i) + typed + value.slice(i + 1), i + 1);
          }}
          className={cn(
            "size-12 rounded-md border bg-background text-center text-xl font-medium tabular-nums shadow-xs outline-none motion-state focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
            invalid && "border-destructive ring-destructive/20",
          )}
          data-testid={`code-box-${i}`}
        />
      ))}
    </div>
  );
}
