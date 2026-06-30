'use client';

import * as React from 'react';

import {
  type CountryCode,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../shadcn/select';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/input-group';
import { cn } from '#lib/utils';

/** Convert a 2-letter country code to its flag emoji. */
function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

/** Resolve a country name using the browser's built-in Intl API. */
const displayNames =
  typeof Intl !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function countryName(code: string): string {
  return displayNames?.of(code) ?? code;
}

// Preferred countries to show at the top of the dropdown.
const PREFERRED: CountryCode[] = ['IN', 'AE', 'US', 'GB', 'SG', 'CA', 'AU'];

const ALL: CountryCode[] = getCountries();

const SORTED_COUNTRIES: CountryCode[] = [
  ...PREFERRED.filter((c) => ALL.includes(c)),
  ...ALL.filter((c) => !PREFERRED.includes(c)).sort((a, b) =>
    countryName(a).localeCompare(countryName(b)),
  ),
];

const DEFAULT_COUNTRY: CountryCode = 'IN';

/** Parse an E.164 string into its country code and national number components. */
function parseE164(value: string): { country: CountryCode; national: string } {
  if (!value) return { country: DEFAULT_COUNTRY, national: '' };

  const parsed = parsePhoneNumberFromString(value);

  if (parsed?.country) {
    return {
      country: parsed.country as CountryCode,
      national: parsed.nationalNumber,
    };
  }

  // Unrecognised / partial value — don't extract digits (would include the
  // calling-code prefix and bleed into the national number field).
  return { country: DEFAULT_COUNTRY, national: '' };
}

export interface PhoneInputProps extends Omit<
  React.ComponentProps<typeof InputGroupInput>,
  'value' | 'onChange' | 'type'
> {
  /** E.164 value (e.g. `+919911000006`), or empty string / undefined. */
  value?: string;
  /** Called with the full E.164 string on every change. */
  onChange?: (value: string) => void;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ value, onChange, className, ...props }, ref) {
    const parsed = parseE164(value ?? '');
    const [country, setCountry] = React.useState<CountryCode>(parsed.country);
    const [national, setNational] = React.useState(parsed.national);

    // Track the last value we emitted so we can ignore the parent echo-back.
    // Without this, typing "+91" → parseE164 fallback → "91" leaks into the
    // national field on every keystroke.
    const lastEmitted = React.useRef<string>('');

    const emit = (c: CountryCode, n: string) => {
      const calling = getCountryCallingCode(c);
      const e164 = `+${calling}${n}`;
      lastEmitted.current = e164;
      onChange?.(e164);
    };

    // Sync only when the value changes from an external source (prefill, reset),
    // not when it's the echo of our own onChange call.
    React.useEffect(() => {
      if ((value ?? '') === lastEmitted.current) return;
      const p = parseE164(value ?? '');
      setCountry(p.country);
      setNational(p.national);
    }, [value]);

    const handleCountryChange = (code: CountryCode | null) => {
      if (!code) return;
      setCountry(code);
      emit(code, national);
    };

    const handleNationalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, '');
      setNational(digits);
      emit(country, digits);
    };

    return (
      <InputGroup className={cn('bg-background w-full', className)}>
        <InputGroupAddon align="inline-start" className="p-0">
          <Select value={country} onValueChange={handleCountryChange}>
            <SelectTrigger
              className="h-full min-w-0 rounded-none border-0 border-r bg-transparent px-2 shadow-none focus:ring-0"
              aria-label="Country code"
            >
              <SelectValue>
                <span className="flex items-center gap-1 text-sm">
                  <span>{countryFlag(country)}</span>
                  <span className="text-muted-foreground">
                    +{getCountryCallingCode(country)}
                  </span>
                </span>
              </SelectValue>
            </SelectTrigger>

            <SelectContent className="max-h-72 w-64">
              {SORTED_COUNTRIES.map((code) => (
                <SelectItem key={code} value={code}>
                  <span className="flex items-center gap-2">
                    <span>{countryFlag(code)}</span>
                    <span className="truncate">{countryName(code)}</span>
                    <span className="text-muted-foreground ml-auto text-xs">
                      +{getCountryCallingCode(code)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InputGroupAddon>

        <InputGroupInput
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={national}
          onChange={handleNationalChange}
          {...props}
        />
      </InputGroup>
    );
  },
);
