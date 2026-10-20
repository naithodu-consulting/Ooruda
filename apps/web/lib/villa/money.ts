/**
 * Rupee ↔ paise conversion — the ONLY place the villa module crosses units.
 *
 * Ooruda stores money as `numeric(12,2)` rupees everywhere. The villa-booking
 * database (the guest site's) requires integer paise (its integration
 * contract, rule 6). Everything that reads from or writes to that database
 * goes through these two functions; nothing else in Ooruda handles paise.
 *
 * Conversion is exact: amounts are parsed from their decimal string form, not
 * multiplied as floats (`0.29 * 100 === 28.999999999999996`).
 */

const RUPEES_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Rupees (number or numeric string with at most 2 decimals) → integer paise.
 * Throws on anything that is not an exact rupee amount, rather than rounding
 * a malformed value into a plausible-looking wrong one.
 */
export function toPaise(rupees: number | string): number {
  const text =
    typeof rupees === 'number' ? formatNumber(rupees) : rupees.trim();
  const match = RUPEES_PATTERN.exec(text);

  if (!match) {
    throw new Error(`Not an exact rupee amount: ${String(rupees)}`);
  }

  const [, sign, whole, fraction = ''] = match;
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  if (!Number.isSafeInteger(paise)) {
    throw new Error(`Rupee amount out of range: ${String(rupees)}`);
  }

  return sign ? -paise : paise;
}

/** Integer paise → rupees as a number with at most 2 decimals. */
export function fromPaise(paise: number): number {
  if (!Number.isInteger(paise)) {
    throw new Error(`Paise must be an integer: ${paise}`);
  }

  return Number(fromPaiseToString(paise));
}

/** Integer paise → exact `numeric(12,2)` string, e.g. 1450050 → "14500.50". */
export function fromPaiseToString(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error(`Paise must be an integer: ${paise}`);
  }

  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');

  return `${sign}${whole}.${fraction}`;
}

// A JS number like 14500.5 → "14500.5"; reject float noise such as
// 0.1 + 0.2 (0.30000000000000004) instead of silently truncating it.
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Not a finite amount: ${value}`);
  }

  const text = String(value);

  if (text.includes('e')) {
    throw new Error(`Amount out of range: ${value}`);
  }

  return text;
}
