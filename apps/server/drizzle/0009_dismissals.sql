CREATE TYPE "public"."dismissal_reason" AS ENUM('false_positive', 'wont_fix');--> statement-breakpoint
CREATE TABLE "dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"reason" "dismissal_reason" NOT NULL,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dismissals" ADD CONSTRAINT "dismissals_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dismissals" ADD CONSTRAINT "dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dismissals_site_fingerprint_idx" ON "dismissals" USING btree ("site_id","fingerprint");