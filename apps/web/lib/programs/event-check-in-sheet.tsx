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
import { clearAuthenticatedProgramsRecovery } from "./workspace-context";

type EventCheckInSheetEvent = Pick<
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

function wrapSvgText(value: string, maxCharacters: number): string[] {
  const characters = [...value];
  if (characters.length === 0) {
    return [""];
  }
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += maxCharacters) {
    lines.push(characters.slice(index, index + maxCharacters).join(""));
  }
  return lines;
}

function centeredSvgText(
  value: string,
  y: number,
  fontSize: number,
  maxCharacters: number,
  lineHeight: number,
  fill: string,
  fontWeight?: number
): string {
  const weight = fontWeight ? ` font-weight="${fontWeight}"` : "";
  const lines = wrapSvgText(value, maxCharacters);
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="450" dy="${index === 0 ? 0 : lineHeight}">${escapeSvgText(line)}</tspan>`
    )
    .join("");
  return `<text x="450" y="${y}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fontSize}"${weight} fill="${fill}">${tspans}</text>`;
}

function eventQrImage(
  event: EventCheckInSheetEvent,
  qr: string,
  manualCode: string
): string {
  const title = event.name?.trim() || event.program_name;
  const program = event.program_name;
  const timeRange = `${hkWallDateTimeLabel(event.starts_at)} — ${hkWallDateTimeLabel(event.ends_at)}`;
  const location = event.location?.trim() || null;
  const titleLines = wrapSvgText(title, 18);
  const programLines = wrapSvgText(program, 24);
  const timeLines = wrapSvgText(timeRange, 26);
  const locationLines = location ? wrapSvgText(location, 24) : [];
  let nextY = 140;
  const titleBlock = centeredSvgText(title, nextY, 42, 18, 52, "#172021", 800);
  nextY += titleLines.length * 52 + 20;
  const programBlock = centeredSvgText(program, nextY, 24, 24, 30, "#586a67");
  nextY += programLines.length * 30 + 16;
  const timeBlock = centeredSvgText(timeRange, nextY, 23, 26, 28, "#586a67");
  nextY += timeLines.length * 28 + 16;
  const locationBlock = location
    ? centeredSvgText(location, nextY, 23, 24, 28, "#586a67")
    : "";
  nextY += locationLines.length * 28;
  const qrTop = Math.max(310, nextY + 20);
  const codeLabelY = qrTop + 592;
  const codeY = qrTop + 660;
  const instructionY = qrTop + 725;
  const height = instructionY + 55;
  const desc = escapeSvgText(
    [title, program, timeRange, location, manualCode]
      .filter((value): value is string => Boolean(value))
      .join(" ")
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}" role="img" aria-labelledby="title desc"><title id="title">Event QR code</title><desc id="desc">${desc}</desc><rect width="900" height="${height}" fill="#fffdf8"/><text x="450" y="78" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="#263331">Event QR code</text>${titleBlock}${programBlock}${timeBlock}${locationBlock}<rect x="180" y="${qrTop}" width="540" height="540" rx="20" fill="#fff" stroke="#cbd6d2" stroke-width="4"/><image href="${qr}" x="200" y="${qrTop + 20}" width="500" height="500" preserveAspectRatio="xMidYMid meet"/><text x="450" y="${codeLabelY}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="24" fill="#586a67">${escapeSvgText(COPY.attendance.sheetManualCode)}</text><text x="450" y="${codeY}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="54" font-weight="800" letter-spacing="8" fill="#172021">${escapeSvgText(manualCode)}</text><text x="450" y="${instructionY}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="21" fill="#586a67">${escapeSvgText(COPY.attendance.sheetScanInstruction)}</text></svg>`;
}

const PRINT_IMAGE_TIMEOUT_MS = 5000;

function waitForPrintImage(image: HTMLImageElement): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- DOM load/error/timeout events need one settling promise.
  return new Promise((resolve, reject) => {
    const state = { settled: false, timeoutId: 0 };
    const callbacks: {
      cleanup?: () => void;
      settle?: (error?: Error) => void;
    } = {};
    const onLoad = async () => {
      if (typeof image.decode !== "function") {
        callbacks.settle?.();
        return;
      }
      try {
        await image.decode();
        callbacks.settle?.();
      } catch {
        callbacks.settle?.(new Error("print-image-decode-failed"));
      }
    };
    const onError = () => {
      callbacks.settle?.(new Error("print-image-load-failed"));
    };
    callbacks.cleanup = () => {
      if (state.timeoutId) {
        window.clearTimeout(state.timeoutId);
      }
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };
    callbacks.settle = (error?: Error) => {
      if (state.settled) {
        return;
      }
      state.settled = true;
      callbacks.cleanup?.();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
    state.timeoutId = window.setTimeout(
      () => callbacks.settle?.(new Error("print-image-timeout")),
      PRINT_IMAGE_TIMEOUT_MS
    );
  });
}

async function printEventSheet(
  event: EventCheckInSheetEvent,
  qr: string,
  manualCode: string
): Promise<boolean> {
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
  try {
    const imageReady = waitForPrintImage(image);
    image.src = qr;
    await imageReady;
    printWindow.focus();
    printWindow.print();
    return true;
  } catch {
    printWindow.close?.();
    return false;
  }
}

export const EventCheckInSheet = ({
  event,
  onClose,
  onAuthRequired,
}: EventCheckInSheetProps) => {
  const [qr, setQr] = useState<string | null>(null);
  const [qrImageState, setQrImageState] = useState<
    "loading" | "ready" | "error"
  >("loading");
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
      setQrImageState("loading");
      if (!event.manual_check_in_code) {
        setLoading(false);
        return;
      }
      try {
        const { artifact } = await getProgramAttendanceArtifact(
          event.program_id
        );
        if (!isActive()) {
          return;
        }
        const dataUrl = await qrDataUrl(checkInUrl(artifact.check_in_token));
        if (isActive()) {
          setQr(dataUrl);
          setQrImageState("loading");
        }
      } catch (error) {
        if (!isActive()) {
          return;
        }
        if (
          error instanceof RpcError &&
          error.problem.code === "AUTH_REQUIRED"
        ) {
          clearAuthenticatedProgramsRecovery();
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
    if (!qr || !event.manual_check_in_code || qrImageState !== "ready") {
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
      // Browsers do not expose download-manager completion to page code. Keep
      // the notice honest: this confirms the request was sent, not that the
      // user has saved the file.
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

  async function printSheet() {
    setLastAction("print");
    setActionNotice(null);
    if (!qr || !event.manual_check_in_code || qrImageState !== "ready") {
      setActionError(COPY.attendance.eventQrCodePrintError);
      return;
    }
    setActionBusy("print");
    try {
      if (!(await printEventSheet(event, qr, event.manual_check_in_code))) {
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
              void (lastAction === "print" ? printSheet() : downloadQr())
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
        <Alert variant="destructive" className="grid gap-2">
          <span>{COPY.attendance.eventCheckInSheetUnavailable}</span>
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
          {qrImageState === "loading" && (
            <output
              className="text-sm text-[var(--screen-muted)]"
              aria-live="polite"
              data-testid="event-qr-image-loading"
            >
              {COPY.attendance.eventCheckInSheetLoading}
            </output>
          )}
          {qrImageState === "ready" && (
            <output
              className="text-sm text-[var(--screen-success)]"
              aria-live="polite"
              data-testid="event-qr-image-ready"
            >
              {COPY.attendance.eventQrCodeReady}
            </output>
          )}
          <img
            src={qr}
            alt={COPY.attendance.eventCheckInSheetQrLabel}
            className="mx-auto size-56 max-w-full rounded border border-[var(--screen-line)] bg-white p-2"
            data-qr-state={qrImageState}
            onError={() => {
              setQrImageState("error");
              setLoadError(COPY.attendance.eventQrCodeImageError);
              setActionError(null);
            }}
            onLoad={() => {
              setQrImageState("ready");
              setLoadError(null);
            }}
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
              disabled={actionBusy !== null || qrImageState !== "ready"}
            >
              <Download aria-hidden="true" />
              {COPY.attendance.eventCheckInSheetDownload}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void printSheet()}
              disabled={actionBusy !== null || qrImageState !== "ready"}
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
