import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "実入金 配当カレンダー",
  description: "税引後配当と月別入金予定を確認する配当カレンダー"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
