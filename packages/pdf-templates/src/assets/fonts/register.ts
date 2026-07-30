import { Font } from '@react-pdf/renderer';

import { NOTO_SANS_BOLD_BASE64, NOTO_SANS_REGULAR_BASE64 } from './font-data';

// Default PDF fonts (Helvetica, etc.) don't include the ₹ glyph (U+20B9).
// Noto Sans does, so we bundle a subset (latin letters/digits, punctuation,
// and ₹ only — keeps it small) and register it once per process.
let registered = false;

export function registerPdfFonts() {
  if (registered) return;

  Font.register({
    family: 'Noto Sans',
    fonts: [
      {
        src: `data:font/ttf;base64,${NOTO_SANS_REGULAR_BASE64}`,
        fontWeight: 'normal',
        fontStyle: 'normal',
      },
      {
        // No dedicated italic subset bundled — alias regular so react-pdf
        // resolves fontStyle:'italic' without throwing.
        src: `data:font/ttf;base64,${NOTO_SANS_REGULAR_BASE64}`,
        fontWeight: 'normal',
        fontStyle: 'italic',
      },
      {
        src: `data:font/ttf;base64,${NOTO_SANS_BOLD_BASE64}`,
        fontWeight: 'bold',
        fontStyle: 'normal',
      },
      {
        src: `data:font/ttf;base64,${NOTO_SANS_BOLD_BASE64}`,
        fontWeight: 'bold',
        fontStyle: 'italic',
      },
    ],
  });

  registered = true;
}
