import { requireAdminUser } from "@/features/admin/auth";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminUser();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-5 py-8">
      {children}
    </main>
  );
}
