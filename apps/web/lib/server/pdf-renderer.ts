import 'server-only';

type PdfRenderer = typeof import('@kit/pdf-templates');

let renderer: Promise<PdfRenderer> | null = null;

/**
 * Lazily loads the PDF renderer (@react-pdf/renderer, fonts, templates) and
 * warms it up.
 *
 * Import it this way instead of statically so that:
 * - requests that never render (cache hits, auth failures) don't pay to load
 *   the renderer on a cold serverless instance, and
 * - routes that do render can start loading and warming it at the top of the
 *   handler, overlapping that one-off cost with their database round trips.
 *
 * Call it early without awaiting, then await it just before rendering.
 */
export function loadPdfRenderer(): Promise<PdfRenderer> {
  renderer ??= import('@kit/pdf-templates')
    .then(async (mod) => {
      await mod.warmPdfRenderer();
      return mod;
    })
    .catch((error: unknown) => {
      renderer = null;
      throw error;
    });

  return renderer;
}
