import { BottomNav } from "@/components/app-shell/bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper pb-20">
      <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
      <BottomNav />
    </div>
  );
}
