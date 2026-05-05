import Link from "next/link";
import type { Route } from "next";

export function PageHeader({
  title,
  subtitle,
  actionHref,
  actionLabel
}: {
  title: string;
  subtitle?: string;
  actionHref?: Route;
  actionLabel?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="inline-flex h-10 shrink-0 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white"
        >
          {actionLabel}
        </Link>
      ) : null}
    </header>
  );
}
