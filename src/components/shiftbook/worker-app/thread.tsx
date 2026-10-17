"use client";

// Pattern: docs/patterns/w/messages.md and workers/[id].md "Messages" — a WhatsApp chat: one thread,
// newest at the bottom, the viewer's own messages on the right, each with its time and, when it was
// written in the other language, a translation marked as such; the field and Send at the bottom.
import { SendHorizontalIcon } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ThreadItem {
  id: string;
  sender: "worker" | "agency";
  authorLabel: string;
  body: string;
  translation: string | null;
  createdAt: Date;
}

export function Thread({
  messages,
  viewer,
  zone,
  labels,
  send,
  testId,
}: {
  messages: ThreadItem[];
  viewer: "worker" | "agency";
  zone: string;
  labels: { empty: string; placeholder: string; send: string; translated: string; you?: string; errors: Record<string, string> };
  send?: (body: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  testId: string;
}) {
  const locale = useLocale();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.length]);
  const when = (d: Date) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(d));
  const submit = () => {
    if (!send || !body.trim()) return;
    start(async () => {
      const r = await send(body);
      if (r.ok) {
        setBody("");
        setError(null);
      } else setError(labels.errors[r.error] ?? labels.errors.generic ?? "");
    });
  };
  return (
    <div className="flex flex-col gap-4" data-testid={testId}>
      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{labels.empty}</p>
      ) : (
        <ol className="flex flex-col gap-3" aria-live="polite">
          {messages.map((m) => {
            const mine = m.sender === viewer;
            return (
              <li key={m.id} className={cn("flex max-w-[85%] flex-col gap-1", mine ? "items-end self-end" : "items-start self-start")} data-testid="thread-message">
                <span className="px-1 text-xs text-muted-foreground">
                  {mine && labels.you ? labels.you : m.authorLabel} · {when(m.createdAt)}
                </span>
                <div className={cn("rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap", mine ? "rounded-br-md bg-foreground text-background" : "rounded-bl-md bg-muted")}>{m.body}</div>
                {m.translation && (
                  <div className="max-w-full px-1 text-xs text-muted-foreground" data-testid="thread-translation">
                    <span className="font-medium">{labels.translated}:</span> {m.translation}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div ref={end} />
      {send && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter starts a new line (WhatsApp on a computer).
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            rows={1}
            maxLength={2000}
            className="max-h-40 min-h-10 flex-1 resize-none"
            aria-invalid={error ? true : undefined}
            data-testid={`${testId}-input`}
          />
          <Button type="submit" size="icon-lg" aria-label={labels.send} disabled={pending || !body.trim()} loading={pending} data-testid={`${testId}-send`}>
            <SendHorizontalIcon />
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
