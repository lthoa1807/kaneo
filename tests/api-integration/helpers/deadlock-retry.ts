// A connection left holding a lock by an earlier file makes TRUNCATE wait, and
// when two sessions wait on each other Postgres answers 40P01 and aborts one of
// them. The lock is gone by the next attempt, so retry instead of failing a shard.
// Every other error still fails on the first try: a real schema or migration
// problem must not be hidden behind retries.
export async function retryOnDeadlock<T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const code =
        (error as { code?: string }).code ??
        (error as { cause?: { code?: string } }).cause?.code;
      if (code !== "40P01" || attempt >= attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}
