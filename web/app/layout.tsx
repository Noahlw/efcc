import type { Metadata } from "next";
import type React from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "顯恩堂系統",
  description: "EFCC Church Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>
        <output role="status" aria-live="polite" className="sr-only" />
        {children}
      </body>
    </html>
  );
}
