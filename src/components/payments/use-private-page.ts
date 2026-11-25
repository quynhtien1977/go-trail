"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { BookingClientError } from "@/lib/booking-client";
import { privateReadScope, type PrivateKind, type PrivatePage, type PrivatePageSource, type PrivateQuery } from "@/lib/payment-ui";

export type PrivatePhase = "auth-loading" | "sign-in" | "forbidden" | "unavailable" | "loading" | "error" | "ready";

export function usePrivatePage<T>(kind: PrivateKind, source: PrivatePageSource<T> | undefined, params: PrivateQuery) {
  const { data: session, status } = useSession();
  const scope = privateReadScope(kind, status, session?.user);
  const { page, filter, query } = params;
  const [revision, setRevision] = useState(0);
  const [context, setContext] = useState({ scope, source, epoch: 0 });
  const contextChanged = context.scope !== scope || context.source !== source;
  if (contextChanged) setContext({ scope, source, epoch: context.epoch + 1 });
  const requestKey = JSON.stringify([scope, page, filter, query, revision, context.epoch]);
  const [snapshot, setSnapshot] = useState<{
    key: string; source: PrivatePageSource<T>; data?: PrivatePage<T>; failure?: "sign-in" | "forbidden" | "error";
  } | null>(null);

  useEffect(() => {
    if (!scope || !source) return;
    const controller = new AbortController();
    async function read() {
      try {
        const data = await source!({ page, filter, query }, controller.signal);
        if (!Array.isArray(data.items) || !Number.isInteger(data.page) || data.page < 1 || !Number.isInteger(data.totalPages) || data.totalPages < 0 || !Number.isInteger(data.totalItems) || data.totalItems < 0) throw new Error("Invalid list presentation");
        if (!controller.signal.aborted) setSnapshot({ key: requestKey, source: source!, data });
      } catch (cause) {
        if (controller.signal.aborted) return;
        const failure = cause instanceof BookingClientError && cause.status === 401 ? "sign-in"
          : cause instanceof BookingClientError && [403, 404].includes(cause.status) ? "forbidden" : "error";
        setSnapshot({ key: requestKey, source: source!, failure });
      }
    }
    void read();
    return () => controller.abort();
  }, [scope, source, page, filter, query, requestKey]);

  let phase: PrivatePhase;
  if (status === "loading") phase = "auth-loading";
  else if (status !== "authenticated") phase = "sign-in";
  else if (!scope) phase = "forbidden";
  else if (!source) phase = "unavailable";
  else if (contextChanged || snapshot?.key !== requestKey || snapshot.source !== source) phase = "loading";
  else phase = snapshot.failure ?? "ready";
  return { phase, data: phase === "ready" ? snapshot?.data : undefined,
    identityKey: scope, refresh: () => setRevision(value => value + 1) };
}
