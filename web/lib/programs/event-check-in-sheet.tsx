"use client";

import { Download, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RpcError } from "@/lib/api";
import { COPY, errorMessage } from "@/lib/copy";
import { qrDataUrl } from "@/lib/qr";

import { buildCheckInSheet } from "../check-in-sheet";
import { ScreenCard } from "../screen-foundations";
import { getProgramAttendanceArtifact, type ProgramEvent } from "./program-api";
import { hkWallDateTimeLabel } from "./recurrence";

export interface EventCheckInSheetEvent extends Pick<
  ProgramEvent,
  | "event_id"
  | "program_id"
  | "program_name"
  | "name"
  | "starts_at"
  | "ends_at"
  | "location"
  | "manual_check_in_code"
> {}

export interface EventCheckInSheetProps {
  event: EventCheckInSheetEvent;
  onClose?: () => void;
  onAuthRequired?: () => void;
}

function checkInUrl(token: string): string {
  const path = `/guest-check-in?program_token=${encodeURIComponent(token)}`;
  return typeof window === "undefined"
    ? path
    : `${window.location.origin}${path}`;
}

function printEventSheet(
  event: EventCheckInSheetEvent,
  qr: string,
  manualCode: string
) {
  const printWindow = window.open("", "_blank", "popup,width=640,height=720");
  if (!printWindow) {
    return;
  }
  const doc = printWindow.document;
  doc.open();
  doc.write(
    "<!doctype html><html><head><title>EFCC Event Check-In Sheet</title></head><body></body></html>"
  );
  const style = doc.createElement("style");
  style.textContent =
    "body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:32px;box-sizing:border-box;text-align:center}main{max-width:520px}img{display:block;width:min(100%,360px);height:auto;margin:24px auto}h1{font-size:32px;margin:0 0 12px}p{font-size:18px;line-height:1.5;margin:8px 0}strong{font-size:28px;letter-spacing:.15em}@media print{body{padding:0}}";
  doc.head.append(style);
  const main = doc.createElement("main");
  const title = doc.createElement("h1");
  title.textContent = event.name?.trim() || event.program_name;
  const time = doc.createElement("p");
  time.textContent = hkWallDateTimeLabel(event.starts_at);
  if (event.location) {
    time.append(` · ${event.location}`);
  }
  const image = doc.createElement("img");
  image.src = qr;
  image.alt = COPY.attendance.sheetMethod;
  const instruction = doc.createElement("p");
  instruction.textContent = COPY.attendance.sheetScanInstruction;
  const codeLabel = doc.createElement("p");
  codeLabel.textContent = COPY.attendance.sheetManualCode;
  const code = doc.createElement("strong");
  code.textContent = manualCode;
  codeLabel.append(code);
  main.append(title, time, image, instruction, codeLabel);
  doc.body.append(main);
  doc.close();
  printWindow.focus();
  printWindow.print();
}

export const EventCheckInSheet = ({
  event,
  onClose,
  onAuthRequired,
}: EventCheckInSheetProps) => {
  const [token, setToken] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setToken(null);
    void getProgramAttendanceArtifact(event.program_id)
      .then(({ artifact }) => {
        if (active) {
          setToken(artifact.check_in_token);
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          onAuthRequired?.();
        }
        setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [event.program_id, onAuthRequired]);

  useEffect(() => {
    if (!token || !event.manual_check_in_code) {
      setQr(null);
      return;
    }
    let active = true;
    void qrDataUrl(checkInUrl(token))
      .then((dataUrl) => {
        if (active) {
          setQr(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setQr(null);
        }
      });
    return () => {
      active = false;
    };
  }, [event.manual_check_in_code, token]);

  function downloadQr() {
    if (!qr) {
      return;
    }
    const link = document.createElement("a");
    link.href = qr;
    link.download = `${event.event_id}-check-in-qr.svg`;
    link.click();
  }

  async function printSheet() {
    if (!qr || !event.manual_check_in_code) {
      return;
    }
    const sheet = await buildCheckInSheet({
      programName: event.name?.trim() || event.program_name,
      startsAtLabel: hkWallDateTimeLabel(event.starts_at),
      checkInUrl: checkInUrl(token ?? ""),
      manualCode: event.manual_check_in_code,
      renderQr: qrDataUrl,
    });
    printEventSheet(event, sheet.qrDataUrl, sheet.manualCode);
  }

  return (
    <ScreenCard
      className="grid min-w-0 gap-3"
      data-testid="event-check-in-sheet"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="m-0 wrap-anywhere text-lg font-extrabold">
            {COPY.attendance.eventCheckInSheetTitle}
          </h2>
          <p className="m-0 wrap-anywhere text-sm leading-6 text-[var(--screen-muted)]">
            {COPY.attendance.eventCheckInSheetLead}
          </p>
        </div>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={COPY.attendance.eventCheckInSheetClose}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      {loading && (
        <output
          className="text-sm text-[var(--screen-muted)]"
          aria-live="polite"
        >
          {COPY.attendance.eventCheckInSheetLoading}
        </output>
      )}
      {loadError && !loading && (
        <Alert variant="destructive">{loadError}</Alert>
      )}
      {!event.manual_check_in_code && !loading && (
        <Alert variant="destructive">
          {COPY.attendance.eventCheckInSheetUnavailable}
        </Alert>
      )}
      {qr && event.manual_check_in_code && (
        <>
          <div className="grid min-w-0 gap-1 text-sm">
            <strong className="wrap-anywhere">
              {event.name?.trim() || event.program_name}
            </strong>
            <span className="wrap-anywhere text-[var(--screen-muted)]">
              {hkWallDateTimeLabel(event.starts_at)} —{" "}
              {hkWallDateTimeLabel(event.ends_at)}
              {event.location ? ` · ${event.location}` : ""}
            </span>
          </div>
          <img
            src={qr}
            alt={COPY.attendance.eventCheckInSheetQrLabel}
            className="mx-auto size-56 max-w-full rounded border border-[var(--screen-line)] bg-white p-2"
          />
          <p className="m-0 grid gap-1 text-center text-sm">
            <span>{COPY.attendance.sheetManualCode}</span>
            <strong className="text-xl tracking-[0.15em]">
              {event.manual_check_in_code}
            </strong>
          </p>
          <div className="flex min-w-0 flex-wrap gap-[var(--screen-utility-gap)]">
            <Button type="button" variant="outline" onClick={downloadQr}>
              <Download aria-hidden="true" />
              {COPY.attendance.eventCheckInSheetDownload}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void printSheet()}
            >
              <Printer aria-hidden="true" />
              {COPY.attendance.eventCheckInSheetPrint}
            </Button>
          </div>
        </>
      )}
    </ScreenCard>
  );
};
EventCheckInSheet.displayName = "EventCheckInSheet";
