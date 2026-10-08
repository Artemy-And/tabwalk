ALTER TABLE "issue_shots" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "environment" jsonb;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "environment_runs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "environments" jsonb;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "environments" jsonb DEFAULT '[]'::jsonb NOT NULL;