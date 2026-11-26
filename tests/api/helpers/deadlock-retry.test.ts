import { describe, expect, it, vi } from "vite-plus/test";
import { retryOnDeadlock } from "../../api-integration/helpers/deadlock-retry";

function deadlock() {
  return Object.assign(new Error("deadlock detected"), { code: "40P01" });
}

describe("retryOnDeadlock", () => {
  it("returns the first successful result without waiting", async () => {
    const run = vi.fn(async () => "ok");

    await expect(retryOnDeadlock(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("retries a deadlocked truncate and succeeds on a later attempt", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(deadlock())
      .mockResolvedValueOnce("ok");

    await expect(retryOnDeadlock(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reads the code drizzle puts on the cause", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        Object.assign(new Error("Failed query"), { cause: deadlock() }),
      )
      .mockResolvedValueOnce("ok");

    await expect(retryOnDeadlock(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up after three deadlocks", async () => {
    const run = vi.fn(async () => {
      throw deadlock();
    });

    await expect(retryOnDeadlock(run)).rejects.toThrow("deadlock detected");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("fails on the first try for anything that is not a deadlock", async () => {
    const run = vi.fn(async () => {
      throw Object.assign(new Error("relation does not exist"), {
        code: "42P01",
      });
    });

    await expect(retryOnDeadlock(run)).rejects.toThrow(
      "relation does not exist",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
});
