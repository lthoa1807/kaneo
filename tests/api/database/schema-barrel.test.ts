import { expect, it } from "vite-plus/test";
import db, { schema } from "../../../apps/api/src/database";

it("exposes the intake tables and relations through the database barrel", () => {
  expect(schema.intakeRequestTable).toBeDefined();
  expect(schema.intakeActivityTable).toBeDefined();
  expect(schema.intakeRequestTableRelations).toBeDefined();
  expect(schema.intakeActivityTableRelations).toBeDefined();
  expect(db).toBeDefined();
});
