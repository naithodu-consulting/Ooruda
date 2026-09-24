'use client';

import * as React from 'react';

import { SelectContent as BaseSelectContent } from '../shadcn/select';

export {
  Select,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../shadcn/select';

/**
 * App-wide SelectContent.
 *
 * Upstream defaults to `alignItemWithTrigger`, the macOS-style popup that
 * overlays the trigger so the selected item sits on top of it. In forms that
 * hides the field label and helper text above the control and reads as a
 * different widget from SearchableSelect / MultiSelect, which drop below.
 * Default to a dropdown anchored under the trigger, start-aligned, instead.
 */
function SelectContent({
  alignItemWithTrigger = false,
  align = 'start',
  ...props
}: React.ComponentProps<typeof BaseSelectContent>) {
  return (
    <BaseSelectContent
      alignItemWithTrigger={alignItemWithTrigger}
      align={align}
      {...props}
    />
  );
}

export { SelectContent };
