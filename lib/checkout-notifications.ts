export function withOrderNotificationEnqueue<
  TArgs extends unknown[],
  TResult extends { order: { id: string } }
>(
  placeOrder: (...args: TArgs) => Promise<TResult>,
  enqueue: (orderId: string) => Promise<unknown>,
  onEnqueueError: (error: unknown, orderId: string) => void
) {
  return async (...args: TArgs): Promise<TResult> => {
    const result = await placeOrder(...args);

    try {
      await enqueue(result.order.id);
    } catch (error) {
      // The order is already committed. Preserve the successful checkout
      // response and leave the persisted pending state for daily recovery.
      onEnqueueError(error, result.order.id);
    }

    return result;
  };
}
