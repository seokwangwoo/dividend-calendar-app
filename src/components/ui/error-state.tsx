import { Button } from "@/components/ui/button";

export function ErrorState({
  title,
  description,
  actionLabel,
  onAction
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button type="button" onClick={onAction} className="mt-5">
          {actionLabel}
        </Button>
      ) : null}
    </main>
  );
}
