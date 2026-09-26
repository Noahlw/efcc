"use client";

import { useEffect, useState } from "react";

// Single polite live region per Spec 074 (one `role="status"` region for
// all async feedback). Shell components call `announce()` when async
// status changes (loading, success, error); the region renders the latest
// message for screen readers without affecting visible layout.
let currentMessage = "";
const listeners = new Set<() => void>();

export function announce(message: string) {
  currentMessage = message;
  for (const listener of listeners) {
    listener();
  }
}

export function LiveRegion() {
  const [message, setMessage] = useState(currentMessage);

  useEffect(() => {
    const listener = () => setMessage(currentMessage);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    // Spec 074 mandates the explicit role on the single polite live
    // region; jsx-a11y considers it redundant on <output>.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <output role="status" aria-live="polite" className="sr-only">
      {message}
    </output>
  );
}
