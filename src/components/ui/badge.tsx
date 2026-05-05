import { cn } from "@/lib/utils/cn";

type BadgeVariant = "success" | "neutral" | "warning" | "danger";

const variants: Record<BadgeVariant, string> = {
  success: "border-brand/25 bg-brand/10 text-brand",
  neutral: "border-line bg-paper text-muted",
  warning: "border-warn/25 bg-warn/10 text-warn",
  danger: "border-red-200 bg-red-50 text-red-700"
};

export function Badge({
  children,
  variant = "neutral",
  className
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
