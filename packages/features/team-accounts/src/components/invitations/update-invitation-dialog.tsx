'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
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
import { updateInvitationAction } from '../../server/actions/team-invitations-server-actions';
import { MembershipRoleSelector } from '../members/membership-role-selector';
import { RolesDataProvider } from '../members/roles-data-provider';

type Role = string;

export function UpdateInvitationDialog({
  isOpen,
  setIsOpen,
  invitationId,
  userRole,
  userRoleHierarchy,
  isSuperAdmin,
}: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  invitationId: number;
  userRole: Role;
  userRoleHierarchy: number;
  isSuperAdmin?: boolean;
}) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog({
    open: isOpen,
    onOpenChange: setIsOpen,
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

        <UpdateInvitationForm
          invitationId={invitationId}
          userRole={userRole}
          userRoleHierarchy={userRoleHierarchy}
          isPending={isPending}
          setIsPending={setIsPending}
          isSuperAdmin={isSuperAdmin}
          onSuccess={() => {
            setIsPending(false);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function UpdateInvitationForm({
  invitationId,
  userRole,
  userRoleHierarchy,
  isPending,
  setIsPending,
  onSuccess,
  isSuperAdmin,
}: React.PropsWithChildren<{
  invitationId: number;
  userRole: Role;
  userRoleHierarchy: number;
  isPending: boolean;
  setIsPending: (pending: boolean) => void;
  onSuccess: () => void;
  isSuperAdmin?: boolean;
}>) {
  const t = useTranslations('teams');

  const { execute, hasErrored } = useAction(updateInvitationAction, {
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
          message: t('roleMustBeDifferent'),
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
        data-test={'update-invitation-form'}
        onSubmit={form.handleSubmit(({ role }) => {
          execute({ invitationId, role });
        })}
        className={'flex flex-col space-y-6'}
      >
        <If condition={hasErrored}>
          <UpdateRoleErrorAlert />
        </If>

        <FormField
          name={'role'}
          render={({ field }) => {
            return (
              <FormItem>
                <FormLabel>
                  <Trans i18nKey={'teams.roleLabel'} />
                </FormLabel>

                <FormControl>
                  <RolesDataProvider maxRoleHierarchy={userRoleHierarchy}>
                    {(roles) => {
                      const filteredRoles =
                        isSuperAdmin ||
                        roles.some((role) => role.startsWith('villa_'))
                          ? roles
                          : roles.filter((role) =>
                              ['prop_owner', 'tenant'].includes(role),
                            );

                      return (
                        <MembershipRoleSelector
                          roles={filteredRoles}
                          currentUserRole={userRole}
                          value={field.value}
                          onChange={(newRole) => {
                            if (newRole) {
                              form.setValue(field.name, newRole);
                            }
                          }}
                        />
                      );
                    }}
                  </RolesDataProvider>
                </FormControl>

                <FormDescription>
                  <Trans i18nKey={'teams.updateRoleDescription'} />
                </FormDescription>

                <FormMessage />
              </FormItem>
            );
          }}
        />

        <Button type={'submit'} disabled={isPending}>
          <Trans i18nKey={'teams.updateRoleSubmitLabel'} />
        </Button>
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
