"use client";

import { useCallback, useEffect, useState } from "react";
import type { ManifestDto, ManifestPassengerDto } from "@/schemas/checkin";
import { LeaderClientError, applyPassengerUpdate, leaderClient } from "@/lib/leader-ui";

export type ManifestState =
  | { phase: "loading"; data?: ManifestDto }
  | { phase: "ready"; data: ManifestDto }
  | { phase: "error"; data?: ManifestDto; code: string; status: number };

// Loads one departure's manifest; keeps the last good data visible while reloading.
export function useManifest(departureId: number) {
  const [state, setState] = useState<ManifestState>({ phase: "loading" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    leaderClient.readManifest(departureId, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ phase: "ready", data }); },
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        const error = cause instanceof LeaderClientError ? cause : new LeaderClientError(0, "NETWORK_ERROR", "");
        setState((previous) => ({ phase: "error", data: previous.data, code: error.code, status: error.status }));
      });
    return () => controller.abort();
  }, [departureId, revision]);

  // Coming back to the tab (e.g. after scanning on another screen) shows fresh counts.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") setRevision((value) => value + 1); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const reload = useCallback(() => {
    setState((previous) => ({ phase: "loading", data: previous.data }));
    setRevision((value) => value + 1);
  }, []);

  const applyUpdate = useCallback((passenger: ManifestPassengerDto) => {
    setState((previous) => (previous.data ? { ...previous, data: applyPassengerUpdate(previous.data, passenger) } as ManifestState : previous));
  }, []);

  return { state, reload, applyUpdate };
}
