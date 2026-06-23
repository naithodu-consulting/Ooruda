import { zodResolver } from '@hookform/resolvers/zod';
import { Phone, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

import { Database } from '@kit/supabase/database';
import { Button } from '@kit/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@kit/ui/form';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@kit/ui/input-group';
import { toast } from '@kit/ui/sonner';
import { Trans } from '@kit/ui/trans';

import { useUpdateAccountData } from '../../hooks/use-update-account';
import { AccountDetailsSchema } from '../../schema/account-details.schema';

type UpdateUserDataParams = Database['public']['Tables']['accounts']['Update'];

export function UpdateAccountDetailsForm({
  displayName,
  phone,
  onUpdate,
  userId,
}: {
  displayName: string;
  phone: string;
  userId: string;
  onUpdate: (user: Partial<UpdateUserDataParams>) => void;
}) {
  const updateAccountMutation = useUpdateAccountData(userId);
  const t = useTranslations('account');

  const form = useForm({
    resolver: zodResolver(AccountDetailsSchema),
    defaultValues: {
      displayName,
    },
  });

  const onSubmit = ({ displayName }: { displayName: string }) => {
    const data = { name: displayName };

    const promise = updateAccountMutation.mutateAsync(data).then(() => {
      onUpdate(data);
    });

    return toast.promise(() => promise, {
      success: t(`updateProfileSuccess`),
      error: t(`updateProfileError`),
      loading: t(`updateProfileLoading`),
    });
  };

  return (
    <div className={'flex flex-col space-y-8'}>
      <Form {...form}>
        <form
          data-test={'update-account-name-form'}
          className={'flex flex-col space-y-4'}
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            name={'displayName'}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <InputGroup className="dark:bg-background">
                    <InputGroupAddon align="inline-start">
                      <User className="h-4 w-4" />
                    </InputGroupAddon>

                    <InputGroupInput
                      data-test={'account-display-name'}
                      minLength={2}
                      placeholder={t('name')}
                      maxLength={100}
                      {...field}
                    />
                  </InputGroup>
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />

          <FormItem>
            <FormControl>
              <InputGroup className="bg-muted/50 cursor-not-allowed">
                <InputGroupAddon align="inline-start">
                  <Phone className="text-muted-foreground h-4 w-4" />
                </InputGroupAddon>

                <InputGroupInput
                  value={phone || 'N/A'}
                  disabled
                  className="text-muted-foreground cursor-not-allowed bg-transparent"
                  placeholder="Phone Number"
                />
              </InputGroup>
            </FormControl>
          </FormItem>

          <div>
            <Button type="submit" disabled={updateAccountMutation.isPending}>
              <Trans i18nKey={'account.updateProfileSubmitLabel'} />
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
