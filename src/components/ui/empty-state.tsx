import Link from "next/link";
import type { Route } from "next";
import { Card } from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel
}: {
  title: string;
  description?: string;
  actionHref?: Route;
  actionLabel?: string;
}) {
  return (
    <Card className="p-6 text-center">
      <h2 className="font-semibold">{title}</h2>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      ) : null}
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-brand px-4 text-sm font-semibold text-white"
        >
          {actionLabel}
        </Link>
      ) : null}
    </Card>
  );
}
