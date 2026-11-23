import { z } from "zod";

// L01 (SCRUM-37): Leader manifest and QR check-in (PRD 3.3, 5.4).
const id = z.number().int().positive().max(2147483647);
// The QR payload is the ticket_code issued by P02 (uppercase). Scanners and typed entry may add whitespace or lowercase.
const ticketCode = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).transform((code) => code.toUpperCase());

// The Leader always acts inside one departure, so a ticket of another departure is reported, never checked in.
// A QR scan is the only way to CheckedIn; Absent is marked from the manifest row, since an absent passenger has no QR to show.
export const checkInSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("CheckIn"), departure_id: id, ticket_code: ticketCode }),
  z.strictObject({ action: z.literal("MarkAbsent"), departure_id: id, detail_id: id }),
]);
export type CheckInInput = z.infer<typeof checkInSchema>;

// Minimum passenger data for running the day (PRD 3.3): no ticket_code, invoice, payment, email or health data.
export type ManifestPassengerDto = {
  detail_id: number;
  seat_name: string;
  passenger_name: string;
  passenger_phone: string;
  emergency_contact: string;
  pickup: { dep_pickup_id: number; name: string; address: string; pickup_time: string };
  // Seat names repeat across buses, so a multi-vehicle departure needs the bus of each seat.
  vehicle: { dep_vehicle_id: number; plate_number: string };
  check_in_status: "Pending" | "CheckedIn" | "Absent";
  // UTC ISO time of the successful scan; null while Pending or Absent.
  check_in_time: string | null;
};

export type ManifestCrewDto = {
  role_in_trip: "Driver" | "Assistant";
  full_name: string;
  phone: string;
  vehicle: { dep_vehicle_id: number; plate_number: string };
};

export type ManifestDto = {
  departure: {
    departure_id: number;
    trip_name: string;
    departure_date: string;
    status: "Confirmed" | "Running" | "Ended";
    // False once the departure has Ended: the manifest stays readable but check-in and Absent are closed.
    check_in_open: boolean;
  };
  summary: { total: number; checked_in: number; absent: number; pending: number };
  // PRD 3.3: the Leader sees the phone numbers of the drivers and assistants of the same departure.
  // Assignment APIs shared with HRMgr/RouteMgr return names only, so the phones live here.
  crew: ManifestCrewDto[];
  passengers: ManifestPassengerDto[];
  server_time: string;
};

// A repeated scan or mark is a stable success that reports the stored state; `changed` is false and the time is the first one.
export type CheckInResultDto = {
  result: "CheckedIn" | "AlreadyCheckedIn" | "MarkedAbsent" | "AlreadyAbsent";
  changed: boolean;
  passenger: ManifestPassengerDto;
};
