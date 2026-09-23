import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type HomeCmsAuditStatus = "denied" | "stale" | "unavailable";

const statusMessageVariants = cva("font-medium", {
  variants: {
    state: {
      denied: "text-[var(--error)]",
      stale: "text-[var(--ink-muted)]",
      unavailable: "text-[var(--ink-muted)]",
    },
  },
});

export function HomeCmsAuditStatusMessage({
  children,
  state,
}: {
  children: ReactNode;
  state: HomeCmsAuditStatus;
}) {
  return (
    <p className={cn("m-0 text-sm", statusMessageVariants({ state }))}>
      {children}
    </p>
  );
}
