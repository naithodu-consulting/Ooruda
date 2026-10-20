'use client';

import * as React from 'react';

import { cn } from '../lib/utils';
import { Button } from '../shadcn/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '../shadcn/combobox';

/**
 * A Select that can be typed into.
 *
 * Use this wherever the option list grows with the data - units, billing
 * periods, eligible owners and tenants, associations, expense categories. A
 * plain Select is a fixed-height scrolling window, which stops working long
 * before the list stops growing: an association with 64 units already means
 * hunting through a 236px viewport with no way to type.
 *
 * Deliberately NOT for bounded lists. Payment modes, bill types and unit types
 * are four or five fixed options, and a search field above them is friction
 * rather than help - keep `Select` there.
 *
 * Composes the untouched `shadcn/combobox` (Base UI), so filtering, keyboard
 * navigation and the ARIA combobox/listbox wiring come from upstream.
 */

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Optional secondary text, shown muted beside the label. */
  meta?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  items: SearchableSelectOption[];
  /** Selected value. Empty string means nothing selected. */
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  contentClassName?: string;
  'data-test'?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  onBlur?: () => void;
}

export function SearchableSelect({
  items,
  value,
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches found',
  disabled,
  id,
  name,
  className,
  contentClassName,
  onBlur,
  ...aria
}: SearchableSelectProps) {
  const selected = React.useMemo(
    () => items.find((item) => item.value === value),
    [items, value],
  );

  return (
    <>
      {/*
        Mirrors the value into a hidden input so the control still contributes
        to a plain form post, matching what the `Select` it replaces did.
      */}
      {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}

      <Combobox
        items={items}
        value={selected ?? null}
        onValueChange={(item: SearchableSelectOption | null) => {
          onChange(item?.value ?? '');
          onBlur?.();
        }}
        itemToStringLabel={(item: SearchableSelectOption) => item.label}
        disabled={disabled}
      >
        <ComboboxTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              data-test={aria['data-test']}
              aria-label={aria['aria-label'] ?? placeholder}
              aria-invalid={aria['aria-invalid']}
              // `bg-transparent` matches SelectTrigger: the Button `outline`
              // variant hardcodes `bg-background` (cream), which reads as tan
              // next to the white Inputs beside it inside a dialog.
              className={cn(
                'w-full justify-between gap-2 bg-transparent font-normal',
                !selected && !value && 'text-muted-foreground',
                className,
              )}
            />
          }
        >
          <ComboboxValue>
            {(item: SearchableSelectOption | null) =>
              item ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{item.label}</span>
                  {item.meta ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {item.meta}
                    </span>
                  ) : null}
                </span>
              ) : (
                // A value with no matching item falls back to the raw value
                // rather than the placeholder. `items` can lag the value -
                // still loading, or the option was filtered out - and showing
                // the placeholder there reads as "nothing selected" for a
                // field that does hold one, hiding the mismatch from the user.
                <span className="truncate">{value || placeholder}</span>
              )
            }
          </ComboboxValue>
        </ComboboxTrigger>

        <ComboboxContent className={contentClassName}>
          <ComboboxInput
            placeholder={searchPlaceholder}
            showTrigger={false}
            data-test={
              aria['data-test'] ? `${aria['data-test']}-search` : undefined
            }
          />

          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>

          <ComboboxList>
            {(item: SearchableSelectOption) => (
              <ComboboxItem
                key={item.value}
                value={item}
                disabled={item.disabled}
              >
                <span className="truncate">{item.label}</span>
                {item.meta ? (
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {item.meta}
                  </span>
                ) : null}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </>
  );
}
