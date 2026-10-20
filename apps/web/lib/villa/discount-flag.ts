/**
 * Discount codes stay dark until the booking site enforces them at checkout
 * (villa-booking TODO 1): defining codes nobody can redeem would mislead.
 * Public because the navigation (client) needs it too; it is not a security
 * boundary (the database functions check roles either way).
 */
export function villaDiscountsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VILLA_DISCOUNTS === 'true';
}
