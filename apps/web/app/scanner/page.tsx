"use client";

import { AppShell } from "@/lib/app-shell";
import { ScannerBoundary } from "@/lib/scanner-boundary";

/**
 * Scanner starts in Self mode for every authenticated account. ScannerBoundary
 * asks the Worker for the current eligible assisted Event projection before it
 * exposes the optional operator mode.
 */
const ScannerPage = () => (
  <AppShell>
    <ScannerBoundary />
  </AppShell>
);

export default ScannerPage;
