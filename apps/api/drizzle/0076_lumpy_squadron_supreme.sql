CREATE TABLE "intake_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"intake_request_id" text NOT NULL,
	"type" text NOT NULL,
	"user_id" text,
	"content" text,
	"event_data" jsonb,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_request" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"number" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_by_id" text NOT NULL,
	"requester_name" text,
	"requester_email" text,
	"source_type" text DEFAULT 'guest_portal' NOT NULL,
	"source_id" text,
	"external_reference" text,
	"confirmed_at" timestamp,
	"confirmed_via" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "intake_request_project_number_unique" UNIQUE("project_id","number")
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "intake_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "last_intake_request_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "intake_request_id" text;--> statement-breakpoint
ALTER TABLE "intake_activity" ADD CONSTRAINT "intake_activity_intake_request_id_intake_request_id_fk" FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_request"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intake_activity" ADD CONSTRAINT "intake_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intake_request" ADD CONSTRAINT "intake_request_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "intake_request" ADD CONSTRAINT "intake_request_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "intake_activity_requestId_idx" ON "intake_activity" USING btree ("intake_request_id");--> statement-breakpoint
CREATE INDEX "intake_request_createdById_idx" ON "intake_request" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "intake_request_projectId_status_idx" ON "intake_request" USING btree ("project_id","status");--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_intake_request_id_intake_request_id_fk" FOREIGN KEY ("intake_request_id") REFERENCES "public"."intake_request"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "task_intakeRequestId_idx" ON "task" USING btree ("intake_request_id");--> statement-breakpoint
-- Add-only merge: grant intakeRequest actions to the seeded default roles.
-- `workspace_role` rows fully replace compiled definitions and the boot
-- seeder only inserts missing rows, so existing workspaces would otherwise
-- have no intake permissions at all. jsonb || adds only the missing key
-- (admin customizations survive); the IS NULL guard keeps it idempotent;
-- the role filter leaves custom-named roles untouched. `owner` has no row.
UPDATE "workspace_role"
SET "permission" = ("permission"::jsonb || '{"intakeRequest":["read"]}'::jsonb)::text
WHERE "role" = 'viewer' AND ("permission"::jsonb -> 'intakeRequest') IS NULL;--> statement-breakpoint
UPDATE "workspace_role"
SET "permission" = ("permission"::jsonb || '{"intakeRequest":["create","read","update","manage"]}'::jsonb)::text
WHERE "role" IN ('member', 'admin') AND ("permission"::jsonb -> 'intakeRequest') IS NULL;
