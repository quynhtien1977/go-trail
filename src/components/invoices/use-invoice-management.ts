"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { BookingClientError } from "@/lib/booking-client";
import {
  invoiceManagementCapabilities,
  invoiceManagementReadScope,
  normalizeInvoiceManagementQuery,
  type InvoiceManagementPageResult,
  type InvoiceManagementQuery,
  type InvoiceManagementSource,
} from "@/lib/invoice-management-ui";

export type InvoiceManagementPhase =
  | "auth-loading"
  | "sign-in"
  | "forbidden"
  | "unavailable"
  | "loading"
  | "error"
  | "ready";

export function useInvoiceManagement(
  source: InvoiceManagementSource | undefined,
  rawQuery: Partial<InvoiceManagementQuery>,
) {
  const { data: session, status } = useSession();
  const role = session?.user?.role ?? null;
  const scope = invoiceManagementReadScope(status, session?.user);
  const capabilities = invoiceManagementCapabilities(role);
  const normalized = normalizeInvoiceManagementQuery(rawQuery, role);
  const {
    page,
    q,
    invoiceStatus,
    ticketStatus,
    checkInStatus,
    departureId,
    responsibleUserId,
  } = normalized;

  const [revision, setRevision] = useState(0);
  const [context, setContext] = useState({ scope, source, epoch: 0 });
  const contextChanged = context.scope !== scope || context.source !== source;
  if (contextChanged) {
    setContext({ scope, source, epoch: context.epoch + 1 });
  }

  const requestKey = JSON.stringify([
    scope,
    page,
    q,
    invoiceStatus,
    ticketStatus,
    checkInStatus,
    departureId,
    responsibleUserId,
    revision,
    context.epoch,
  ]);

  const [snapshot, setSnapshot] = useState<{
    key: string;
    source: InvoiceManagementSource;
    data?: InvoiceManagementPageResult;
    failure?: "sign-in" | "forbidden" | "error";
  } | null>(null);

  useEffect(() => {
    if (!scope || !source) return;
    const controller = new AbortController();

    async function load() {
      try {
        const result = await source!.readManagementPage(
          {
            page,
            q,
            invoiceStatus,
            ticketStatus,
            checkInStatus,
            departureId,
            responsibleUserId,
          },
          controller.signal,
        );
        if (
          !result ||
          !Array.isArray(result.invoices) ||
          !Array.isArray(result.tickets) ||
          !Array.isArray(result.departures) ||
          !Array.isArray(result.responsibleStaffOptions) ||
          !Number.isInteger(result.page) ||
          result.page < 1 ||
          !Number.isInteger(result.totalPages) ||
          result.totalPages < 0
        ) {
          throw new Error("Invalid M01 invoice management presentation payload");
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
  }, [
    scope,
    source,
    page,
    q,
    invoiceStatus,
    ticketStatus,
    checkInStatus,
    departureId,
    responsibleUserId,
    requestKey,
  ]);

  let phase: InvoiceManagementPhase;
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
    role,
    identityKey: scope,
    normalizedQuery: normalized,
    refresh: () => setRevision((value) => value + 1),
  };
}
