-- I04 (SCRUM-70): medical supplies are their own category (user decision 23/11/2026).
-- ADD VALUE only appends to the enum: existing rows and indexes are untouched, nothing is rewritten.
ALTER TYPE "SupplyCategory" ADD VALUE IF NOT EXISTS 'Medical';
