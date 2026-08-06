import type { Metadata, Viewport } from "next";
import type React from "react";

import { LiveRegion } from "@/lib/live-region";

import "./globals.css";

export const metadata: Metadata = {
  title: "中國基督教播道會顯恩堂系統",
  description: "中國基督教播道會顯恩堂教會管理系統",
};

// viewport-fit=cover lets env(safe-area-inset-*) resolve on notched devices;
// the fixed bottom nav and shell outlet both depend on it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
