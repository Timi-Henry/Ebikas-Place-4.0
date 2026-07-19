import { describe, expect, it, vi } from "vitest";
import { withOrderNotificationEnqueue } from "@/lib/checkout-notifications";

describe("checkout notification wiring", () => {
  it("enqueues only after checkout has committed", async () => {
    const sequence: string[] = [];
    const place = vi.fn(async () => {
      sequence.push("committed");
      return { order: { id: "64b000000000000000000001" }, replayed: false };
    });
    const enqueue = vi.fn(async () => {
      sequence.push("enqueued");
    });
    const wrapped = withOrderNotificationEnqueue(place, enqueue, vi.fn());

    await wrapped();

    expect(sequence).toEqual(["committed", "enqueued"]);
  });

  it("preserves a successful checkout when enqueueing fails", async () => {
    const result = { order: { id: "64b000000000000000000001" }, replayed: false };
    const error = new Error("temporary Inngest failure");
    const onError = vi.fn();
    const wrapped = withOrderNotificationEnqueue(
      vi.fn().mockResolvedValue(result),
      vi.fn().mockRejectedValue(error),
      onError
    );

    await expect(wrapped()).resolves.toBe(result);
    expect(onError).toHaveBeenCalledWith(error, result.order.id);
  });

  it("does not enqueue when checkout itself fails", async () => {
    const enqueue = vi.fn();
    const wrapped = withOrderNotificationEnqueue(
      vi.fn().mockRejectedValue(new Error("transaction rolled back")),
      enqueue,
      vi.fn()
    );

    await expect(wrapped()).rejects.toThrow("transaction rolled back");
    expect(enqueue).not.toHaveBeenCalled();
  });
});
