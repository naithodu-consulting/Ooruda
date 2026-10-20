'use client';

import { useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { toast } from '@kit/ui/sonner';

import {
  AmcReminderSettingsSchema,
  REMINDER_DAY_OPTIONS,
  type AmcReminderSettingsInput,
} from '../_lib/schemas/amc.schema';
import { updateAmcReminderSettingsAction } from '../_lib/server/amc-actions';

interface Props {
  associationId: string;
  remindDaysBefore: number;
}

export function AmcSettings({ associationId, remindDaysBefore }: Props) {
  const [, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(AmcReminderSettingsSchema),
    defaultValues: { associationId, remindDaysBefore },
  });

  const { execute, isPending } = useAction(updateAmcReminderSettingsAction, {
    onSuccess: () => toast.success('Reminder settings saved.'),
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Failed to save settings.'),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onSubmit(values: any) {
    startTransition(() => execute(values as AmcReminderSettingsInput));
  }

  return (
    <div className={'max-w-md'}>
      <Card>
        <CardHeader>
          <CardTitle>Renewal Reminder Settings</CardTitle>
          <CardDescription>
            Set how many days before expiry all association admins receive an
            email reminder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className={'flex flex-col gap-y-4'}
            >
              <FormField
                control={form.control}
                name={'remindDaysBefore'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Send reminder X days before expiry</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={String(field.value)}
                    >
                      <FormControl>
                        <SelectTrigger data-test={'remind-days-select'}>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REMINDER_DAY_OPTIONS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} days before
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type={'submit'}
                disabled={isPending}
                data-test={'save-settings-btn'}
              >
                {isPending ? 'Saving…' : 'Save Settings'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
