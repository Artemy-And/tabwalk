CREATE TYPE "public"."channel_kind" AS ENUM('slack', 'discord', 'ntfy', 'webhook', 'email');--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "channel_kind" NOT NULL,
	"target" text NOT NULL,
	"last_sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_channels_org_idx" ON "notification_channels" USING btree ("org_id");