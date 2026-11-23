import { describe, expect, it } from "vite-plus/test";
import { listProjectFieldRecipients } from "./project-field-recipients";

describe("listProjectFieldRecipients", () => {
  it("returns workspace members plus instance admins without duplicates", async () => {
    const workspaceId = "workspace-1";
    const ownerId = "owner";
    const adminId = "admin";
    const restrictedId = "restricted";
    const instanceAdminId = "instance-admin";
    const outsiderId = "outsider";

    const recipients = await listProjectFieldRecipients(workspaceId, {
      listWorkspaceMembers: async (id) => {
        expect(id).toBe(workspaceId);
        return [ownerId, adminId, restrictedId, instanceAdminId];
      },
      listInstanceAdmins: async () => [instanceAdminId],
    });

    expect(recipients).toEqual(
      new Set([ownerId, adminId, restrictedId, instanceAdminId]),
    );
    expect(recipients.has(outsiderId)).toBe(false);
  });

  it("works with no members and no admins", async () => {
    const recipients = await listProjectFieldRecipients("workspace-1", {
      listWorkspaceMembers: async () => [],
      listInstanceAdmins: async () => [],
    });
    expect(recipients.size).toBe(0);
  });
});
