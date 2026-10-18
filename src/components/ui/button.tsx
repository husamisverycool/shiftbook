import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"
import { Children, isValidElement, type ReactNode } from "react"
import { cn } from "cn"

// Rest, hover and pressed backgrounds, one step apart (Primer button: rest, hover, active); no press movement.
const buttonStyles = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),black_10%)] active:bg-[color-mix(in_oklch,var(--primary),black_18%)]",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground active:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)] aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_10%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground active:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)] aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          // Solid, with white text: the tinted default did not meet the 4.5:1 text contrast (axe, slice e).
          "bg-destructive text-white hover:bg-destructive/90 active:bg-destructive/80 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:hover:bg-destructive/50 dark:focus-visible:ring-destructive/40",
        link: "text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * The classes merged, so a variant's own border or background replaces the base's (a link drawn as an
 * outline button kept the base's transparent border and showed as plain text).
 */
function buttonVariants(props?: Parameters<typeof buttonStyles>[0]) {
  return cn(buttonStyles(props))
}

/**
 * `loading` (Primer Button): a spinner takes the leading icon's place — or the label's, keeping the
 * width — and the button stays focusable but ignores presses (`aria-disabled`); `loadingLabel` is
 * announced to screen readers.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  loadingLabel,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonStyles> & { loading?: boolean; loadingLabel?: string }) {
  let content = children
  if (loading) {
    const parts = Children.toArray(children as ReactNode)
    const leadingIcon = parts.length > 1 && isValidElement(parts[0])
    content = leadingIcon ? (
      <>
        <Loader2Icon className="animate-spin" aria-hidden />
        {parts.slice(1)}
      </>
    ) : (
      <span className="relative inline-flex items-center justify-center">
        <span className="invisible inline-flex items-center gap-1.5">{children as ReactNode}</span>
        <Loader2Icon className="absolute animate-spin" aria-hidden />
      </span>
    )
  }
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      focusableWhenDisabled={loading || props.focusableWhenDisabled}
      {...props}
    >
      {content as ButtonPrimitive.Props["children"]}
      {loading && loadingLabel && (
        <span role="status" className="sr-only">
          {loadingLabel}
        </span>
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
