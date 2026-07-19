import { describe, expect, it, vi } from "vitest";
import { TransactionalEmailProviderError } from "@/lib/email-delivery";
import {
  buildWelcomeEmail,
  createWelcomeNotificationDispatcher,
  isPermanentWelcomeNotificationError,
  type WelcomeNotificationUser
} from "@/lib/welcome-notifications";

const user: WelcomeNotificationUser = {
  userId: "user_2abc",
  primaryEmail: "ada@example.com",
  firstName: "Ada <script>alert(1)</script>",
  status: "pending"
};

const config = { siteUrl: "https://shop.example" };

describe("welcome email", () => {
  it("builds one safe customer message with a shop link", () => {
    const message = buildWelcomeEmail(user, config);

    expect(message).toMatchObject({
      to: "ada@example.com",
      toName: "Ada <script>alert(1)</script>",
      subject: "Welcome to Ebika's Place",
      tags: ["welcome"]
    });
    expect(message.text).toContain("https://shop.example/shop");
    expect(message.html).toContain("Ada &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(message.html).not.toContain("<script>alert(1)</script>");
  });

  it("uses a generic greeting when Clerk has no first name", () => {
    const message = buildWelcomeEmail({ ...user, firstName: null }, config);

    expect(message).not.toHaveProperty("toName");
    expect(message.text).toContain("Hi there,");
  });

  it("refuses to build a provider request without a recipient", () => {
    expect(() => buildWelcomeEmail({ ...user, primaryEmail: null }, config)).toThrow(TypeError);
  });
});

describe("welcome notification dispatcher", () => {
  it("repairs pending state before sending exactly one idempotent email", async () => {
    const sequence: string[] = [];
    const markEnqueued = vi.fn(async () => {
      sequence.push("enqueued");
    });
    const sendMany = vi.fn(async () => {
      sequence.push("emailed");
      return { messageIds: ["brevo-welcome"] };
    });
    const dispatch = createWelcomeNotificationDispatcher({
      loadUser: vi.fn().mockResolvedValue(user),
      markEnqueued,
      getConfig: () => config,
      sendMany
    });

    await expect(dispatch(user.userId)).resolves.toEqual({
      userId: user.userId,
      emailIds: ["brevo-welcome"],
      outcome: "sent"
    });
    expect(sequence).toEqual(["enqueued", "emailed"]);
    expect(sendMany).toHaveBeenCalledTimes(1);
    expect(sendMany).toHaveBeenCalledWith(
      [expect.objectContaining({ to: "ada@example.com", tags: ["welcome"] })],
      { operationId: `welcome:v1:${user.userId}` }
    );
  });

  it.each(["sent", "suppressed"] as const)(
    "does not resend a replay when persistent state is %s",
    async (status) => {
      const sendMany = vi.fn();
      const dispatch = createWelcomeNotificationDispatcher({
        loadUser: vi.fn().mockResolvedValue({ ...user, status }),
        markEnqueued: vi.fn(),
        getConfig: () => config,
        sendMany
      });

      await expect(dispatch(user.userId)).resolves.toEqual({
        userId: user.userId,
        emailIds: [],
        outcome: "already-handled"
      });
      expect(sendMany).not.toHaveBeenCalled();
    }
  );

  it("suppresses a missing mirrored user without calling Brevo", async () => {
    const sendMany = vi.fn();
    const dispatch = createWelcomeNotificationDispatcher({
      loadUser: vi.fn().mockResolvedValue(null),
      markEnqueued: vi.fn(),
      getConfig: () => config,
      sendMany
    });

    await expect(dispatch(user.userId)).resolves.toEqual({
      userId: user.userId,
      emailIds: [],
      outcome: "suppressed"
    });
    expect(sendMany).not.toHaveBeenCalled();
  });

  it("suppresses a user with no primary email without calling Brevo", async () => {
    const sendMany = vi.fn();
    const markEnqueued = vi.fn();
    const dispatch = createWelcomeNotificationDispatcher({
      loadUser: vi.fn().mockResolvedValue({ ...user, primaryEmail: null }),
      markEnqueued,
      getConfig: () => config,
      sendMany
    });

    await expect(dispatch(user.userId)).resolves.toMatchObject({ outcome: "suppressed" });
    expect(markEnqueued).not.toHaveBeenCalled();
    expect(sendMany).not.toHaveBeenCalled();
  });

  it("does not repeat the enqueued state write on an Inngest retry", async () => {
    const markEnqueued = vi.fn();
    const dispatch = createWelcomeNotificationDispatcher({
      loadUser: vi.fn().mockResolvedValue({ ...user, status: "enqueued" }),
      markEnqueued,
      getConfig: () => config,
      sendMany: vi.fn().mockResolvedValue({ messageIds: ["brevo-welcome"] })
    });

    await dispatch(user.userId);
    expect(markEnqueued).not.toHaveBeenCalled();
  });

  it("propagates retryable provider failures without reporting a sent outcome", async () => {
    const providerError = new TransactionalEmailProviderError("request_failed", null);
    const dispatch = createWelcomeNotificationDispatcher({
      loadUser: vi.fn().mockResolvedValue({ ...user, status: "enqueued" }),
      markEnqueued: vi.fn(),
      getConfig: () => config,
      sendMany: vi.fn().mockRejectedValue(providerError)
    });

    await expect(dispatch(user.userId)).rejects.toBe(providerError);
    expect(isPermanentWelcomeNotificationError(providerError)).toBe(false);
  });

  it("recognizes permanent provider rejections for the Inngest workflow", () => {
    const invalidRecipient = new TransactionalEmailProviderError("invalid_parameter", 400);

    expect(isPermanentWelcomeNotificationError(invalidRecipient)).toBe(true);
    expect(isPermanentWelcomeNotificationError(new Error("other"))).toBe(false);
  });
});
