import { describe, expect, it } from "vite-plus/test";
import { guestStatusLabelKey, groupForStatus } from "./intake-groups";

describe("groupForStatus", () => {
  it("maps open statuses to their guest group", () => {
    expect(groupForStatus("new")).toBe("waiting");
    expect(groupForStatus("triaged")).toBe("waiting");
    expect(groupForStatus("approved")).toBe("in_progress");
    expect(groupForStatus("in_progress")).toBe("in_progress");
    expect(groupForStatus("needs_revision")).toBe("in_progress");
    expect(groupForStatus("delivered")).toBe("awaiting");
  });

  it("leaves closed statuses out of every group", () => {
    expect(groupForStatus("confirmed")).toBeNull();
    expect(groupForStatus("rejected")).toBeNull();
  });
});

describe("guestStatusLabelKey", () => {
  it("names open statuses after the group a guest cares about", () => {
    expect(guestStatusLabelKey("triaged")).toBe("intake:portal.group.waiting");
    expect(guestStatusLabelKey("approved")).toBe(
      "intake:portal.group.in_progress",
    );
  });

  it("keeps the plain status label for closed requests", () => {
    expect(guestStatusLabelKey("confirmed")).toBe("intake:status.confirmed");
  });
});
