import { AppShell } from "@/components/app-shell/app-shell";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";

export default function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ReactQueryProvider>
      <AppShell>{children}</AppShell>
    </ReactQueryProvider>
  );
}
