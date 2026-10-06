ALTER TABLE "sites" ADD COLUMN "max_pages" integer;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "crawl_include" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "crawl_exclude" jsonb DEFAULT '[]'::jsonb NOT NULL;