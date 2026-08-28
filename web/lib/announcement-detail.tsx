"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Button } from "@/components/ui/button";

import { COPY } from "@/lib/copy";
import { cn } from "@/lib/utils";

export interface AnnouncementData {
  title: string;
  date: string;
  summary: string;
  externalUrl: string | null;
}

export function Icon({
  name,
  className,
}: {
  name: "calendar" | "clock" | "pin" | "chevron" | "back" | "external";
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 24 24"
    >
      {name === "calendar" && (
        <>
          <rect {...common} x="3" y="5" width="18" height="16" rx="2" />
          <path {...common} d="M16 3v4M8 3v4M3 10h18" />
        </>
      )}
      {name === "clock" && (
        <>
          <circle {...common} cx="12" cy="12" r="9" />
          <path {...common} d="M12 7v5l3 2" />
        </>
      )}
      {name === "pin" && (
        <>
          <path
            {...common}
            d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"
          />
          <circle {...common} cx="12" cy="10" r="2.5" />
        </>
      )}
      {name === "chevron" && <path {...common} d="m9 18 6-6-6-6" />}
      {name === "back" && <path {...common} d="m15 18-6-6 6-6" />}
      {name === "external" && (
        <path
          {...common}
          d="M15 3h6v6M10 14 21 3M18 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h7"
        />
      )}
    </svg>
  );
}

const announcementDetailVariants = cva(
  "mx-auto w-full min-w-0 pb-8 text-[var(--ink)] max-[799px]:pb-6",
  {
    variants: {
      width: {
        content: "max-w-[680px]",
        wide: "max-w-[760px]",
      },
    },
    defaultVariants: {
      width: "content",
    },
  }
);

type AnnouncementDetailVariants = VariantProps<
  typeof announcementDetailVariants
>;

export interface AnnouncementDetailProps extends AnnouncementDetailVariants {
  announcement: AnnouncementData;
  onBack: () => void;
  backLabel?: string;
  className?: string;
}

export function AnnouncementDetail({
  announcement,
  onBack,
  backLabel = COPY.home.backHome,
  width,
  className,
}: AnnouncementDetailProps) {
  return (
    <div
      className={cn(announcementDetailVariants({ width, className }))}
      data-testid="announcement-detail"
    >
      {backLabel !== COPY.home.churchNews && (
        <div className="flex h-[72px] items-center font-semibold">
          <span>{COPY.home.churchNews}</span>
        </div>
      )}
      <div className="min-w-0 px-0 pb-5 pt-1.5">
        <Button
          type="button"
          variant="ghost"
          className="-ml-2 h-auto min-h-11 whitespace-normal rounded-[8px] px-2 font-semibold text-[var(--ink)] outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
          onClick={onBack}
          data-feed-back
        >
          <Icon name="back" className="size-5 shrink-0" />
          {backLabel}
        </Button>
        <time className="mt-3.5 inline-flex items-center font-mono text-[0.72rem] font-semibold tracking-[0.08em] text-[var(--ink-muted)]">
          {announcement.date}
        </time>
        <h1 className="mt-3.5 min-w-0 wrap-anywhere text-[clamp(1.6rem,5.5vw,2rem)] font-extrabold leading-[1.25] tracking-[-0.02em]">
          {announcement.title}
        </h1>
        <p className="mt-1 min-w-0 wrap-anywhere text-[0.9375rem] leading-[1.55] text-[var(--ink-muted)]">
          {announcement.summary}
        </p>
      </div>
      {/* ponytail: venueCard is intentionally shared until CMS exposes per-announcement venue data. */}
      <article className="min-w-0 rounded-[1.125rem] bg-[var(--surface-raised)] p-5 shadow-[0_1px_3px_color-mix(in_srgb,var(--ink)_6%,transparent)] max-[799px]:px-4">
        <h2 className="text-[1.08rem] font-semibold leading-[1.4]">
          {COPY.home.venueTitle}
        </h2>
        <p className="mt-2.5 min-w-0 wrap-anywhere leading-[1.7] text-[var(--ink-muted)]">
          {COPY.home.venueInstructions}
        </p>
        <ul className="mt-3.5 list-disc pl-5 leading-[1.7] text-[var(--ink-muted)]">
          <li className="min-w-0 wrap-anywhere">
            {COPY.home.worshipLocation}
          </li>
          <li className="min-w-0 wrap-anywhere">
            {COPY.home.familyRoom}
          </li>
          <li className="min-w-0 wrap-anywhere">
            {COPY.home.visitorReception}
          </li>
        </ul>
        {announcement.externalUrl && (
          <div className="mt-[18px] border-t border-[var(--line)] pt-4">
            <a
              href={announcement.externalUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-2 text-[0.8rem] text-[var(--ink-muted)] outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)] hover:underline"
              data-feed-external
            >
              <Icon name="external" className="size-5 shrink-0" />
              {COPY.home.externalLink}
            </a>
          </div>
        )}
      </article>
    </div>
  );
}

export { announcementDetailVariants };
