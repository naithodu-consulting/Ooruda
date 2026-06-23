'use client';

import { useMemo, useState } from 'react';

import { ColumnDef } from '@tanstack/react-table';
import { Ellipsis } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { Database } from '@kit/supabase/database';
import { Badge } from '@kit/ui/badge';
import { badgeExtras } from '@kit/ui/badge-extras';
import { Button } from '@kit/ui/button';
import { DataTable } from '@kit/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { If } from '@kit/ui/if';
import { Input } from '@kit/ui/input';
import { ProfileAvatar } from '@kit/ui/profile-avatar';
import { Trans } from '@kit/ui/trans';

import { RoleBadge } from '../members/role-badge';
import { DeleteInvitationDialog } from './delete-invitation-dialog';
import { RenewInvitationDialog } from './renew-invitation-dialog';
import { UpdateInvitationDialog } from './update-invitation-dialog';

type Invitations =
  Database['public']['Functions']['get_account_invitations']['Returns'];

type AccountInvitationsTableProps = {
  invitations: Invitations;

  permissions: {
    canUpdateInvitation: boolean;
    canRemoveInvitation: boolean;
    currentUserRoleHierarchy: number;
    isSuperAdmin?: boolean;
  };
};

export function AccountInvitationsTable({
  invitations,
  permissions,
}: AccountInvitationsTableProps) {
  const t = useTranslations('teams');
  const [search, setSearch] = useState('');
  const columns = useGetColumns(permissions);

  const filteredInvitations = invitations.filter((member) => {
    const searchString = search.toLowerCase();

    const identifier = (member.email ?? '').toLowerCase();

    return (
      identifier.includes(searchString) ||
      member.role.toLowerCase().includes(searchString)
    );
  });

  return (
    <div className={'flex flex-col space-y-2'}>
      <Input
        value={search}
        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        placeholder={t(`searchInvitations`)}
      />

      <DataTable
        data-cy={'invitations-table'}
        columns={columns}
        data={filteredInvitations}
      />
    </div>
  );
}

function useGetColumns(permissions: {
  canUpdateInvitation: boolean;
  canRemoveInvitation: boolean;
  currentUserRoleHierarchy: number;
}): ColumnDef<Invitations[0]>[] {
  const t = useTranslations('teams');
  const format = useFormatter();

  return useMemo(
    () => [
      {
        header: t('phoneLabel'),
        size: 200,
        cell: ({ row }) => {
          const member = row.original;
          // `get_account_invitations` returns the phone number (for phone
          // invites) coalesced into the `email` field, so this is the
          // invitee's contact identifier in this phone-OTP app.
          const identifier = member.email ?? '';

          return (
            <span
              data-test={'invitation-email'}
              className={'flex items-center gap-x-2 text-left'}
            >
              <span>
                <ProfileAvatar text={identifier} />
              </span>

              <span>{identifier}</span>
            </span>
          );
        },
      },
      {
        header: t('roleLabel'),
        cell: ({ row }) => {
          const { role } = row.original;

          return <RoleBadge role={role} />;
        },
      },
      {
        header: t('invitedAtLabel'),
        cell: ({ row }) => {
          return format.dateTime(new Date(row.original.created_at), {
            dateStyle: 'medium',
          });
        },
      },
      {
        header: t('expiresAtLabel'),
        cell: ({ row }) => {
          return format.dateTime(new Date(row.original.expires_at), {
            dateStyle: 'medium',
          });
        },
      },
      {
        header: t('inviteStatus'),
        cell: ({ row }) => {
          const isExpired = getIsInviteExpired(row.original.expires_at);

          if (isExpired) {
            return (
              <Badge className={badgeExtras.warning}>{t('expired')}</Badge>
            );
          }

          return <Badge className={badgeExtras.success}>{t('active')}</Badge>;
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => (
          <ActionsDropdown
            permissions={permissions}
            invitation={row.original}
          />
        ),
      },
    ],
    [permissions, t, format],
  );
}

function ActionsDropdown({
  permissions,
  invitation,
}: {
  permissions: AccountInvitationsTableProps['permissions'];
  invitation: Invitations[0];
}) {
  const [isDeletingInvite, setIsDeletingInvite] = useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [isRenewingInvite, setIsRenewingInvite] = useState(false);

  if (!permissions.canUpdateInvitation && !permissions.canRemoveInvitation) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant={'ghost'} size={'icon'}>
              <Ellipsis className={'h-5 w-5'} />
            </Button>
          }
        />

        <DropdownMenuContent className="min-w-52">
          <If condition={permissions.canUpdateInvitation}>
            <DropdownMenuItem
              data-test={'update-invitation-trigger'}
              onClick={() => setIsUpdatingRole(true)}
            >
              <Trans i18nKey={'teams.updateInvitation'} />
            </DropdownMenuItem>

            <If condition={getIsInviteExpired(invitation.expires_at)}>
              <DropdownMenuItem
                data-test={'renew-invitation-trigger'}
                onClick={() => setIsRenewingInvite(true)}
              >
                <Trans i18nKey={'teams.renewInvitation'} />
              </DropdownMenuItem>
            </If>
          </If>

          <If condition={permissions.canRemoveInvitation}>
            <DropdownMenuItem
              data-test={'remove-invitation-trigger'}
              variant="destructive"
              onClick={() => setIsDeletingInvite(true)}
            >
              <Trans i18nKey={'teams.removeInvitation'} />
            </DropdownMenuItem>
          </If>
        </DropdownMenuContent>
      </DropdownMenu>

      <If condition={isDeletingInvite}>
        <DeleteInvitationDialog
          isOpen
          setIsOpen={setIsDeletingInvite}
          invitationId={invitation.id}
        />
      </If>

      <If condition={isUpdatingRole}>
        <UpdateInvitationDialog
          isOpen
          setIsOpen={setIsUpdatingRole}
          invitationId={invitation.id}
          userRole={invitation.role}
          userRoleHierarchy={permissions.currentUserRoleHierarchy}
          isSuperAdmin={permissions.isSuperAdmin}
        />
      </If>

      <If condition={isRenewingInvite}>
        <RenewInvitationDialog
          isOpen
          setIsOpen={setIsRenewingInvite}
          invitationId={invitation.id}
          email={invitation.email}
        />
      </If>
    </>
  );
}

function getIsInviteExpired(isoExpiresAt: string) {
  const currentIsoTime = new Date().toISOString();

  const isoExpiresAtDate = new Date(isoExpiresAt);
  const currentIsoTimeDate = new Date(currentIsoTime);

  return isoExpiresAtDate < currentIsoTimeDate;
}
