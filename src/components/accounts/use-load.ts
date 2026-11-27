"use client";

import { useCallback, useEffect, useState } from "react";
import { AccountClientError } from "@/lib/customer-account-ui";

export type LoadState<T> =
  | { phase: "loading"; data?: T }
  | { phase: "ready"; data: T }
  | { phase: "error"; data?: T; code: string; status: number };

// A result belongs to one identity/query/revision only; never show stale private data for a new request.
export function useLoad<T>(key: string | null, loader: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [context, setContext] = useState({ key, epoch: 0 });
  const contextChanged = context.key !== key;
  if (contextChanged) setContext({ key, epoch: context.epoch + 1 });
  const requestKey = JSON.stringify([key, revision, context.epoch]);
  const [snapshot, setSnapshot] = useState<{ key: string; state: LoadState<T> } | null>(null);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    loader(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setSnapshot({ key: requestKey, state: { phase: "ready", data } }); },
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        const error = cause instanceof AccountClientError ? cause : new AccountClientError(0, "NETWORK_ERROR", "");
        setSnapshot({ key: requestKey, state: { phase: "error", code: error.code, status: error.status } });
      });
    return () => controller.abort();
    // `loader` is re-created each render; `key` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, requestKey]);

  const reload = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const state: LoadState<T> = key !== null && !contextChanged && snapshot?.key === requestKey ? snapshot.state : { phase: "loading" };
  return { state, reload };
}
