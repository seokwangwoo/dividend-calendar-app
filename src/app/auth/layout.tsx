export default function AuthLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-8">
      {children}
    </main>
  );
}
