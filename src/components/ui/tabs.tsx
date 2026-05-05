import { cn } from "@/lib/utils/cn";

export function Tabs({
  options,
  value
}: {
  options: readonly { label: string; value: string }[];
  value: string;
}) {
  return (
    <div className="flex rounded-lg border border-line bg-white p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "h-9 flex-1 rounded-md text-sm font-medium text-muted",
            option.value === value && "bg-paper text-ink"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
