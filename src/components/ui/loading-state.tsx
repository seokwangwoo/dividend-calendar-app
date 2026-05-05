export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-5">
      <div className="rounded-lg border border-line bg-white px-5 py-4 text-sm font-medium text-muted shadow-panel">
        {label}
      </div>
    </main>
  );
}
