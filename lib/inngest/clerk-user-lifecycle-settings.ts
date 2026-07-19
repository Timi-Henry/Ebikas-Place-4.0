export const CLERK_USER_LIFECYCLE_FUNCTION_SETTINGS = Object.freeze({
  // One global lifecycle run avoids races between create/update/delete events
  // and stays comfortably within Inngest's free-plan concurrency allowance.
  concurrency: { limit: 1 },
  retries: 2
});
