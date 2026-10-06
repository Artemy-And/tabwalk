ALTER TABLE "scans" ADD COLUMN "ignored" jsonb;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "ignore_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "ignore_selectors" jsonb DEFAULT '[]'::jsonb NOT NULL;