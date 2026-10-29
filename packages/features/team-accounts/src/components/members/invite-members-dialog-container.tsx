'use client';

import React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAction } from 'next-safe-action/hooks';
import { useFieldArray, useForm } from 'react-hook-form';

import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@kit/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@kit/ui/form';
import { useAsyncDialog } from '@kit/ui/hooks/use-async-dialog';
import { If } from '@kit/ui/if';
import { Input } from '@kit/ui/input';
import { PhoneInput } from '@kit/ui/phone-input';
import { toast } from '@kit/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@kit/ui/tooltip';
import { Trans } from '@kit/ui/trans';

import { InviteMembersSchema } from '../../schema/invite-members.schema';
import { createInvitationsAction } from '../../server/actions/team-invitations-server-actions';
import { MembershipRoleSelector } from './membership-role-selector';
import { RolesDataProvider } from './roles-data-provider';

type InviteModel = {
  phone: string;
  role: Role;
  name: string;
  email: string;
};

type Role = string;

/**
 * The maximum number of invites that can be sent at once.
 * Useful to avoid spamming the server with too large payloads
 */
const MAX_INVITES = 5;

export function InviteMembersDialogContainer({
  accountSlug,
  userRoleHierarchy,
  isSuperAdmin,
  allowedRoles,
  children,
}: React.PropsWithChildren<{
  accountSlug: string;
  userRoleHierarchy: number;
  isSuperAdmin?: boolean;
  /** Roles the current user is permitted to invite (from assoc_admin_permissions). Ignored for super-admins. */
  allowedRoles?: string[];
}>) {
  const { dialogProps, isPending, setIsPending, setOpen } = useAsyncDialog();
  const t = useTranslations('teams');

  const { execute } = useAction(createInvitationsAction, {
    onExecute: () => setIsPending(true),
    onSuccess: ({ data }) => {
      if (data?.success) {
        toast.success(t('inviteMembersSuccessMessage'));
      } else {
        toast.error(t('inviteMembersErrorMessage'));
      }
    },
    onError: () => {
      toast.error(t('inviteMembersErrorMessage'));
    },
    onSettled: () => {
      setIsPending(false);
      setOpen(false);
    },
  });

  const isVillaWorkspace = (allowedRoles ?? []).some((role) =>
    role.startsWith('villa_'),
  );

  return (
    <Dialog {...dialogProps}>
      <DialogTrigger
        render={React.cloneElement(
          children as React.ReactElement<{ [key: string]: unknown }>,
          // Base UI's render prop merges data-slot differently in SSR vs
          // hydration, causing a mismatch between "dialog-trigger" (SSR) and
          // "button" (client). Pinning to "dialog-trigger" here makes both
          // paths consistent. The slot is not used in any CSS selector.
          { 'data-slot': 'dialog-trigger' },
        )}
      />

      <DialogContent className={'sm:max-w-lg'} showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>
            {isVillaWorkspace ? (
              'Invite Members to your Villa'
            ) : (
              <Trans i18nKey={'teams.inviteMembersHeading'} />
            )}
          </DialogTitle>

          <DialogDescription>
            <Trans i18nKey={'teams.inviteMembersDescription'} />
          </DialogDescription>
        </DialogHeader>

        {allowedRoles && allowedRoles.length > 0 ? (
          <InviteMembersForm
            pending={isPending}
            roles={allowedRoles}
            onSubmit={(data) => {
              execute({
                accountSlug,
                invitations: data.invitations,
              });
            }}
          />
        ) : (
          <RolesDataProvider maxRoleHierarchy={userRoleHierarchy}>
            {(roles) => {
              const filteredRoles = isSuperAdmin
                ? roles
                : roles.filter((role) => (allowedRoles ?? []).includes(role));

              return (
                <InviteMembersForm
                  pending={isPending}
                  roles={filteredRoles}
                  onSubmit={(data) => {
                    execute({
                      accountSlug,
                      invitations: data.invitations,
                    });
                  }}
                />
              );
            }}
          </RolesDataProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteMembersForm({
  onSubmit,
  roles,
  pending,
}: {
  onSubmit: (data: { invitations: InviteModel[] }) => void;
  pending: boolean;
  roles: string[];
}) {
  const t = useTranslations('teams');

  const defaultRole: Role = roles.includes('prop_owner')
    ? 'prop_owner'
    : roles.includes('villa_manager')
      ? 'villa_manager'
      : (roles[0] ?? '');

  const form = useForm({
    resolver: zodResolver(InviteMembersSchema),
    shouldUseNativeValidation: true,
    reValidateMode: 'onSubmit',
    defaultValues: {
      invitations: [createEmptyInviteModel(defaultRole)],
    },
  });

  const fieldArray = useFieldArray({
    control: form.control,
    name: 'invitations',
  });

  return (
    <Form {...form}>
      <form
        className={'flex flex-col space-y-4'}
        data-test={'invite-members-form'}
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="flex flex-col gap-y-2.5">
          {fieldArray.fields.map((field, index) => {
            const phoneInputName = `invitations.${index}.phone` as const;
            const roleInputName = `invitations.${index}.role` as const;
            const nameInputName = `invitations.${index}.name` as const;
            const emailInputName = `invitations.${index}.email` as const;

            return (
              <div
                className={'space-y-3 rounded-lg border p-4'}
                data-test={'invite-member-form-item'}
                key={field.id}
              >
                <div className={'flex items-center gap-x-2'}>
                  <FormField
                    name={phoneInputName}
                    render={({ field }) => (
                      <FormItem className="min-w-0 flex-1">
                        <FormControl>
                          <PhoneInput
                            data-test={'invite-phone-input'}
                            placeholder={t('phonePlaceholder')}
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    name={roleInputName}
                    render={({ field }) => {
                      return (
                        <FormItem>
                          <FormControl>
                            <MembershipRoleSelector
                              triggerClassName={'m-0 bg-muted'}
                              roles={roles}
                              value={field.value}
                              onChange={(role) => {
                                if (role) {
                                  form.setValue(field.name, role);
                                }
                              }}
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  {fieldArray.fields.length > 1 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant={'ghost'}
                              size={'icon'}
                              type={'button'}
                              data-test={'remove-invite-button'}
                              aria-label={t('removeInviteButtonLabel')}
                              onClick={() => {
                                fieldArray.remove(index);
                                form.clearErrors(phoneInputName);
                              }}
                            >
                              <X className={'h-4'} />
                            </Button>
                          }
                        />

                        <TooltipContent>
                          {t('removeInviteButtonLabel')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>

                <div className={'flex flex-col gap-y-2'}>
                  <FormField
                    name={nameInputName}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={'Full name'}
                            maxLength={255}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    name={emailInputName}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input
                            {...field}
                            type={'email'}
                            placeholder={'Email address'}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            );
          })}

          <If condition={fieldArray.fields.length < MAX_INVITES}>
            <div>
              <Button
                data-test={'add-new-invite-button'}
                type={'button'}
                variant={'link'}
                size={'sm'}
                disabled={pending}
                onClick={() => {
                  fieldArray.append(createEmptyInviteModel(defaultRole));
                }}
              >
                <Plus className={'mr-1 h-3'} />

                <span>
                  <Trans i18nKey={'teams.addAnotherMemberButtonLabel'} />
                </span>
              </Button>
            </div>
          </If>
        </div>

        <Button type={'submit'} disabled={pending}>
          <Trans
            i18nKey={
              pending
                ? 'teams.invitingMembers'
                : 'teams.inviteMembersButtonLabel'
            }
          />
        </Button>
      </form>
    </Form>
  );
}

function createEmptyInviteModel(defaultRole: Role) {
  return { phone: '', role: defaultRole, name: '', email: '' };
}
