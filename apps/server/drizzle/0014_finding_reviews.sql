CREATE TYPE "public"."review_status" AS ENUM('confirmed', 'acceptable', 'not_applicable');--> statement-breakpoint
CREATE TABLE "finding_reviews" (
	"scan_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "review_status" NOT NULL,
	"note" text,
	"user_id" uuid,
	"reviewer" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finding_reviews_scan_id_fingerprint_pk" PRIMARY KEY("scan_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "finding_reviews" ADD CONSTRAINT "finding_reviews_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_reviews" ADD CONSTRAINT "finding_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;