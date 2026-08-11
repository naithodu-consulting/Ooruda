'use client';

import * as React from 'react';

import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';

import { Badge } from '#components/badge';
import { Button } from '#components/button';
import { PopoverContent, Popover, PopoverTrigger } from '#components/popover';
import { cn } from '#lib/utils';

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
  className,
  disabled,
  'data-test': dataTest,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  function toggle(value: string) {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onSelectionChange(next);
  }

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
    <Popover open={open} onOpenChange={setOpen}>
      {/*
       * The clear button is placed OUTSIDE the PopoverTrigger <Button> to avoid
       * nesting interactive elements inside a button — an HTML spec violation that
       * causes accessibility tree errors and erratic touch behavior.
       * Absolute positioning keeps the layout identical to the previous design.
       */}
      <div className={cn('relative inline-flex', className)}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              role="combobox"
              aria-expanded={open}
              aria-haspopup="listbox"
              disabled={disabled}
              data-test={dataTest}
              className={cn(
                'h-9 w-full max-w-[220px] min-w-[120px] justify-between gap-1.5 px-3 font-normal',
                selected.length > 0 && 'pr-14',
              )}
            >
              <span className="flex min-w-0 flex-1 items-center truncate">
                {triggerLabel}
              </span>
              <ChevronDownIcon className="text-muted-foreground size-3.5 shrink-0" />
            </Button>
          }
        />
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

      <PopoverContent align="start" sideOffset={4} className="w-52 p-1">
        <div
          role="listbox"
          aria-multiselectable="true"
          className="flex flex-col"
        >
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(option.value)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                  'hover:bg-accent focus-visible:bg-accent outline-none',
                  isSelected && 'font-medium',
                )}
              >
                {/* Checkbox visual */}
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input',
                  )}
                >
                  {isSelected && <CheckIcon className="size-3" />}
                </span>

                {option.icon && (
                  <span className="text-muted-foreground shrink-0">
                    {option.icon}
                  </span>
                )}

                <span className="truncate">{option.label}</span>
              </button>
            );
          })}

          {selected.length > 0 && (
            <>
              <div className="my-1 border-t" />
              <button
                type="button"
                onClick={() => {
                  onSelectionChange([]);
                  setOpen(false);
                }}
                className="text-muted-foreground hover:text-foreground hover:bg-accent flex w-full cursor-pointer items-center justify-center rounded-md px-2.5 py-1.5 text-xs transition-colors"
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
