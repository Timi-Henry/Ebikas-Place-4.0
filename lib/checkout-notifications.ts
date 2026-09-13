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
      // response. Its Mongo job was committed in the same transaction and is
      // therefore safe for scheduled recovery if queue publication failed.
      onEnqueueError(error, result.order.id);
    }

    return result;
  };
}
