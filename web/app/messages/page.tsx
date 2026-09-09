"use client";

import { Suspense } from "react";

import { AppShell } from "@/lib/app-shell";
import { COPY } from "@/lib/copy";
import { FeedPresentation } from "@/lib/feed-presentation";
import { MessagesPanel } from "@/lib/messages-panel";

const MessagesPage = () => (
  <AppShell>
    <div className="mx-auto w-full max-w-[760px] min-w-0 px-[clamp(1rem,4vw,1.5rem)] pb-[calc(6rem+env(safe-area-inset-bottom,0px))] max-[799px]:pb-6">
      <Suspense
        fallback={
          <FeedPresentation
            state="loading"
            list={null}
            detail={null}
            loading={
              <output className="block p-4 text-[var(--ink-muted)] leading-[1.6]">
                {COPY.home.messagesLoading}
              </output>
            }
            error={null}
            empty={null}
            aria-label={COPY.home.messagesListLabel}
          />
        }
      >
        <MessagesPanel />
      </Suspense>
    </div>
  </AppShell>
);

export default MessagesPage;
