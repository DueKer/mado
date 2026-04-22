import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { DBInitProvider } from "@/components/providers/DBInitProvider";

export const metadata: Metadata = {
  title: "MADO - 多智能体协同工作平台",
  description: "让 AI 像虚拟研发团队一样干活，多Agent协同+RAG私有知识库",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-screen overflow-hidden bg-white">
        <ToastProvider>
          <DBInitProvider>
            {children}
          </DBInitProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
