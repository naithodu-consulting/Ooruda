import { Font } from '@react-pdf/renderer';

import { NOTO_SANS_BOLD_BASE64, NOTO_SANS_REGULAR_BASE64 } from './font-data';

// Default PDF fonts (Helvetica, etc.) don't include the ₹ glyph (U+20B9).
// Noto Sans does, so we bundle a subset (latin letters/digits, punctuation,
// and ₹ only - keeps it small) and register it once per process.
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
        // No dedicated italic subset bundled - alias regular so react-pdf
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

  // react-pdf hyphenates by default, which mangles unbreakable atoms: a phone
  // number "+919999999998" renders as "+-" / "919999999998" when its column is
  // narrow. Nothing we print (phones, emails, bill numbers, amounts) should ever
  // gain a hyphen, so opt out globally - long text still wraps at whitespace.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
