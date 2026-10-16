// The product's mark (decision 0031): shadcn/ui's login and sidebar blocks set a product as a small
// rounded square in the primary color holding one icon, beside or above its name.
import { BookOpenCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ size = "default", className }: { size?: "default" | "lg"; className?: string }) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center bg-primary text-primary-foreground", size === "lg" ? "size-10 rounded-xl" : "size-6 rounded-md", className)}>
      <BookOpenCheckIcon className={size === "lg" ? "size-5" : "size-3.5"} />
    </span>
  );
}
