'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AlertDialogCancel } from '@kit/ui/alert-dialog';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
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
import { Trans } from '@kit/ui/trans';

import { RoleSchema } from '../../schema/update-member-role.schema';
import { updateMemberRoleAction } from '../../server/actions/team-members-server-actions';
import { MembershipRoleSelector } from './membership-role-selector';
import { RolesDataProvider } from './roles-data-provider';

type Role = string;

export function UpdateMemberRoleDialog({
  open,
  onOpenChange,
  userId,
  teamAccountId,
  userRole,
  userRoleHierarchy,
  isSuperAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  teamAccountId: string;
  userRole: Role;
  userRoleHierarchy: number;
  isSuperAdmin?: boolean;
}) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open,
    onOpenChange,
  });

  return (
    <Dialog {...dialogProps}>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            <Trans i18nKey={'teams.updateMemberRoleModalHeading'} />
          </DialogTitle>

          <DialogDescription>
            <Trans i18nKey={'teams.updateMemberRoleModalDescription'} />
          </DialogDescription>
        </DialogHeader>

        <RolesDataProvider maxRoleHierarchy={userRoleHierarchy}>
          {(data) => {
            const filteredRoles = isSuperAdmin
              ? data
              : data.filter((role) => ['prop_owner', 'tenant'].includes(role));

            return (
              <UpdateMemberForm
                userId={userId}
                teamAccountId={teamAccountId}
                userRole={userRole}
                roles={filteredRoles}
                isPending={isPending}
                setIsPending={setIsPending}
                onSuccess={() => {
                  setIsPending(false);
                  setOpen(false);
                }}
              />
            );
          }}
        </RolesDataProvider>
      </DialogContent>
    </Dialog>
  );
}

function UpdateMemberForm({
  userId,
  userRole,
  teamAccountId,
  roles,
  isPending,
  setIsPending,
  onSuccess,
}: React.PropsWithChildren<{
  userId: string;
  userRole: Role;
  teamAccountId: string;
  roles: Role[];
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onSuccess: () => unknown;
}>) {
  const t = useTranslations('teams');

  const { execute, hasErrored } = useAction(updateMemberRoleAction, {
    onExecute: () => setIsPending(true),
    onSuccess: () => onSuccess(),
    onSettled: () => setIsPending(false),
  });

  const form = useForm({
    resolver: zodResolver(
      RoleSchema.refine(
        (data) => {
          return data.role !== userRole;
        },
        {
          message: t(`roleMustBeDifferent`),
          path: ['role'],
        },
      ),
    ),
    reValidateMode: 'onChange',
    mode: 'onChange',
    defaultValues: {
      role: userRole,
    },
  });

  return (
    <Form {...form}>
      <form
        data-test={'update-member-role-form'}
        onSubmit={form.handleSubmit(({ role }) => {
          execute({
            accountId: teamAccountId,
            userId,
            role,
          });
        })}
        className={'flex w-full flex-col space-y-6'}
      >
        <If condition={hasErrored}>
          <UpdateRoleErrorAlert />
        </If>

        <FormField
          name={'role'}
          render={({ field }) => {
            return (
              <FormItem>
                <FormLabel>{t('roleLabel')}</FormLabel>

                <FormControl>
                  <MembershipRoleSelector
                    triggerClassName={'w-full'}
                    roles={roles}
                    currentUserRole={userRole}
                    value={field.value}
                    onChange={(newRole) => {
                      if (newRole) {
                        form.setValue('role', newRole);
                      }
                    }}
                  />
                </FormControl>

                <FormDescription>{t('updateRoleDescription')}</FormDescription>

                <FormMessage />
              </FormItem>
            );
          }}
        />

        <div className="flex justify-end gap-x-2">
          <AlertDialogCancel disabled={isPending}>
            <Trans i18nKey={'common.cancel'} />
          </AlertDialogCancel>

          <Button
            type="submit"
            data-test={'confirm-update-member-role'}
            disabled={isPending}
          >
            <Trans i18nKey={'teams.updateRoleSubmitLabel'} />
          </Button>
        </div>
      </form>
    </Form>
  );
}

function UpdateRoleErrorAlert() {
  return (
    <Alert variant={'destructive'}>
      <AlertTitle>
        <Trans i18nKey={'teams.updateRoleErrorHeading'} />
      </AlertTitle>

      <AlertDescription>
        <Trans i18nKey={'teams.updateRoleErrorMessage'} />
      </AlertDescription>
    </Alert>
  );
}
