import { describe, expect, it } from 'vitest';

import { rupeesInWords } from './amount-words';

describe('rupeesInWords', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [5, 'Rupees Five Only'],
    [15, 'Rupees Fifteen Only'],
    [40, 'Rupees Forty Only'],
    [99, 'Rupees Ninety-Nine Only'],
    [100, 'Rupees One Hundred Only'],
    [1000, 'Rupees One Thousand Only'],
    [5000, 'Rupees Five Thousand Only'],
    [23600, 'Rupees Twenty-Three Thousand Six Hundred Only'],
    [100000, 'Rupees One Lakh Only'],
    [
      123456.5,
      'Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Fifty Paise Only',
    ],
    [10000000, 'Rupees One Crore Only'],
    [
      25075000.05,
      'Rupees Two Crore Fifty Lakh Seventy-Five Thousand and Five Paise Only',
    ],
  ])('%s → %s', (amount, words) => {
    expect(rupeesInWords(amount)).toBe(words);
  });

  it('rounds to paise without float drift', () => {
    expect(rupeesInWords(0.1 + 0.2)).toBe('Rupees Zero and Thirty Paise Only');
  });

  it('refuses nonsense', () => {
    expect(rupeesInWords(Number.NaN)).toBe('');
    expect(rupeesInWords(-1)).toBe('');
  });
});
