ALTER TABLE "issues" ADD COLUMN "scenario" jsonb;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "scenario_runs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "scenario_summary" jsonb;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL;