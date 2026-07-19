import {
  isPermanentTransactionalEmailError,
  type TransactionalEmailMessage,
  type TransactionalEmailResult
} from "@/lib/email-delivery";

export type WelcomeNotificationConfig = {
  siteUrl: string;
};

export type WelcomeNotificationUser = {
  userId: string;
  primaryEmail: string | null;
  firstName: string | null;
  status: "pending" | "enqueued" | "sent" | "suppressed";
};

type WelcomeNotificationDependencies = {
  loadUser(userId: string): Promise<WelcomeNotificationUser | null>;
  markEnqueued(userId: string): Promise<void>;
  getConfig(): WelcomeNotificationConfig;
  sendMany(
    messages: readonly TransactionalEmailMessage[],
    options: { operationId: string }
  ): Promise<TransactionalEmailResult>;
};

export function isPermanentWelcomeNotificationError(error: unknown) {
  return isPermanentTransactionalEmailError(error);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] || character);
}

function normalizedFirstName(value: string | null) {
  return value?.trim() || null;
}

export function buildWelcomeEmail(
  user: WelcomeNotificationUser,
  config: WelcomeNotificationConfig
): TransactionalEmailMessage {
  if (!user.primaryEmail) {
    throw new TypeError("A primary email address is required for a welcome notification.");
  }

  const firstName = normalizedFirstName(user.firstName);
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  const escapedGreeting = escapeHtml(greeting);
  const shopUrl = `${config.siteUrl}/shop`;

  return {
    to: user.primaryEmail,
    ...(firstName ? { toName: firstName } : {}),
    subject: "Welcome to Ebika's Place",
    text: [
      greeting,
      "",
      "Welcome to Ebika's Place. Your account is ready, so you can save delivery addresses and keep track of your orders in one place.",
      "",
      `Explore the shop: ${shopUrl}`
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3f5f9;font-family:Arial,sans-serif;color:#182033;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Ebika's Place account is ready.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f9;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(21,31,54,.08);">
          <tr><td style="background:#172033;padding:22px 28px;color:#ffffff;font-size:20px;font-weight:700;">Ebika's Place</td></tr>
          <tr><td style="padding:30px 28px;">
            <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#172033;">Welcome to Ebika's Place</h1>
            <p style="margin:0 0 14px;line-height:1.65;color:#4d566b;">${escapedGreeting}</p>
            <p style="margin:0 0 22px;line-height:1.65;color:#4d566b;">Your account is ready, so you can save delivery addresses and keep track of your orders in one place.</p>
            <a href="${escapeHtml(shopUrl)}" style="display:inline-block;border-radius:10px;background:#172033;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:700;">Explore the shop</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
    tags: ["welcome"]
  };
}

export function createWelcomeNotificationDispatcher(dependencies: WelcomeNotificationDependencies) {
  return async function dispatchWelcomeNotification(userId: string) {
    const user = await dependencies.loadUser(userId);

    if (!user) {
      return { userId, emailIds: [], outcome: "suppressed" as const };
    }

    if (user.status === "sent" || user.status === "suppressed") {
      return { userId, emailIds: [], outcome: "already-handled" as const };
    }

    if (!user.primaryEmail) {
      return { userId, emailIds: [], outcome: "suppressed" as const };
    }

    if (user.status === "pending") {
      await dependencies.markEnqueued(userId);
    }

    const response = await dependencies.sendMany(
      [buildWelcomeEmail(user, dependencies.getConfig())],
      { operationId: `welcome:v1:${userId}` }
    );

    return {
      userId,
      emailIds: response.messageIds,
      outcome: "sent" as const
    };
  };
}
