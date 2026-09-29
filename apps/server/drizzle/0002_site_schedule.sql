CREATE TYPE "public"."scan_schedule" AS ENUM('off', 'daily', 'weekly');--> statement-breakpoint
-- Sites added before scheduled scans keep scanning only on demand
ALTER TABLE "sites" ADD COLUMN "schedule" "scan_schedule" DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "schedule" SET DEFAULT 'weekly';
