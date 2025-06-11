import type { Metadata } from "next";
import "./globals.css"; // この行があることを確認

export const metadata: Metadata = {
  title: "学生便覧チャットボット",
  description: "Next.js and Go Chatbot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}