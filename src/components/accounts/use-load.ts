"use client";

import { useCallback, useEffect, useState } from "react";
import { AccountClientError } from "@/lib/customer-account-ui";

export type LoadState<T> =
  | { phase: "loading"; data?: T }
  | { phase: "ready"; data: T }
  | { phase: "error"; data?: T; code: string; status: number };

// Loads `loader` whenever `key` changes; keeps the previous data visible while reloading.
export function useLoad<T>(key: string | null, loader: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ phase: "loading" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    loader(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ phase: "ready", data }); },
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        const error = cause instanceof AccountClientError ? cause : new AccountClientError(0, "NETWORK_ERROR", "");
        setState((previous) => ({ phase: "error", data: previous.data, code: error.code, status: error.status }));
      });
    return () => controller.abort();
    // `loader` is re-created each render; `key` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);

  const reload = useCallback(() => {
    setState((previous) => ({ phase: "loading", data: previous.data }));
    setRevision((value) => value + 1);
  }, []);

  return { state, reload };
}
