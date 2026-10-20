import 'server-only';
import { getLogger } from '@kit/shared/logger';

/**
 * Purges the guest booking site's Next.js cache after Ooruda changes something
 * the site renders (rates, policies, nearby places, journal posts).
 *
 * Ooruda writes straight into the booking site's database, so the data changes
 * at once — but the site renders its pages from that data and caches the
 * result, so without this call an edit only appears when the cache expires.
 * Rates are the case that matters: the booking widget prices a stay from the
 * values baked into the page, so a stale page quotes a price the site itself
 * no longer charges.
 *
 * Best-effort by contract: a settings save must never fail because the guest
 * site is unreachable. Every failure is logged and swallowed, and the site
 * still corrects itself when its own revalidate window lapses.
 *
 * Config is per-deployment rather than per-property: today one Ooruda
 * deployment serves one booking site. Making this multi-property means moving
 * the URL onto `villa_properties` and the secret into the vault beside the
 * service key, and taking a property id here.
 */
const TIMEOUT_MS = 5_000;

export async function revalidateBookingSite(reason: string): Promise<void> {
  const siteUrl = process.env.VILLA_SITE_URL;
  const secret = process.env.VILLA_SITE_REVALIDATE_SECRET;

  // Not configured (local development, or a deployment with no guest site):
  // nothing to purge, and not an error.
  if (!siteUrl || !secret) return;

  try {
    const response = await fetch(new URL('/api/revalidate', siteUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      (await getLogger()).error(
        { reason, status: response.status },
        'villa booking site revalidation refused',
      );
    }
  } catch (error) {
    (await getLogger()).error(
      { reason, error: error instanceof Error ? error.message : String(error) },
      'villa booking site revalidation failed',
    );
  }
}
