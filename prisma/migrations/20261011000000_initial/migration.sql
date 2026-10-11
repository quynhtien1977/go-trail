-- Keep table creation, constraints and Data API lockdown atomic.
BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('Customer', 'Leader', 'RouteMgr', 'HRMgr', 'Accountant', 'Admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('Active', 'Locked');

-- CreateEnum
CREATE TYPE "StaffType" AS ENUM ('Driver', 'Assistant', 'Leader');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('Ready', 'Maintenance', 'Inactive');

-- CreateEnum
CREATE TYPE "DepartureStatus" AS ENUM ('Draft', 'Open', 'Closed', 'Confirmed', 'Running', 'Ended', 'Cancelled', 'Rescheduled');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('Available', 'Locked', 'Sold');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('Fuel', 'Toll', 'Staff', 'Other');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('Pending', 'Paid', 'Expired', 'Cancelled');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('Pending', 'Valid', 'Cancelled');

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('Pending', 'CheckedIn', 'Absent');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BankTransfer');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('Success', 'NeedsReview');

-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('CustomerCancel', 'TripCancelled', 'PaymentIssue');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('Manual', 'SePayApi');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Completed', 'Failed');

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'Customer',
    "status" "UserStatus" NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "setting_key" TEXT NOT NULL,
    "setting_value" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("setting_key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "log_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "staff" (
    "staff_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "staff_type" "StaffType" NOT NULL,
    "license_number" TEXT,
    "license_class" TEXT,
    "license_expiry" DATE,
    "status" "StaffStatus" NOT NULL DEFAULT 'Active',

    CONSTRAINT "staff_pkey" PRIMARY KEY ("staff_id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "vehicle_id" SERIAL NOT NULL,
    "plate_number" TEXT NOT NULL,
    "vehicle_type" TEXT NOT NULL,
    "seat_count" INTEGER NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'Ready',

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "vehicle_seats" (
    "seat_id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "seat_name" TEXT NOT NULL,
    "floor_level" INTEGER NOT NULL,
    "x_position" INTEGER NOT NULL,
    "y_position" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vehicle_seats_pkey" PRIMARY KEY ("seat_id")
);

-- CreateTable
CREATE TABLE "vehicle_maintenance" (
    "maintenance_id" SERIAL NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DECIMAL(14,0) NOT NULL,

    CONSTRAINT "vehicle_maintenance_pkey" PRIMARY KEY ("maintenance_id")
);

-- CreateTable
CREATE TABLE "trips" (
    "trip_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "location_name" TEXT NOT NULL,
    "difficulty_level" TEXT NOT NULL,
    "length_km" DECIMAL(8,2) NOT NULL,
    "peak_height_m" INTEGER NOT NULL,
    "base_price" DECIMAL(14,0) NOT NULL,
    "description" TEXT NOT NULL,
    "schedule_content" TEXT NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "pickup_points" (
    "pickup_id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "pickup_points_pkey" PRIMARY KEY ("pickup_id")
);

-- CreateTable
CREATE TABLE "departures" (
    "departure_id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "departure_date" TIMESTAMPTZ(6) NOT NULL,
    "min_passengers" INTEGER NOT NULL,
    "booking_deadline" TIMESTAMPTZ(6) NOT NULL,
    "price_override" DECIMAL(14,0),
    "status" "DepartureStatus" NOT NULL DEFAULT 'Draft',

    CONSTRAINT "departures_pkey" PRIMARY KEY ("departure_id")
);

-- CreateTable
CREATE TABLE "departure_pickups" (
    "dep_pickup_id" SERIAL NOT NULL,
    "departure_id" INTEGER NOT NULL,
    "pickup_id" INTEGER NOT NULL,
    "pickup_time" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departure_pickups_pkey" PRIMARY KEY ("dep_pickup_id")
);

-- CreateTable
CREATE TABLE "departure_vehicles" (
    "dep_vehicle_id" SERIAL NOT NULL,
    "departure_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,

    CONSTRAINT "departure_vehicles_pkey" PRIMARY KEY ("dep_vehicle_id")
);

-- CreateTable
CREATE TABLE "departure_seats" (
    "dep_seat_id" SERIAL NOT NULL,
    "dep_vehicle_id" INTEGER NOT NULL,
    "seat_id" INTEGER NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'Available',
    "locked_until" TIMESTAMPTZ(6),
    "invoice_id" INTEGER,

    CONSTRAINT "departure_seats_pkey" PRIMARY KEY ("dep_seat_id")
);

-- CreateTable
CREATE TABLE "departure_staff" (
    "dep_staff_id" SERIAL NOT NULL,
    "departure_id" INTEGER NOT NULL,
    "staff_id" INTEGER NOT NULL,
    "role_in_trip" "StaffType" NOT NULL,
    "dep_vehicle_id" INTEGER NOT NULL,

    CONSTRAINT "departure_staff_pkey" PRIMARY KEY ("dep_staff_id")
);

-- CreateTable
CREATE TABLE "departure_costs" (
    "cost_id" SERIAL NOT NULL,
    "departure_id" INTEGER NOT NULL,
    "cost_type" "CostType" NOT NULL,
    "amount" DECIMAL(14,0) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "departure_costs_pkey" PRIMARY KEY ("cost_id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "invoice_id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "departure_id" INTEGER NOT NULL,
    "payment_code" TEXT NOT NULL,
    "total_amount" DECIMAL(14,0) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'Pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateTable
CREATE TABLE "invoice_details" (
    "detail_id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "dep_seat_id" INTEGER NOT NULL,
    "dep_pickup_id" INTEGER NOT NULL,
    "refund_id" INTEGER,
    "passenger_name" TEXT NOT NULL,
    "passenger_phone" TEXT NOT NULL,
    "emergency_contact" TEXT NOT NULL,
    "health_declaration" BOOLEAN NOT NULL,
    "unit_price" DECIMAL(14,0) NOT NULL,
    "ticket_code" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'Pending',
    "check_in_status" "CheckInStatus" NOT NULL DEFAULT 'Pending',
    "check_in_time" TIMESTAMPTZ(6),

    CONSTRAINT "invoice_details_pkey" PRIMARY KEY ("detail_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "payment_id" SERIAL NOT NULL,
    "invoice_id" INTEGER,
    "amount" DECIMAL(14,0) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'BankTransfer',
    "transaction_id" TEXT NOT NULL,
    "reference_code" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "raw_payload" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "refund_policy_rules" (
    "rule_id" SERIAL NOT NULL,
    "hours_before_departure" INTEGER NOT NULL,
    "refund_percentage" INTEGER NOT NULL,

    CONSTRAINT "refund_policy_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "refund_id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,0) NOT NULL,
    "refund_type" "RefundType" NOT NULL,
    "method" "RefundMethod" NOT NULL DEFAULT 'Manual',
    "status" "RefundStatus" NOT NULL DEFAULT 'Pending',
    "reason" TEXT NOT NULL,
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "bank_account_holder" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "provider_refund_id" TEXT,
    "payout_reference" TEXT,
    "requested_by" INTEGER,
    "approved_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("refund_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "review_id" SERIAL NOT NULL,
    "detail_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("review_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_table_name_record_id_created_at_idx" ON "audit_logs"("table_name", "record_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_seats_vehicle_id_seat_name_key" ON "vehicle_seats"("vehicle_id", "seat_name");

-- CreateIndex
CREATE INDEX "vehicle_maintenance_vehicle_id_start_date_idx" ON "vehicle_maintenance"("vehicle_id", "start_date");

-- CreateIndex
CREATE INDEX "pickup_points_trip_id_idx" ON "pickup_points"("trip_id");

-- CreateIndex
CREATE INDEX "departures_trip_id_departure_date_idx" ON "departures"("trip_id", "departure_date");

-- CreateIndex
CREATE INDEX "departures_status_departure_date_idx" ON "departures"("status", "departure_date");

-- CreateIndex
CREATE INDEX "departure_pickups_pickup_id_idx" ON "departure_pickups"("pickup_id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_pickups_departure_id_pickup_id_key" ON "departure_pickups"("departure_id", "pickup_id");

-- CreateIndex
CREATE INDEX "departure_vehicles_vehicle_id_idx" ON "departure_vehicles"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_vehicles_departure_id_vehicle_id_key" ON "departure_vehicles"("departure_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "departure_seats_seat_id_idx" ON "departure_seats"("seat_id");

-- CreateIndex
CREATE INDEX "departure_seats_invoice_id_idx" ON "departure_seats"("invoice_id");

-- CreateIndex
CREATE INDEX "departure_seats_status_locked_until_idx" ON "departure_seats"("status", "locked_until");

-- CreateIndex
CREATE UNIQUE INDEX "departure_seats_dep_vehicle_id_seat_id_key" ON "departure_seats"("dep_vehicle_id", "seat_id");

-- CreateIndex
CREATE INDEX "departure_staff_staff_id_idx" ON "departure_staff"("staff_id");

-- CreateIndex
CREATE INDEX "departure_staff_dep_vehicle_id_idx" ON "departure_staff"("dep_vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "departure_staff_departure_id_staff_id_role_in_trip_key" ON "departure_staff"("departure_id", "staff_id", "role_in_trip");

-- CreateIndex
CREATE INDEX "departure_costs_departure_id_idx" ON "departure_costs"("departure_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_payment_code_key" ON "invoices"("payment_code");

-- CreateIndex
CREATE INDEX "invoices_customer_id_created_at_idx" ON "invoices"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_departure_id_idx" ON "invoices"("departure_id");

-- CreateIndex
CREATE INDEX "invoices_status_expires_at_idx" ON "invoices"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_details_ticket_code_key" ON "invoice_details"("ticket_code");

-- CreateIndex
CREATE INDEX "invoice_details_invoice_id_idx" ON "invoice_details"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_details_dep_seat_id_idx" ON "invoice_details"("dep_seat_id");

-- CreateIndex
CREATE INDEX "invoice_details_dep_pickup_id_idx" ON "invoice_details"("dep_pickup_id");

-- CreateIndex
CREATE INDEX "invoice_details_refund_id_idx" ON "invoice_details"("refund_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_id_key" ON "payments"("transaction_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refund_policy_rules_hours_before_departure_key" ON "refund_policy_rules"("hours_before_departure");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");

-- CreateIndex
CREATE INDEX "refunds_invoice_id_idx" ON "refunds"("invoice_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refunds_requested_by_idx" ON "refunds"("requested_by");

-- CreateIndex
CREATE INDEX "refunds_approved_by_idx" ON "refunds"("approved_by");

-- CreateIndex
CREATE INDEX "refunds_status_created_at_idx" ON "refunds"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_detail_id_key" ON "reviews"("detail_id");

-- CreateIndex
CREATE INDEX "reviews_customer_id_idx" ON "reviews"("customer_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_seats" ADD CONSTRAINT "vehicle_seats_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_maintenance" ADD CONSTRAINT "vehicle_maintenance_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickup_points" ADD CONSTRAINT "pickup_points_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departures" ADD CONSTRAINT "departures_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("trip_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_pickups" ADD CONSTRAINT "departure_pickups_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("departure_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_pickups" ADD CONSTRAINT "departure_pickups_pickup_id_fkey" FOREIGN KEY ("pickup_id") REFERENCES "pickup_points"("pickup_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_vehicles" ADD CONSTRAINT "departure_vehicles_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("departure_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_vehicles" ADD CONSTRAINT "departure_vehicles_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_seats" ADD CONSTRAINT "departure_seats_dep_vehicle_id_fkey" FOREIGN KEY ("dep_vehicle_id") REFERENCES "departure_vehicles"("dep_vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_seats" ADD CONSTRAINT "departure_seats_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "vehicle_seats"("seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_seats" ADD CONSTRAINT "departure_seats_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_staff" ADD CONSTRAINT "departure_staff_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("departure_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_staff" ADD CONSTRAINT "departure_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("staff_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_staff" ADD CONSTRAINT "departure_staff_dep_vehicle_id_fkey" FOREIGN KEY ("dep_vehicle_id") REFERENCES "departure_vehicles"("dep_vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_costs" ADD CONSTRAINT "departure_costs_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("departure_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_departure_id_fkey" FOREIGN KEY ("departure_id") REFERENCES "departures"("departure_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_dep_seat_id_fkey" FOREIGN KEY ("dep_seat_id") REFERENCES "departure_seats"("dep_seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_dep_pickup_id_fkey" FOREIGN KEY ("dep_pickup_id") REFERENCES "departure_pickups"("dep_pickup_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("refund_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("invoice_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("payment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_detail_id_fkey" FOREIGN KEY ("detail_id") REFERENCES "invoice_details"("detail_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Approved PRD 15.7: cancelled ticket history must not block resale.
CREATE UNIQUE INDEX "invoice_details_active_seat_key"
ON "invoice_details" ("dep_seat_id") WHERE "status" <> 'Cancelled';

-- Local row invariants; cross-resource ownership and transitions belong in services.
ALTER TABLE "staff" ADD CONSTRAINT "staff_account_type_check"
  CHECK ("user_id" IS NULL OR "staff_type" = 'Leader');
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_seat_count_check" CHECK ("seat_count" > 0);
ALTER TABLE "vehicle_seats" ADD CONSTRAINT "vehicle_seats_coordinates_check"
  CHECK ("floor_level" >= 1 AND "x_position" >= 0 AND "y_position" >= 0);
ALTER TABLE "vehicle_maintenance" ADD CONSTRAINT "vehicle_maintenance_values_check"
  CHECK ("end_date" >= "start_date" AND "cost" >= 0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_values_check"
  CHECK ("length_km" >= 0 AND "peak_height_m" >= 0 AND "base_price" >= 0);
ALTER TABLE "departures" ADD CONSTRAINT "departures_values_check"
  CHECK ("min_passengers" > 0 AND "booking_deadline" <= "departure_date" AND ("price_override" IS NULL OR "price_override" >= 0));
ALTER TABLE "departure_seats" ADD CONSTRAINT "departure_seats_hold_check" CHECK (
  ("status" = 'Available' AND "invoice_id" IS NULL AND "locked_until" IS NULL) OR
  ("status" = 'Locked' AND "invoice_id" IS NOT NULL AND "locked_until" IS NOT NULL) OR
  ("status" = 'Sold' AND "invoice_id" IS NOT NULL AND "locked_until" IS NULL)
);
ALTER TABLE "departure_costs" ADD CONSTRAINT "departure_costs_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amount_check" CHECK ("total_amount" >= 0);
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_price_check" CHECK ("unit_price" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_check" CHECK ("amount" > 0);
ALTER TABLE "refund_policy_rules" ADD CONSTRAINT "refund_policy_rules_range_check"
  CHECK ("hours_before_departure" >= 0 AND "refund_percentage" BETWEEN 0 AND 100);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5);

-- Auth.js sessions are authorized by server services, not Supabase JWT policies.
-- Explicit list limits these changes to this application's 21 tables.
DO $$
DECLARE
  business_table text;
  api_role text;
  sequence_name text;
BEGIN
  FOREACH business_table IN ARRAY ARRAY[
    'users', 'system_settings', 'audit_logs', 'staff', 'vehicles',
    'vehicle_seats', 'vehicle_maintenance', 'trips', 'pickup_points',
    'departures', 'departure_pickups', 'departure_vehicles', 'departure_seats',
    'departure_staff', 'departure_costs', 'invoices', 'invoice_details',
    'payments', 'refund_policy_rules', 'refunds', 'reviews'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', business_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', business_table);
    FOR sequence_name IN
      SELECT pg_get_serial_sequence(format('public.%I', business_table), a.attname)
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', business_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND pg_get_serial_sequence(format('public.%I', business_table), a.attname) IS NOT NULL
    LOOP
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', sequence_name);
    END LOOP;
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', business_table, api_role);
        FOR sequence_name IN
          SELECT pg_get_serial_sequence(format('public.%I', business_table), a.attname)
          FROM pg_attribute a
          WHERE a.attrelid = format('public.%I', business_table)::regclass
            AND a.attnum > 0 AND NOT a.attisdropped
            AND pg_get_serial_sequence(format('public.%I', business_table), a.attname) IS NOT NULL
        LOOP
          EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I', sequence_name, api_role);
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Prisma creates its history table before applying migration SQL. Protect its logs too.
DO $$
DECLARE api_role text;
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public._prisma_migrations FROM PUBLIC;
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public._prisma_migrations FROM %I', api_role);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMIT;
