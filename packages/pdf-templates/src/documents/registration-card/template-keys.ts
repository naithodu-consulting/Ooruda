/**
 * The registration-card templates that exist, as plain strings.
 *
 * Separate from `registry.ts` (which maps these to React-PDF documents) so
 * that a server component can ask "does this villa have a card?" — and so
 * decide whether to render a download button — without statically importing
 * @react-pdf/renderer and its bundled fonts into the page. The renderer is
 * loaded lazily, once, only on a request that actually renders
 * (lib/server/pdf-renderer.ts).
 *
 * Exported through the package subpath `@kit/pdf-templates/registration-card-templates`.
 */

export const REGISTRATION_CARD_TEMPLATE_KEYS = ['villa19'] as const;

export type RegistrationCardTemplateKey =
  (typeof REGISTRATION_CARD_TEMPLATE_KEYS)[number];

/** True when this property's template key is one we can actually render. */
export function hasRegistrationCardTemplate(
  key: string | null | undefined,
): key is RegistrationCardTemplateKey {
  return (
    typeof key === 'string' &&
    (REGISTRATION_CARD_TEMPLATE_KEYS as readonly string[]).includes(key)
  );
}
