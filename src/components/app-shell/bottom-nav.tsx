"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const tabs = [
  { href: "/app/home", label: "ホーム" },
  { href: "/app/portfolio", label: "保有" },
  { href: "/app/calendar", label: "暦" },
  { href: "/app/notifications", label: "通知" },
  { href: "/app/settings", label: "設定" }
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-white/95 shadow-panel backdrop-blur">
      <div className="mx-auto grid max-w-3xl grid-cols-5">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex h-16 items-center justify-center text-sm font-medium text-muted",
                active && "text-brand"
              )}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
