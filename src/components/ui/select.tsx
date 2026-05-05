import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Select({
  className,
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly { label: string; value: string }[];
}) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15",
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
