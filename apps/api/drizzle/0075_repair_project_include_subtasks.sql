-- Repair migration, no schema change.
-- e9e48b74 folded migrations and a28997e5 renumbered 0073 with an earlier
-- `when` timestamp than the 0073 it replaced. Databases that migrated in
-- between recorded the old 0073, so drizzle skips the current 0073 and never
-- adds project.include_subtasks. Installs that already have the column are
-- unaffected (IF NOT EXISTS).
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "include_subtasks" boolean DEFAULT true NOT NULL;
