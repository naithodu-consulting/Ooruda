'use client';

import * as React from 'react';

import { XIcon } from 'lucide-react';

import { Badge } from '#components/badge';
import { Button } from '#components/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '#components/combobox';
import { cn } from '#lib/utils';

/**
 * Multi-select, built on the same Base UI `Combobox` as `SearchableSelect`.
 *
 * It previously composed a `Popover` around a hand-rolled list of `<button>`s,
 * which predated the Combobox primitive and drifted from the rest of the UI in
 * three visible ways: a 14px chevron where `Select` uses 16px, a 12px tick
 * inside a hand-drawn box where `Select` uses a bare 16px tick, and no
 * arrow-key navigation — every option was a tab stop, so reaching the last of
 * 64 units meant 64 presses of Tab.
 *
 * The public API is unchanged, so existing callers need no edits. `searchable`
 * is new and opt-in: use it for lists that grow with the data (units, people),
 * and leave it off for fixed lists, where a search field is friction.
 */

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional icon rendered before the label */
  icon?: React.ReactNode;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onSelectionChange: (values: string[]) => void;
  /** Shown on the trigger when nothing is selected — treated as "All" */
  placeholder: string;
  /** Short label used in "Label: N selected" summary — e.g. "Bill Type" */
  summaryLabel?: string;
  /** Max individual labels shown in trigger before switching to "N selected" */
  maxShownLabels?: number;
  /** Adds a filter field above the list. For lists that grow with the data. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  'data-test'?: string;
}

export function MultiSelect({
  options,
  selected,
  onSelectionChange,
  placeholder,
  summaryLabel,
  maxShownLabels = 2,
  searchable,
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches found',
  className,
  disabled,
  'data-test': dataTest,
}: MultiSelectProps) {
  const selectedOptions = React.useMemo(
    () => options.filter((option) => selected.includes(option.value)),
    [options, selected],
  );

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onSelectionChange([]);
  }

  // Build trigger label
  let triggerLabel: React.ReactNode;
  if (selected.length === 0) {
    triggerLabel = <span className="text-muted-foreground">{placeholder}</span>;
  } else if (selected.length <= maxShownLabels) {
    const labels = selected.map(
      (v) => options.find((o) => o.value === v)?.label ?? v,
    );
    triggerLabel = (
      <span className="flex items-center gap-1 truncate">
        {summaryLabel && (
          <span className="text-muted-foreground shrink-0">
            {summaryLabel}:
          </span>
        )}
        <span className="truncate">{labels.join(', ')}</span>
      </span>
    );
  } else {
    triggerLabel = (
      <span className="flex items-center gap-1">
        {summaryLabel && (
          <span className="text-muted-foreground shrink-0">
            {summaryLabel}:
          </span>
        )}
        <Badge
          variant="secondary"
          className="rounded-sm px-1 py-0 text-xs font-semibold"
        >
          {selected.length} selected
        </Badge>
      </span>
    );
  }

  return (
    <Combobox
      multiple
      items={options}
      value={selectedOptions}
      onValueChange={(next: MultiSelectOption[]) =>
        onSelectionChange(next.map((option) => option.value))
      }
      itemToStringLabel={(option: MultiSelectOption) => option.label}
      disabled={disabled}
    >
      {/*
       * The clear button stays OUTSIDE the trigger <Button> to avoid nesting
       * interactive elements inside a button — an HTML spec violation that
       * causes accessibility tree errors and erratic touch behavior.
       * Absolute positioning keeps the layout identical to the previous design.
       */}
      <div className={cn('relative inline-flex', className)}>
        <ComboboxTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              data-test={dataTest}
              className={cn(
                // `bg-transparent` matches SelectTrigger, which takes on the
                // surface it sits on rather than the Button variant's cream.
                'h-9 w-full max-w-[220px] min-w-[120px] justify-between gap-1.5 bg-transparent px-3 font-normal',
                selected.length > 0 && 'pr-14',
              )}
            />
          }
        >
          <span className="flex min-w-0 flex-1 items-center truncate">
            {triggerLabel}
          </span>
        </ComboboxTrigger>

        {selected.length > 0 && (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={clear}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-7 -translate-y-1/2 rounded p-0.5 transition-colors focus-visible:ring-1 focus-visible:outline-none"
          >
            <XIcon className="size-3" />
          </button>
        )}
      </div>

      <ComboboxContent>
        {searchable ? (
          <ComboboxInput
            placeholder={searchPlaceholder}
            showTrigger={false}
            data-test={dataTest ? `${dataTest}-search` : undefined}
          />
        ) : null}

        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>

        <ComboboxList>
          {(option: MultiSelectOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.icon && (
                <span className="text-muted-foreground shrink-0">
                  {option.icon}
                </span>
              )}
              <span className="truncate">{option.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>

        {selected.length > 0 && (
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelectionChange([])}
              className="text-muted-foreground w-full justify-center text-xs font-normal"
              data-test={dataTest ? `${dataTest}-clear` : undefined}
            >
              Clear selection
            </Button>
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
