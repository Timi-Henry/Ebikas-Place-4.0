export const ORDER_NOTIFICATION_FUNCTION_SETTINGS = Object.freeze({
  // One active run at a time keeps the batch provider call inside Hobby limits.
  concurrency: { limit: 1 },
  retries: 2
});

export const ORDER_NOTIFICATION_RECOVERY_SETTINGS = Object.freeze({
  concurrency: { limit: 1 },
  retries: 1
});
