import 'server-only';

/**
 * Storing guest ID files is switched on only once BOTH privacy notices say
 * so: Ooruda's (shipped with M4) and the guest booking site's (villa-booking
 * TODO). Until then staff record IDs seen in person, with a masked number and
 * no file. Server-side only: the browser never decides this.
 */
export function guestIdUploadsEnabled(): boolean {
  return process.env.VILLA_GUEST_ID_UPLOADS === 'true';
}
