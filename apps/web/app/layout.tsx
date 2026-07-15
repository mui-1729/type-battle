import type { Metadata } from "next";
import "./globals.css";
import "./visual-reference.css";

export const metadata: Metadata = {
  title: "Type Battle",
  description: "オンラインタイピング対戦ゲーム"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
