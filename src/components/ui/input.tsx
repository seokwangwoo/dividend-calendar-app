import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/15",
        className
      )}
      {...props}
    />
  );
}
