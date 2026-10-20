import 'server-only';

/**
 * Validates that a logo URL is an absolute HTTPS URL pointing to a
 * public host. Rejects private/internal URLs to prevent SSRF - the
 * @react-pdf/renderer <Image> component fetches this URL server-side.
 */
export function sanitizeLogoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    const h = parsed.hostname;
    if (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '0.0.0.0' ||
      h.endsWith('.local') ||
      /^10\.\d+\.\d+\.\d+$/.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h) ||
      /^192\.168\.\d+\.\d+$/.test(h) ||
      /^169\.254\.\d+\.\d+$/.test(h) ||
      /^fd[0-9a-f]{2}:/i.test(h)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
