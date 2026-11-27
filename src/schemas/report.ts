import { z } from "zod";
import { AppError } from "@/server/errors";

const id = z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).pipe(z.number().max(2147483647));
// Local midnight on 0001-01-01 falls in year 0000 UTC, which PostgreSQL cannot parse.
const reportDate = z.iso.date().refine(value => value >= "0001-01-02");
export const reportFilters = z.strictObject({
  from_date: reportDate,
  to_date: reportDate,
  trip_id: id.optional(),
  departure_id: id.optional(),
});
const revenueQuery = reportFilters.extend({ group_by: z.enum(["day", "trip", "departure"]).default("day") });
export type ReportPeriod = { start: Date; end: Date; tripId?: number; departureId?: number };
export function parseReport(input: unknown, revenue: boolean) {
  const parsed = (revenue ? revenueQuery : reportFilters).safeParse(input);
  if (!parsed.success) throw new AppError("INVALID_INPUT", 422);
  const data = parsed.data;
  const group = "group_by" in data ? data.group_by as "day" | "trip" | "departure" : "day";
  return { period: reportPeriod(data), group };
}
export function reportPeriod(data: z.infer<typeof reportFilters>): ReportPeriod {
  if (data.from_date > data.to_date) throw new AppError("INVALID_INPUT", 422);
  const start = new Date(data.from_date + "T00:00:00+07:00");
  const end = new Date(new Date(data.to_date + "T00:00:00+07:00").getTime() + 86400000);
  return { start, end, tripId: data.trip_id, departureId: data.departure_id };
}
