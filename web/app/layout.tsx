import type { Metadata } from "next";
import type React from "react";

import { LiveRegion } from "@/lib/live-region";

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
        <LiveRegion />
        {children}
      </body>
    </html>
  );
}
