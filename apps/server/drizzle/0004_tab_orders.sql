CREATE TABLE "tab_orders" (
	"page_id" uuid PRIMARY KEY NOT NULL,
	"image" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"stops" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tab_orders" ADD CONSTRAINT "tab_orders_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;