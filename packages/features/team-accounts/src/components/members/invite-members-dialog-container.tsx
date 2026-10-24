'use client';

import React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAction } from 'next-safe-action/hooks';
import { useFieldArray, useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '@kit/ui/alert';
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
import { Spinner } from '@kit/ui/spinner';
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

  // Evaluate policies when dialog is open
  const {
    data: policiesResult,
    isLoading: isLoadingPolicies,
    error: policiesError,
  } = useFetchInvitationsPolicies({ accountSlug, isOpen: dialogProps.open });

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
            <Trans i18nKey={'teams.inviteMembersHeading'} />
          </DialogTitle>

          <DialogDescription>
            <Trans i18nKey={'teams.inviteMembersDescription'} />
          </DialogDescription>
        </DialogHeader>

        <If condition={isLoadingPolicies}>
          <div className="flex flex-col items-center justify-center gap-y-4 py-8">
            <Spinner className="h-6 w-6" />

            <span className="text-muted-foreground text-sm">
              <Trans i18nKey="teams.checkingPolicies" />
            </span>
          </div>
        </If>

        <If condition={policiesError}>
          <Alert variant="destructive">
            <AlertDescription>
              <Trans
                i18nKey="teams.policyCheckError"
                values={{ error: policiesError?.message }}
              />
            </AlertDescription>
          </Alert>
        </If>

        <If condition={policiesResult && !policiesResult.allowed}>
          <Alert variant="destructive">
            <AlertDescription>
              <Trans
                i18nKey={policiesResult?.reasons[0]}
                defaults={policiesResult?.reasons[0]}
              />
            </AlertDescription>
          </Alert>
        </If>

        <If condition={policiesResult?.allowed}>
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
        </If>
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

  const form = useForm({
    resolver: zodResolver(InviteMembersSchema),
    shouldUseNativeValidation: true,
    reValidateMode: 'onSubmit',
    defaultValues: {
      invitations: [createEmptyInviteModel()],
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
                  fieldArray.append(createEmptyInviteModel());
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

function createEmptyInviteModel() {
  return { phone: '', role: 'prop_owner' as Role, name: '', email: '' };
}

function useFetchInvitationsPolicies({
  accountSlug,
  isOpen,
}: {
  accountSlug: string;
  isOpen: boolean;
}) {
  return useQuery({
    queryKey: ['invitation-policies', accountSlug],
    queryFn: async () => {
      // This call is a best-effort PREFLIGHT to surface policy restrictions
      // before the user fills out the form. It is NOT the security gate:
      // createInvitationsAction independently enforces checkInvitationPermissions
      // and evaluateInvitationsPolicies server-side. So if the preflight endpoint
      // is unavailable (e.g. routing 404/500), we must degrade to "allowed" and
      // let the server action be the authority - never hard-block the dialog.
      const permissive = {
        allowed: true,
        reasons: [],
        metadata: { preflightSkipped: true },
      };

      try {
        const response = await fetch(`./members/policies`);

        if (!response.ok) {
          return permissive;
        }

        return response.json();
      } catch {
        return permissive;
      }
    },
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
