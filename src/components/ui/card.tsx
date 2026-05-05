import { cn } from "@/lib/utils/cn";

export function Card({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-line bg-white shadow-panel",
        className
      )}
    >
      {children}
    </section>
  );
}
