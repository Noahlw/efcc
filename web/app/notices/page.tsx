"use client";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { NoticesPanel } from "@/lib/notices-panel";

export default function NoticesPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[760px] min-w-0 px-[clamp(1rem,4vw,1.5rem)] pb-[calc(6rem+env(safe-area-inset-bottom,0px))] max-[799px]:pb-6">
        <header className="mb-7 border-b border-[var(--line)] pb-5 max-[799px]:mb-3 max-[799px]:flex max-[799px]:items-center max-[799px]:justify-between max-[799px]:gap-4 max-[799px]:pb-2">
          <h1 className="m-0 text-[clamp(1.75rem,5vw,2.25rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-[var(--ink)] max-[799px]:absolute max-[799px]:m-[-1px] max-[799px]:h-px max-[799px]:w-px max-[799px]:overflow-hidden max-[799px]:whitespace-nowrap max-[799px]:border-0 max-[799px]:p-0 max-[799px]:[clip:rect(0,0,0,0)]">
            {COPY.sections.notices}
          </h1>
          <p className="m-0 mt-2 text-base leading-[1.6] text-[var(--ink-muted)] max-[799px]:mt-0 max-[799px]:text-[0.78rem] max-[799px]:font-semibold max-[799px]:leading-[1.4]">
            {COPY.notices.noticesLead}
          </p>
        </header>
        <NoticesPanel />
      </div>
    </AppShell>
  );
}
