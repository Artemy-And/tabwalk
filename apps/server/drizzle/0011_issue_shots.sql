CREATE TABLE "issue_shots" (
	"scan_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"html" text NOT NULL,
	"target" jsonb NOT NULL,
	"image" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	CONSTRAINT "issue_shots_scan_id_fingerprint_pk" PRIMARY KEY("scan_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "issue_shots" ADD CONSTRAINT "issue_shots_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scans"("id") ON DELETE cascade ON UPDATE no action;