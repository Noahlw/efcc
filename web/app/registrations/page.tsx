"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { safeManagementReturnHref } from "@/app/management/management-action-framework";

const REGISTRATIONS_FALLBACK = "/management?module=approvals";

function registrationDestinationFromLocation(): string {
  return safeManagementReturnHref(
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("return"),
    REGISTRATIONS_FALLBACK
  );
}

const RegistrationsPendingView = ({ destination }: { destination: string }) => (
  <main
    className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-4 text-[var(--ink)]"
    aria-busy="true"
  >
    <section className="flex w-full max-w-[32rem] min-w-0 flex-col gap-4 rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-6">
      <h1 className="wrap-anywhere text-xl font-extrabold">
        正在前往註冊審批…
      </h1>
      <p className="wrap-anywhere text-[var(--ink-muted)]">
        如果頁面沒有自動轉換，請使用以下連結繼續。
      </p>
      <Link
        className="inline-flex min-h-11 w-fit items-center rounded-lg px-4 py-2 font-bold text-[var(--accent-deep)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)] motion-reduce:transition-none"
        href={destination}
      >
        前往註冊審批
      </Link>
    </section>
  </main>
);

const RegistrationsRedirect = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = safeManagementReturnHref(
    searchParams.get("return"),
    REGISTRATIONS_FALLBACK
  );

  useEffect(() => {
    router.replace(destination);
  }, [destination, router]);

  return <RegistrationsPendingView destination={destination} />;
};

const RegistrationsPage = () => (
  <Suspense
    fallback={
      <RegistrationsPendingView
        destination={registrationDestinationFromLocation()}
      />
    }
  >
    <RegistrationsRedirect />
  </Suspense>
);

export default RegistrationsPage;
