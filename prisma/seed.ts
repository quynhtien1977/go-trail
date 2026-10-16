import { loadEnvConfig } from "@next/env";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import { PrismaClient, Prisma, UserRole, StaffType, DepartureStatus } from "../src/generated/prisma/client";
import { assertCatalogTarget, CatalogValidationError, readReviewedCatalog } from "./catalog";
import { importCatalogRows, type CatalogQuery } from "./catalog-importer";
import { existsSync } from "node:fs";
import { importMediaRows, readResolvedMedia } from "./trip-media";

loadEnvConfig(process.cwd());

class SeedValidationError extends Error {}

async function main() {
  if (process.env.NODE_ENV === "production") throw new SeedValidationError("Demo seeding is disabled in production.");
  const connectionString = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  const password = process.env.SEED_PASSWORD;
  if (!connectionString) throw new SeedValidationError("DIRECT_URL or DATABASE_URL is required.");
  assertCatalogTarget(connectionString);
  if (!password || password.length < 16 || Buffer.byteLength(password, "utf8") > 72) {
    throw new SeedValidationError("Set a development SEED_PASSWORD of at least 16 characters and at most 72 UTF-8 bytes.");
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1, connectionTimeoutMillis: 10000 }) });
  try {
    const catalog = await readReviewedCatalog();
    const media = existsSync(new URL("../data/reference/gotrail/media.json", import.meta.url)) ? await readResolvedMedia() : [];
    const passwordHash = await hash(password, 12);
    await db.$transaction(async (tx) => {
      // Prevent concurrent seed runs from duplicating demo rows without natural unique keys.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(717001)::text`;
      const query: CatalogQuery = <T>(sql: string, parameters: unknown[] = []) => tx.$queryRawUnsafe<T[]>(sql, ...parameters);
      await importCatalogRows(query, catalog);
      if (media.length) await importMediaRows(query, media);
      const users = new Map<UserRole, number>();
      for (const [index, role] of Object.values(UserRole).entries()) {
        const email = `${role.toLowerCase()}@go-trail.example.test`;
        const user = await tx.user.upsert({
          where: { email }, update: {},
          create: { email, password_hash: passwordHash, full_name: `Demo ${role}`, phone: `000000000${index}`, role },
        });
        if (user.role !== role) throw new SeedValidationError("A demo email belongs to a different role; seed stopped.");
        users.set(role, user.user_id);
      }
      const leader = await tx.staff.upsert({
        where: { user_id: users.get(UserRole.Leader)! }, update: {},
        create: { user_id: users.get(UserRole.Leader)!, full_name: "Demo Leader", phone: "0000000001", staff_type: StaffType.Leader },
      });
      const crew = [leader];
      for (const [staff_type, phone] of [[StaffType.Driver, "0000000010"], [StaffType.Assistant, "0000000011"]] as const) {
        const existing = await tx.staff.findFirst({ where: { staff_type, phone, full_name: `Demo ${staff_type}` } });
        const staff = await tx.staff.upsert({
          where: { staff_id: existing?.staff_id ?? -1 }, update: {},
          create: {
            full_name: `Demo ${staff_type}`, phone, staff_type,
            ...(staff_type === StaffType.Driver ? {
              license_number: "DEMO-NOT-A-REAL-LICENSE", license_class: "D",
              license_expiry: new Date("2031-12-31T00:00:00Z"),
            } : {}),
          },
        });
        crew.push(staff);
      }
      const vehicle = await tx.vehicle.upsert({
        where: { plate_number: "DEMO-GO-TRAIL-01" }, update: {},
        create: { plate_number: "DEMO-GO-TRAIL-01", vehicle_type: "Demo bus", seat_count: 16 },
      });
      const seats = [];
      for (let index = 0; index < 16; index++) {
        const seat_name = `${index < 8 ? "A" : "B"}${index % 8 + 1}`;
        seats.push(await tx.vehicleSeat.upsert({
          where: { vehicle_id_seat_name: { vehicle_id: vehicle.vehicle_id, seat_name } }, update: {},
          create: { vehicle_id: vehicle.vehicle_id, seat_name, floor_level: 1, x_position: index < 8 ? 0 : 2, y_position: index % 8 },
        }));
      }
      const demoSourceUrls = ["https://gotrail.vn/bus/trail-bus-ba-den/", "https://gotrail.vn/bus/bus-trail-chua-chan/"];
      for (const [index, source_url] of demoSourceUrls.entries()) {
        const trip = await tx.trip.findUniqueOrThrow({ where: { source_url } });
        const pickups = await tx.pickupPoint.findMany({ where: { trip_id: trip.trip_id, is_active: true }, orderBy: { pickup_id: "asc" } });
        const scenarios = index === 0
          ? [{ date: "2030-01-05T22:00:00Z", status: DepartureStatus.Draft }, { date: "2030-01-12T22:00:00Z", status: DepartureStatus.Open }]
          : [{ date: "2030-01-19T22:00:00Z", status: DepartureStatus.Closed }];
        for (const scenario of scenarios) {
          const departure_date = new Date(scenario.date);
          const existing = await tx.departure.findFirst({ where: { trip_id: trip.trip_id, departure_date, is_demo: true } });
          const departure = await tx.departure.upsert({
            where: { departure_id: existing?.departure_id ?? -1 }, update: {},
            create: { trip_id: trip.trip_id, departure_date, is_demo: true, min_passengers: 6, booking_deadline: new Date(scenario.status === DepartureStatus.Closed ? Date.now() - 86400000 : departure_date.getTime() - 86400000), status: scenario.status },
          });
          for (const [pickupIndex, pickup] of pickups.entries()) {
            await tx.departurePickup.upsert({
              where: { departure_id_pickup_id: { departure_id: departure.departure_id, pickup_id: pickup.pickup_id } }, update: {},
              create: { departure_id: departure.departure_id, pickup_id: pickup.pickup_id, pickup_time: new Date(departure_date.getTime() + pickupIndex * 1800000) },
            });
          }
          // Draft remains unassigned; Open/Closed have the complete seat snapshot and crew.
          if (scenario.status === DepartureStatus.Draft) continue;
          const assignment = await tx.departureVehicle.upsert({
            where: { departure_id_vehicle_id: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id } }, update: {},
            create: { departure_id: departure.departure_id, vehicle_id: vehicle.vehicle_id },
          });
          for (const seat of seats) {
            await tx.departureSeat.upsert({
              where: { dep_vehicle_id_seat_id: { dep_vehicle_id: assignment.dep_vehicle_id, seat_id: seat.seat_id } }, update: {},
              create: { dep_vehicle_id: assignment.dep_vehicle_id, seat_id: seat.seat_id },
            });
          }
          for (const staff of crew) {
            await tx.departureStaff.upsert({
              where: { departure_id_staff_id_role_in_trip: { departure_id: departure.departure_id, staff_id: staff.staff_id, role_in_trip: staff.staff_type } }, update: {},
              create: { departure_id: departure.departure_id, staff_id: staff.staff_id, role_in_trip: staff.staff_type, dep_vehicle_id: assignment.dep_vehicle_id },
            });
          }
        }
      }
      for (const [setting_key, setting_value, description] of [
        ["SEAT_TTL_MINUTES", "15", "Thời gian giữ ghế, tính bằng phút"],
        ["MAX_SEATS_PER_INVOICE", "10", "Số ghế tối đa trên một hóa đơn"],
        ["LEADER_RATIO", "15", "Tối đa 15 hành khách trên một Leader"],
      ]) {
        await tx.systemSetting.upsert({ where: { setting_key }, update: {}, create: { setting_key, setting_value, description } });
      }
      for (const [hours_before_departure, refund_percentage] of [[168, 100], [72, 70], [24, 30], [0, 0]]) {
        await tx.refundPolicyRule.upsert({ where: { hours_before_departure }, update: {}, create: { hours_before_departure, refund_percentage } });
      }
    }, { timeout: 120000, maxWait: 10000 });
    console.log("Development seed complete: reviewed reference catalog, 6 roles, 3 staff, 1 vehicle / 16 seats, 3 demo departures, settings and refund policies.");
    console.log(media.length ? "Reference media metadata imported; existing edits preserved. No image upload or Storage key required." : "Reference media manifest not available yet; catalog has no imported gallery. Run db:media after the upload manifest is provided.");
    console.log("Demo emails: <role lowercase>@go-trail.example.test. Password stays in local SEED_PASSWORD; existing credentials and settings are preserved.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Prisma errors can include database/user values. Report only a code or our own validation message.
  if (error instanceof Prisma.PrismaClientKnownRequestError) console.error(`Seed failed (${error.code}); details suppressed.`);
  else if (error instanceof SeedValidationError || error instanceof CatalogValidationError) console.error(error.message);
  else console.error("Seed failed; database details suppressed.");
  process.exitCode = 1;
});
