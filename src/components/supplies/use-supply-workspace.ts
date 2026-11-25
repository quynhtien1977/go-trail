"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { BookingClientError } from "@/lib/booking-client";
import {
  supplyReadScope,
  supplyRoleCapabilities,
  type SupplyWorkspaceQuery,
  type SupplyWorkspaceSnapshot,
  type SupplyWorkspaceSource,
} from "@/lib/supply-ui";

export type SupplyWorkspacePhase =
  | "auth-loading"
  | "sign-in"
  | "forbidden"
  | "unavailable"
  | "loading"
  | "error"
  | "ready";

export function useSupplyWorkspace(
  portal: "staff" | "leader",
  source: SupplyWorkspaceSource | null | undefined,
  query: SupplyWorkspaceQuery,
) {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const scope = supplyReadScope(portal, status, session?.user);
  const capabilities = supplyRoleCapabilities(role);
  const { departureId = null, category = "all" } = query;

  const [revision, setRevision] = useState(0);
  const [context, setContext] = useState({ scope, source, epoch: 0 });
  const contextChanged = context.scope !== scope || context.source !== source;
  if (contextChanged) {
    setContext({ scope, source, epoch: context.epoch + 1 });
  }

  const requestKey = JSON.stringify([scope, departureId, category, revision, context.epoch]);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    source: SupplyWorkspaceSource;
    data?: SupplyWorkspaceSnapshot;
    failure?: "sign-in" | "forbidden" | "error";
  } | null>(null);

  useEffect(() => {
    if (!scope || !source) return;
    const controller = new AbortController();

    async function load() {
      try {
        const result = await source!.readWorkspace(
          { departureId, category },
          controller.signal,
        );
        if (
          !result ||
          !Array.isArray(result.catalog) ||
          !Array.isArray(result.ledger) ||
          !Array.isArray(result.departures) ||
          !Array.isArray(result.allocations)
        ) {
          throw new Error("Invalid supply workspace snapshot");
        }
        if (!controller.signal.aborted) {
          setSnapshot({ key: requestKey, source: source!, data: result });
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        const failure =
          cause instanceof BookingClientError && cause.status === 401
            ? "sign-in"
            : cause instanceof BookingClientError && (cause.status === 403 || cause.status === 404)
              ? "forbidden"
              : "error";
        setSnapshot({ key: requestKey, source: source!, failure });
      }
    }

    void load();
    return () => controller.abort();
  }, [scope, source, departureId, category, requestKey]);

  let phase: SupplyWorkspacePhase;
  if (status === "loading") phase = "auth-loading";
  else if (status !== "authenticated") phase = "sign-in";
  else if (!scope) phase = "forbidden";
  else if (!source) phase = "unavailable";
  else if (contextChanged || snapshot?.key !== requestKey || snapshot.source !== source) phase = "loading";
  else phase = snapshot.failure ?? "ready";

  return {
    phase,
    data: phase === "ready" ? snapshot?.data : undefined,
    capabilities,
    role: role ?? null,
    identityKey: scope,
    refresh: () => setRevision((value) => value + 1),
  };
}
