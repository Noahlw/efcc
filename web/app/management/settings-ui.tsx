import { cva } from "class-variance-authority";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const settingsRowVariants = cva(
  "grid min-h-16 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 px-4 py-3.5 text-left text-[var(--ink)]",
  {
    variants: {
      interactive: {
        true: "transition-colors motion-reduce:transition-none hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)] focus-visible:ring-inset",
        false: "",
      },
    },
    defaultVariants: {
      interactive: false,
    },
  }
);

export function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className="block size-5 shrink-0 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
      viewBox="0 0 20 20"
      focusable="false"
    >
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      className="block size-5 shrink-0 fill-none stroke-[var(--ink-muted)] stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
      viewBox="0 0 20 20"
      focusable="false"
    >
      <path d="m8 5 7 7-7 7" />
    </svg>
  );
}

export function SettingsBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="mt-[-0.25rem] inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 py-2 text-[0.88rem] leading-[1.2] text-[var(--ink-muted)] transition-colors motion-reduce:transition-none hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2"
    >
      <BackIcon />
      <span className="min-w-0 wrap-anywhere">{label}</span>
    </Link>
  );
}

type SettingsRowProps = {
  label: string;
  description?: string;
  href?: string;
  showChevron?: boolean;
};

export function SettingsRow({
  label,
  description,
  href,
  showChevron = Boolean(href),
}: SettingsRowProps) {
  const content = (
    <>
      <span className="block min-w-0">
        <span className="block font-semibold leading-[1.35] wrap-anywhere">
          {label}
        </span>
        {description && (
          <span className="mt-1 block wrap-anywhere text-[0.84rem] leading-[1.45] text-[var(--ink-muted)]">
            {description}
          </span>
        )}
      </span>
      {showChevron && <ChevronIcon />}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(settingsRowVariants({ interactive: true }))}
        data-slot="settings-row"
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={cn(settingsRowVariants({ interactive: false }))}
      data-slot="settings-row"
    >
      {content}
    </div>
  );
}

export function SettingsDetailCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 gap-0 rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-none ring-0 max-[480px]:p-4">
      {children}
    </Card>
  );
}

export function SettingsDetailList({
  children,
  separated = false,
}: {
  children: React.ReactNode;
  separated?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-3.5",
        separated &&
          "[&>*+*]:border-t [&>*+*]:border-[var(--line)] [&>*+*]:pt-3.5"
      )}
    >
      {children}
    </div>
  );
}

export function SettingsDetailRow({
  label,
  description,
  value,
  enabled = false,
}: {
  label: string;
  description: string;
  value: string;
  enabled?: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <span className="block min-w-0">
        <span className="block font-semibold leading-[1.35] wrap-anywhere">
          {label}
        </span>
        {description && (
          <span className="mt-1 block wrap-anywhere text-[0.84rem] leading-[1.45] text-[var(--ink-muted)]">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          "inline-flex min-h-[26px] w-fit shrink-0 items-center rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1 text-[0.72rem] font-medium leading-[1.2] text-[var(--ink-muted)]",
          enabled &&
            "border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success)]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function SettingsPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-[26px] w-fit shrink-0 items-center rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1 text-[0.72rem] font-medium leading-[1.2] text-[var(--ink-muted)]">
      {children}
    </span>
  );
}
