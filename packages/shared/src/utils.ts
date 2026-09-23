import {
  type CountryCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';

/**
 * Check if the code is running in a browser environment.
 */
export function isBrowser() {
  return typeof window !== 'undefined';
}

/**
 * @name formatCurrency
 * @description Format the currency based on the currency code
 */
export function formatCurrency(params: {
  currencyCode: string;
  locale: string;
  value: string | number;
}) {
  const [lang, region] = params.locale.split('-');

  return new Intl.NumberFormat(region ?? lang, {
    style: 'currency',
    currency: params.currencyCode,
  }).format(Number(params.value));
}

/**
 * @name DEFAULT_PHONE_COUNTRY
 * @description Default region for parsing inputs without an explicit country
 * code. The app's primary market is India, so a bare 10-digit number is treated
 * as Indian - but full E.164 numbers from any country are accepted too.
 */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'IN';

/**
 * @name normalizePhoneNumber
 * @description Normalize phone-ish input to canonical E.164 (e.g.
 * `+919911000006`, `+14155552671`). Numbers given in international form (with a
 * `+` country code) are validated against that country; numbers without a
 * country code fall back to `defaultCountry` (India by default). Returns `null`
 * when the input is not a valid phone number.
 */
export function normalizePhoneNumber(
  input: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): string | null {
  if (!input || !input.trim()) return null;

  const parsed = parsePhoneNumberFromString(input.trim(), defaultCountry);

  if (!parsed || !parsed.isValid()) return null;

  return parsed.number; // E.164, e.g. "+919911000006"
}

/**
 * @name formatPhoneNumber
 * @description Format a stored phone value for display in international form
 * (e.g. `+91 99110 00006`, `+1 415 555 2671`). Falls back to the raw value if
 * it isn't a recognisable number, and to an em dash when empty.
 */
export function formatPhoneNumber(
  value: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): string {
  if (!value || !value.trim()) return '-';

  const parsed = parsePhoneNumberFromString(value.trim(), defaultCountry);

  if (!parsed || !parsed.isValid()) return value;

  return parsed.formatInternational();
}

/**
 * @name isSafeRedirectPath
 * @description Checks if a path is safe for redirects (prevents open redirect attacks).
 * Safe paths must:
 * - Start with a single `/`
 * - NOT start with `//` (protocol-relative URLs)
 * - NOT contain `://` (absolute URLs)
 * - NOT contain backslash (URL normalization attacks)
 * - NOT contain ASCII control characters (tab/newline/CR are stripped by URL
 *   parsers/browsers and could otherwise smuggle an off-origin host)
 * - Resolve to the same origin when parsed (authoritative defense-in-depth check)
 */
export function isSafeRedirectPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;

  // Must start with exactly one forward slash (relative path)
  if (!path.startsWith('/') || path.startsWith('//')) return false;

  // Must not contain protocol indicators
  if (path.includes('://')) return false;

  // Must not contain backslashes (can be normalized to forward slashes)
  if (path.includes('\\')) return false;

  // Must not contain ASCII control characters (C0 range + DEL). Browsers and
  // the WHATWG URL parser strip tab/newline/CR before parsing, so a value such
  // as `/\t//evil.com` would otherwise pass the checks above yet resolve to an
  // off-origin URL.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;

  // Authoritative check: resolving the path against a fixed base must not
  // change the origin. Catches any residual off-origin trick the string checks
  // above might miss.
  try {
    const base = 'https://x.invalid';

    if (new URL(path, base).origin !== base) return false;
  } catch {
    return false;
  }

  return true;
}

/**
 * @name getSafeRedirectPath
 * @description Returns the path if safe, otherwise returns the fallback.
 * Use this to validate user-supplied redirect URLs to prevent open redirect attacks.
 */
export function getSafeRedirectPath(
  path: string | null | undefined,
  fallback: string,
): string {
  if (path && isSafeRedirectPath(path)) {
    return path;
  }

  return fallback;
}
