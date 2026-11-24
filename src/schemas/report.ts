import { z } from "zod";
import { AppError } from "@/server/errors";

const id = z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).pipe(z.number().max(2147483647));
export const reportFilters = z.strictObject({
  from_date: z.iso.date(),
  to_date: z.iso.date(),
  trip_id: id.optional(),
  departure_id: id.optional(),
});
const revenueQuery = reportFilters.extend({ group_by: z.enum(["day", "trip", "departure"]).default("day") });
export type ReportPeriod = { start: Date; end: Date; tripId?: number; departureId?: number };
export function parseReport(input: unknown, revenue: boolean) {
  const parsed = (revenue ? revenueQuery : reportFilters).safeParse(input);
  if (!parsed.success || parsed.data.from_date > parsed.data.to_date) throw new AppError("INVALID_INPUT", 422);
  const data = parsed.data;
  const start = new Date(data.from_date + "T00:00:00+07:00");
  const end = new Date(new Date(data.to_date + "T00:00:00+07:00").getTime() + 86400000);
  const group = "group_by" in data ? data.group_by as "day" | "trip" | "departure" : "day";
  return { period: { start, end, tripId: data.trip_id, departureId: data.departure_id }, group };
}
