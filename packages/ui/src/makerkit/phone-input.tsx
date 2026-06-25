'use client';

import * as React from 'react';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/input-group';
import { cn } from '#lib/utils';

/**
 * India-locked phone input.
 *
 * Renders a fixed, non-editable `+91` prefix and accepts only the 10-digit
 * national number. The underlying phone utilities (`normalizePhoneNumber` /
 * `formatPhoneNumber`) already support any country in E.164 form — this
 * component deliberately constrains *entry* to India for now to avoid mistakes
 * before international onboarding goes live. To enable other countries later,
 * swap this for a country-aware input; the parsing/validation layer needs no
 * changes.
 *
 * The emitted value is the bare 10-digit national number (e.g. `9911000006`).
 * Server actions / schemas normalize it to E.164 (`+919911000006`) with India
 * as the default region.
 */
export interface PhoneInputProps extends Omit<
  React.ComponentProps<typeof InputGroupInput>,
  'value' | 'onChange' | 'type'
> {
  value?: string;
  onChange?: (value: string) => void;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ value, onChange, className, ...props }, ref) {
    // Tolerate a full E.164 value being passed in (e.g. prefill) by showing
    // only the last 10 national digits.
    const national = (value ?? '').replace(/\D/g, '').slice(-10);

    return (
      <InputGroup className={cn('bg-background w-full', className)}>
        <InputGroupAddon align="inline-start">
          <span className="text-muted-foreground text-sm font-medium">+91</span>
        </InputGroupAddon>

        <InputGroupInput
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={10}
          value={national}
          onChange={(e) =>
            onChange?.(e.target.value.replace(/\D/g, '').slice(0, 10))
          }
          {...props}
        />
      </InputGroup>
    );
  },
);
