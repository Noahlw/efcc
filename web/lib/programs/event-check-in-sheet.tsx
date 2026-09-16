"use client";

import { Download, Printer, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RpcError } from "@/lib/api";
import { COPY, errorMessage } from "@/lib/copy";
import { qrDataUrl } from "@/lib/qr";

import { ScreenCard } from "../screen-foundations";
import { getProgramAttendanceArtifact } from "./program-api";
import type { ProgramEvent } from "./program-api";
import { hkWallDateTimeLabel } from "./recurrence";

export type EventCheckInSheetEvent = Pick<
  ProgramEvent,
  | "event_id"
  | "program_id"
  | "program_name"
  | "name"
  | "starts_at"
  | "ends_at"
  | "location"
  | "manual_check_in_code"
>;

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

function escapeSvgText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function eventQrImage(
  event: EventCheckInSheetEvent,
  qr: string,
  manualCode: string
): string {
  const title = escapeSvgText(event.name?.trim() || event.program_name);
  const program = escapeSvgText(event.program_name);
  const time = escapeSvgText(hkWallDateTimeLabel(event.starts_at));
  const end = escapeSvgText(hkWallDateTimeLabel(event.ends_at));
  const location = event.location ? escapeSvgText(event.location) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1120" viewBox="0 0 900 1120" role="img" aria-labelledby="title desc"><title id="title">Event QR code</title><desc id="desc">${title} ${time} ${escapeSvgText(manualCode)}</desc><rect width="900" height="1120" fill="#fffdf8"/><text x="450" y="78" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="#263331">Event QR code</text><text x="450" y="140" text-anchor="middle" font-family="system-ui,sans-serif" font-size="42" font-weight="800" fill="#172021">${title}</text><text x="450" y="188" text-anchor="middle" font-family="system-ui,sans-serif" font-size="24" fill="#586a67">${program}</text><text x="450" y="232" text-anchor="middle" font-family="system-ui,sans-serif" font-size="23" fill="#586a67">${time} — ${end}</text>${location ? `<text x="450" y="272" text-anchor="middle" font-family="system-ui,sans-serif" font-size="23" fill="#586a67">${location}</text>` : ""}<rect x="180" y="310" width="540" height="540" rx="20" fill="#fff" stroke="#cbd6d2" stroke-width="4"/><image href="${qr}" x="200" y="330" width="500" height="500" preserveAspectRatio="xMidYMid meet"/><text x="450" y="902" text-anchor="middle" font-family="system-ui,sans-serif" font-size="24" fill="#586a67">${escapeSvgText(COPY.attendance.sheetManualCode)}</text><text x="450" y="970" text-anchor="middle" font-family="system-ui,sans-serif" font-size="54" font-weight="800" letter-spacing="8" fill="#172021">${escapeSvgText(manualCode)}</text><text x="450" y="1035" text-anchor="middle" font-family="system-ui,sans-serif" font-size="21" fill="#586a67">${escapeSvgText(COPY.attendance.sheetScanInstruction)}</text></svg>`;
}

function printEventSheet(
  event: EventCheckInSheetEvent,
  qr: string,
  manualCode: string
): boolean {
  const printWindow = window.open("", "_blank", "popup,width=640,height=720");
  if (!printWindow) {
    return false;
  }
  const doc = printWindow.document;
  doc.open();
  doc.write(
    "<!doctype html><html><head><title>Event QR code</title></head><body></body></html>"
  );
  const style = doc.createElement("style");
  style.textContent =
    "body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:32px;box-sizing:border-box;text-align:center}main{max-width:520px}img{display:block;width:min(100%,360px);height:auto;margin:24px auto}h1{font-size:32px;margin:0 0 12px}p{font-size:18px;line-height:1.5;margin:8px 0}strong{font-size:28px;letter-spacing:.15em}@media print{body{padding:0}}";
  doc.head.append(style);
  const main = doc.createElement("main");
  const title = doc.createElement("h1");
  title.textContent = event.name?.trim() || event.program_name;
  const program = doc.createElement("p");
  program.textContent = event.program_name;
  const time = doc.createElement("p");
  time.textContent = `${hkWallDateTimeLabel(event.starts_at)} — ${hkWallDateTimeLabel(event.ends_at)}`;
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
  main.append(title, program, time, image, instruction, codeLabel);
  doc.body.append(main);
  doc.close();
  printWindow.focus();
  printWindow.print();
  return true;
}

export const EventCheckInSheet = ({
  event,
  onClose,
  onAuthRequired,
}: EventCheckInSheetProps) => {
  const [qr, setQr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"download" | "print" | null>(
    null
  );
  const [actionBusy, setActionBusy] = useState<"download" | "print" | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  const loadArtifact = useCallback(
    async (isActive: () => boolean = () => true) => {
      setLoading(true);
      setLoadError(null);
      setActionError(null);
      setActionNotice(null);
      setQr(null);
      try {
        const { artifact } = await getProgramAttendanceArtifact(
          event.program_id
        );
        if (!isActive()) {
          return;
        }
        if (event.manual_check_in_code) {
          const dataUrl = await qrDataUrl(checkInUrl(artifact.check_in_token));
          if (isActive()) {
            setQr(dataUrl);
          }
        }
      } catch (error) {
        if (!isActive()) {
          return;
        }
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          onAuthRequired?.();
        }
        setLoadError(
          error instanceof RpcError
            ? errorMessage(error)
            : COPY.attendance.eventQrCodeGenerateError
        );
      } finally {
        if (isActive()) {
          setLoading(false);
        }
      }
    },
    [event.manual_check_in_code, event.program_id, onAuthRequired]
  );

  useEffect(() => {
    let active = true;
    void loadArtifact(() => active);
    return () => {
      active = false;
    };
  }, [loadArtifact]);

  function downloadQr() {
    setLastAction("download");
    setActionNotice(null);
    if (!qr || !event.manual_check_in_code) {
      setActionError(COPY.attendance.eventQrCodeDownloadError);
      return;
    }
    setActionBusy("download");
    try {
      const svg = eventQrImage(event, qr, event.manual_check_in_code);
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL
        ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
        : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      link.href = objectUrl;
      link.download = `${event.event_id}-event-qr-code.svg`;
      document.body.append(link);
      link.click();
      link.remove();
      if (objectUrl.startsWith("blob:") && URL.revokeObjectURL) {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
      setActionError(null);
      setActionNotice(COPY.attendance.eventQrCodeDownloadSuccess);
    } catch {
      setActionError(COPY.attendance.eventQrCodeDownloadError);
    } finally {
      setActionBusy(null);
    }
  }

  function printSheet() {
    setLastAction("print");
    setActionNotice(null);
    if (!qr || !event.manual_check_in_code) {
      setActionError(COPY.attendance.eventQrCodePrintError);
      return;
    }
    setActionBusy("print");
    try {
      if (!printEventSheet(event, qr, event.manual_check_in_code)) {
        throw new Error("print-window-blocked");
      }
      setActionError(null);
      setActionNotice(COPY.attendance.eventQrCodePrintSuccess);
    } catch {
      setActionError(COPY.attendance.eventQrCodePrintError);
    } finally {
      setActionBusy(null);
    }
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
        <Alert variant="destructive" className="grid gap-2">
          <span>{loadError}</span>
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => void loadArtifact()}
            disabled={loading}
          >
            {COPY.error.retry}
          </Button>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive" className="grid gap-2">
          <span>{actionError}</span>
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() =>
              lastAction === "print" ? printSheet() : downloadQr()
            }
            disabled={actionBusy !== null}
          >
            {COPY.error.retry}
          </Button>
        </Alert>
      )}
      {actionNotice && (
        <Alert tone="success" announcement="polite">
          {actionNotice}
        </Alert>
      )}
      {!event.manual_check_in_code && !loading && (
        <Alert variant="destructive">
          {COPY.attendance.eventCheckInSheetUnavailable}
        </Alert>
      )}
      {qr && event.manual_check_in_code && (
        <>
          <div className="grid min-w-0 gap-1 text-sm">
            <strong className="wrap-anywhere text-[var(--screen-muted)]">
              {COPY.attendance.eventQrCodeFacts}
            </strong>
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
            <Button
              type="button"
              variant="outline"
              onClick={downloadQr}
              disabled={actionBusy !== null}
            >
              <Download aria-hidden="true" />
              {COPY.attendance.eventCheckInSheetDownload}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void printSheet()}
              disabled={actionBusy !== null}
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
