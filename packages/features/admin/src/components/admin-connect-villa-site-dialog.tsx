'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@kit/ui/form';
import { useAsyncDialog } from '@kit/ui/hooks/use-async-dialog';
import { If } from '@kit/ui/if';
import { Input } from '@kit/ui/input';
import { toast } from '@kit/ui/sonner';

import { connectVillaSiteAction } from '../lib/server/admin-server-actions';
import {
  ConnectVillaSiteSchema,
  type ConnectVillaSiteSchemaType,
} from '../lib/server/schema/connect-villa-site.schema';

/**
 * Super-admin: link a villa account to a property on its booking site
 * (villa-booking database). The service key is sent once, stored in Vault and
 * never displayed again; re-running this with a new key rotates it.
 */
export function AdminConnectVillaSiteDialog(
  props: React.PropsWithChildren<{
    accountId: string;
    /** Re-link this disconnected property (keeps its settings). */
    propertyId?: string;
    defaultSlug?: string;
    defaultUrl?: string;
  }>,
) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();

  const form = useForm({
    resolver: zodResolver(ConnectVillaSiteSchema),
    defaultValues: {
      accountId: props.accountId,
      propertyId: props.propertyId,
      name: '',
      siteUrl: props.defaultUrl ?? '',
      serviceKey: '',
      siteSlug: props.defaultSlug ?? '',
    },
    mode: 'onChange',
  });

  const { execute, result } = useAction(connectVillaSiteAction, {
    onExecute: () => setIsPending(true),
    onSuccess: () => {
      toast.success('Booking site connected');
      form.reset({ ...form.getValues(), serviceKey: '' });
      setIsPending(false);
      setOpen(false);
    },
    onSettled: () => setIsPending(false),
  });

  const error = result.serverError;

  return (
    <AlertDialog
      open={dialogProps.open}
      onOpenChange={dialogProps.onOpenChange}
    >
      <AlertDialogTrigger render={props.children as React.ReactElement} />

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Connect booking site</AlertDialogTitle>

          <AlertDialogDescription>
            Link this villa to its property on the guest booking site. The
            connection is checked before anything is saved. The key is stored
            encrypted and is never shown again.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Form {...form}>
          <form
            data-test={'admin-connect-villa-site-form'}
            className={'flex flex-col space-y-4'}
            onSubmit={form.handleSubmit((data: ConnectVillaSiteSchemaType) =>
              execute(data),
            )}
          >
            <If condition={!!error}>
              <Alert variant={'destructive'}>
                <AlertTitle>Not connected</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </If>

            <FormField
              name={'siteUrl'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Booking site database URL</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      data-test={'admin-villa-site-url'}
                      placeholder={'https://xxxx.supabase.co'}
                      autoComplete={'off'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name={'serviceKey'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service role key</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type={'password'}
                      data-test={'admin-villa-site-key'}
                      autoComplete={'new-password'}
                      spellCheck={false}
                    />
                  </FormControl>
                  <FormDescription>
                    From that project&apos;s API settings. Stored in Vault.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name={'siteSlug'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property slug on the site</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      data-test={'admin-villa-site-slug'}
                      placeholder={'villa-19'}
                      autoComplete={'off'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name={'name'}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name in Ooruda (optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      data-test={'admin-villa-site-name'}
                      placeholder={'Defaults to the name on the site'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>

              <Button
                disabled={isPending}
                type={'submit'}
                data-test={'admin-villa-site-submit'}
              >
                {isPending ? 'Checking…' : 'Connect'}
              </Button>
            </AlertDialogFooter>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
