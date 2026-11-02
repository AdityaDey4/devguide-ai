import { describe, expect, it } from "vitest";
import { createLimiter } from "@/lib/limiter";
import { sleep } from "../../helpers/localServer";

describe("createLimiter", () => {
  it("never runs more jobs at once than the limit, and every job finishes with its own result", async () => {
    const limit = createLimiter(3);
    let active = 0;
    let peak = 0;

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        limit(async () => {
          active++;
          peak = Math.max(peak, active);
          await sleep(5);
          active--;
          return i;
        }),
      ),
    );

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThanOrEqual(2);
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("keeps working after a job fails", async () => {
    const limit = createLimiter(1);
    await expect(
      limit(async () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await expect(limit(async () => "next")).resolves.toBe("next");
  });
});
