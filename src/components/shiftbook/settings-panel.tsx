// Settings pages' shared pieces (decision 0029 rule 11). Pattern: docs/patterns/_components/settings.md —
// Linear's own settings screenshots (Preferences, Notifications, team permissions, SAML domains, API keys):
// one centred column; each section a heading with one muted line; its rows inside a rounded bordered
// panel, separated by hairlines inset to the panel's padding; each row a label over a muted line on the
// left and its control on the right, vertically centred.
import { createElement, useId, type ComponentProps, type HTMLAttributes, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Page, PageHeader } from "./page";

/**
 * The page: the shared header (decision 0029 rule 2), then the sections 32px under it and 48px apart, in
 * one centred column 688px wide (Linear's 640px column at its 13px type, scaled to our 14px; 752px with
 * the page's 32px side padding).
 */
export function SettingsPage({
  context,
  title,
  description,
  actions,
  children,
  className,
}: {
  context?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Page width="narrow" className={cn("max-w-188 gap-8", className)}>
      <PageHeader context={context} title={title} description={description} actions={actions} />
      <div className="flex min-w-0 flex-col gap-12">{children}</div>
    </Page>
  );
}

/**
 * A section: its heading (16px, medium) with one muted line 2px under it, an optional action at the
 * heading's right (Linear's "+ Restriction"), then its panels 18px under, 12px apart. `titleHidden`: the
 * heading is for screen readers only, when a tab right above already names the section.
 */
export function SettingsSection({
  id,
  title,
  description,
  action,
  children,
  className,
  testId,
  titleHidden,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
  titleHidden?: boolean;
}) {
  const auto = useId();
  const headingId = id ?? `${auto}-title`;
  return (
    <section aria-labelledby={headingId} className={cn("flex min-w-0 flex-col gap-4.5", className)} data-testid={testId}>
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={headingId} className={titleHidden ? "sr-only" : "text-base font-medium"}>
            {title}
          </h2>
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

const PANEL = "min-w-0 rounded-lg border bg-card text-card-foreground";

/** The panel's foot (Linear's setup dialog: a hairline, then the action at the right; Vercel: a note at the left). */
export function SettingsFooter({ note, children, className }: { note?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3", className)}>
      <div className="mr-auto min-w-0 text-[13px] text-muted-foreground">{note}</div>
      {children}
    </div>
  );
}

/**
 * A panel of rows: 16px in from its border, a hairline between rows that stops at that padding. `as="ul"`
 * for a list (its rows `as="li"`).
 */
export function SettingsRows({
  as: Tag = "div",
  footer,
  className,
  children,
  testId,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "div" | "ul"; footer?: ReactNode; testId?: string }) {
  return (
    <div className={cn(PANEL, className)} data-testid={Tag === "div" ? testId : undefined}>
      {createElement(Tag, { className: "flex flex-col divide-y px-4", "data-testid": Tag === "ul" ? testId : undefined, ...props }, children)}
      {footer}
    </div>
  );
}

/** A panel of free content (a form, a file): 16px padding, fields 16px apart (Linear's SAML setup). */
export function SettingsPanel({ footer, className, children, testId, ...props }: Omit<ComponentProps<"div">, "ref"> & { footer?: ReactNode; testId?: string }) {
  return (
    <div className={cn(PANEL, className)} data-testid={testId} {...props}>
      <div className="flex min-w-0 flex-col gap-4 p-4">{children}</div>
      {footer}
    </div>
  );
}

/**
 * A row, at least 60px tall: an optional 32px tile (Linear's notification methods), the label (14px,
 * medium) over a muted 13px line, and the control at the right, vertically centred.
 */
export function SettingsRow({
  as: Tag = "div",
  label,
  description,
  descriptionId,
  descriptionTestId,
  control,
  htmlFor,
  leading,
  className,
  testId,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "children"> & {
  as?: "div" | "li" | "label";
  label: ReactNode;
  description?: ReactNode;
  descriptionId?: string;
  descriptionTestId?: string;
  control?: ReactNode;
  /** The control's id: the label names it. */
  htmlFor?: string;
  leading?: ReactNode;
  testId?: string;
}) {
  return createElement(
    Tag,
    { className: cn("flex min-h-15 items-center gap-4 py-2.5", className), "data-testid": testId, ...props },
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {leading}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {htmlFor ? (
            <Label htmlFor={htmlFor} className="leading-5">
              {label}
            </Label>
          ) : (
            <div className="text-sm leading-5 font-medium">{label}</div>
          )}
          {description && (
            <div id={descriptionId} className="text-[13px] leading-[18px] text-muted-foreground" data-testid={descriptionTestId}>
              {description}
            </div>
          )}
        </div>
    </div>,
    control && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{control}</div>,
  );
}

/** The 32px tile before a row's label (Linear's notification methods; its SAML domains' "@"). */
export function SettingsTile({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-4", className)}>{children}</span>;
}

/** A panel's only row when it has nothing yet: the muted line (Linear's "No approved email domains"). */
export function SettingsEmpty({ children, className, testId, as: Tag = "div" }: { children: ReactNode; className?: string; testId?: string; as?: "div" | "li" }) {
  return (
    <Tag className={cn("flex min-h-15 items-center py-2.5 text-sm text-muted-foreground", className)} data-testid={testId}>
      {children}
    </Tag>
  );
}

/** A labelled field inside a panel: the label, the control at full width, a muted hint, the rule it breaks. */
export function SettingsField({ id, label, hint, hintId, problem, children, className }: { id: string; label: ReactNode; hint?: ReactNode; hintId?: string; problem?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <p id={hintId} className="text-[13px] leading-[18px] text-muted-foreground">
          {hint}
        </p>
      )}
      {problem}
    </div>
  );
}
