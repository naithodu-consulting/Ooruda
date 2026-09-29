'use client';

// Wraps the shadcn `FormMessage` to translate error messages via i18n.
// Lives outside `shadcn/form.tsx` so that file stays upstream-equivalent
// and can be replaced by the shadcn CLI (e.g. when switching themes).

import * as React from 'react';

import { useRender } from '@base-ui/react/use-render';

import { cn } from '../lib/utils';
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  useFormField,
} from '../shadcn/form';
import { Trans } from './trans';

// Replaces the shadcn FormControl, which sets aria-labelledby to the control's
// OWN id: the field then labels itself, and its accessible name becomes its
// value ("12000") instead of its label ("Weekday nights"). Without that
// attribute, FormLabel's htmlFor={formItemId} names the control correctly.
// Otherwise identical. Pass the field via `render` so the id and aria props
// land on the real input: <FormControl render={<Input {...field} />} />.
const FormControl: React.FC<
  React.PropsWithChildren & {
    className?: string;
    render?: React.ReactElement;
  }
> = ({ ...props }) => {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return useRender({
    defaultTagName: 'div',
    render: props.render,
    props: {
      ...props,
      id: formItemId,
      'aria-describedby': !error
        ? `${formDescriptionId}`
        : `${formDescriptionId} ${formMessageId}`,
      'aria-invalid': !!error,
      className: cn(props.className),
      children: props.children,
    },
  });
};
FormControl.displayName = 'FormControl';

const FormMessage: React.FC<
  React.ComponentPropsWithRef<'p'> & { params?: Record<string, unknown> }
> = ({ className, children, params = {}, ...props }) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message) : children;

  if (!body) {
    return null;
  }

  return (
    <p
      id={formMessageId}
      className={cn('text-destructive text-xs font-medium', className)}
      {...props}
    >
      {typeof body === 'string' ? (
        <Trans i18nKey={body} defaults={body} values={params} />
      ) : (
        body
      )}
    </p>
  );
};
FormMessage.displayName = 'FormMessage';

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
