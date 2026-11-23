CREATE TABLE "project_custom_field_value" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"field_id" text NOT NULL,
	"value" text,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "project_custom_field_value_project_field_unique" UNIQUE("project_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_custom_field_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"options" jsonb,
	"hidden_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"formula" jsonb,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	"updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
	CONSTRAINT "workspace_custom_field_def_workspace_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
ALTER TABLE "project_custom_field_value" ADD CONSTRAINT "project_custom_field_value_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_custom_field_value" ADD CONSTRAINT "project_custom_field_value_field_id_workspace_custom_field_definition_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."workspace_custom_field_definition"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "workspace_custom_field_definition" ADD CONSTRAINT "workspace_custom_field_definition_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "project_custom_field_value_projectId_idx" ON "project_custom_field_value" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_custom_field_value_field_project_idx" ON "project_custom_field_value" USING btree ("field_id","project_id");--> statement-breakpoint
CREATE INDEX "workspace_custom_field_def_workspaceId_idx" ON "workspace_custom_field_definition" USING btree ("workspace_id");