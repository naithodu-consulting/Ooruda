'use client';

import { useMemo, useState } from 'react';

import { ColumnDef } from '@tanstack/react-table';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';

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

import { RemoveMemberDialog } from './remove-member-dialog';
import { RoleBadge } from './role-badge';
import { TransferOwnershipDialog } from './transfer-ownership-dialog';
import { UpdateMemberRoleDialog } from './update-member-role-dialog';

type Member =
  Database['public']['Functions']['get_account_members']['Returns'][number] & {
    // Phone is merged in by the members-page loader from `profiles.mobile_number`
    // (this app is phone-OTP only, so there is no email to display).
    phone?: string | null;
  };

type Members = Member[];

interface Permissions {
  canUpdateRole: (roleHierarchy: number) => boolean;
  canRemoveFromAccount: (roleHierarchy: number) => boolean;
  canTransferOwnership: boolean;
}

type AccountMembersTableProps = {
  members: Members;
  currentUserId: string;
  currentAccountId: string;
  userRoleHierarchy: number;
  isPrimaryOwner: boolean;
  canManageRoles: boolean;
  isSuperAdmin?: boolean;
};

export function AccountMembersTable({
  members,
  currentUserId,
  currentAccountId,
  isPrimaryOwner,
  userRoleHierarchy,
  canManageRoles,
  isSuperAdmin,
}: AccountMembersTableProps) {
  const [search, setSearch] = useState('');
  const t = useTranslations('teams');

  const permissions = {
    canUpdateRole: (targetRole: number) => {
      return (
        isSuperAdmin ||
        isPrimaryOwner ||
        (canManageRoles && userRoleHierarchy < targetRole)
      );
    },
    canRemoveFromAccount: (targetRole: number) => {
      return (
        isSuperAdmin ||
        isPrimaryOwner ||
        (canManageRoles && userRoleHierarchy < targetRole)
      );
    },
    canTransferOwnership: isPrimaryOwner,
    isSuperAdmin,
  };

  const columns = useGetColumns(permissions, {
    currentUserId,
    currentAccountId,
    currentRoleHierarchy: userRoleHierarchy,
  });

  const filteredMembers = members
    .filter((member) => {
      const searchString = search.toLowerCase();

      const displayName = (
        member.name ??
        member.email?.split('@')[0] ??
        ''
      ).toLowerCase();

      return (
        displayName.includes(searchString) ||
        (member.phone ?? '').toLowerCase().includes(searchString) ||
        member.role.toLowerCase().includes(searchString)
      );
    })
    .sort((prev, next) => {
      if (prev.primary_owner_user_id === prev.user_id) {
        return 0;
      }

      if (prev.role_hierarchy_level < next.role_hierarchy_level) {
        return -1;
      }

      return 1;
    });

  return (
    <div className={'flex flex-col space-y-2'}>
      <Input
        value={search}
        onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        placeholder={t(`searchMembersPlaceholder`)}
      />

      <DataTable columns={columns} data={filteredMembers} />
    </div>
  );
}

function useGetColumns(
  permissions: Permissions & { isSuperAdmin?: boolean },
  params: {
    currentUserId: string;
    currentAccountId: string;
    currentRoleHierarchy: number;
  },
): ColumnDef<Members[0]>[] {
  const t = useTranslations('teams');

  return useMemo(
    () => [
      {
        header: t('memberName'),
        size: 200,
        cell: ({ row }) => {
          const member = row.original;
          const displayName =
            member.name ?? member.email?.split('@')[0] ?? member.phone ?? '—';
          const isSelf = member.user_id === params.currentUserId;

          return (
            <span className={'flex items-center gap-x-2 text-left'}>
              <span>
                <ProfileAvatar
                  displayName={displayName}
                  pictureUrl={member.picture_url}
                />
              </span>

              <span className={'flex items-center gap-x-2'}>
                <span>{displayName}</span>

                <If condition={isSelf}>
                  <Badge variant={'secondary'}>{t('youLabel')}</Badge>
                </If>
              </span>
            </span>
          );
        },
      },
      {
        header: t('phoneLabel'),
        accessorKey: 'phone',
        cell: ({ row }) => {
          return row.original.phone ?? '-';
        },
      },
      {
        header: t('roleLabel'),
        cell: ({ row }) => {
          const { role, primary_owner_user_id, user_id } = row.original;
          const isPrimaryOwner = primary_owner_user_id === user_id;

          return (
            <span className={'flex items-center space-x-1'}>
              <RoleBadge role={role} />

              <If condition={isPrimaryOwner}>
                <Badge className={badgeExtras.warning}>
                  {t('primaryOwnerLabel')}
                </Badge>
              </If>
            </span>
          );
        },
      },
      {
        header: t('joinedAtLabel'),
        cell: ({ row }) => {
          return new Date(row.original.created_at).toLocaleDateString();
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => (
          <ActionsDropdown
            permissions={permissions}
            member={row.original}
            currentUserId={params.currentUserId}
            currentTeamAccountId={params.currentAccountId}
            currentRoleHierarchy={params.currentRoleHierarchy}
            isSuperAdmin={permissions.isSuperAdmin}
          />
        ),
      },
    ],
    [t, params, permissions],
  );
}

function ActionsDropdown({
  permissions,
  member,
  currentUserId,
  currentTeamAccountId,
  currentRoleHierarchy,
  isSuperAdmin,
}: {
  permissions: Permissions;
  member: Members[0];
  currentUserId: string;
  currentTeamAccountId: string;
  currentRoleHierarchy: number;
  isSuperAdmin?: boolean;
}) {
  const isCurrentUser = member.user_id === currentUserId;
  const isPrimaryOwner = member.primary_owner_user_id === member.user_id;

  const [activeDialog, setActiveDialog] = useState<
    'updateRole' | 'transferOwnership' | 'removeMember' | null
  >(null);

  if (isCurrentUser || isPrimaryOwner) {
    return null;
  }

  const memberRoleHierarchy = member.role_hierarchy_level;
  const canUpdateRole = permissions.canUpdateRole(memberRoleHierarchy);

  const canRemoveFromAccount =
    permissions.canRemoveFromAccount(memberRoleHierarchy);

  // if has no permission to update role, transfer ownership or remove from account
  // do not render the dropdown menu
  if (
    !canUpdateRole &&
    !permissions.canTransferOwnership &&
    !canRemoveFromAccount
  ) {
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

        <DropdownMenuContent className={'min-w-52'}>
          <If condition={canUpdateRole}>
            <DropdownMenuItem onClick={() => setActiveDialog('updateRole')}>
              <Trans i18nKey={'teams.updateRole'} />
            </DropdownMenuItem>
          </If>

          <If condition={permissions.canTransferOwnership}>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setActiveDialog('transferOwnership')}
            >
              <Trans i18nKey={'teams.transferOwnership'} />
            </DropdownMenuItem>
          </If>

          <If condition={canRemoveFromAccount}>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setActiveDialog('removeMember')}
            >
              <Trans i18nKey={'teams.removeMember'} />
            </DropdownMenuItem>
          </If>
        </DropdownMenuContent>
      </DropdownMenu>

      {activeDialog === 'updateRole' && (
        <UpdateMemberRoleDialog
          open
          onOpenChange={(open) => !open && setActiveDialog(null)}
          userId={member.user_id}
          userRole={member.role}
          teamAccountId={currentTeamAccountId}
          userRoleHierarchy={currentRoleHierarchy}
          isSuperAdmin={isSuperAdmin}
        />
      )}

      {activeDialog === 'transferOwnership' && (
        <TransferOwnershipDialog
          open
          onOpenChange={(open) => !open && setActiveDialog(null)}
          targetDisplayName={member.name ?? member.phone ?? member.email ?? ''}
          accountId={member.account_id}
          userId={member.user_id}
        />
      )}

      {activeDialog === 'removeMember' && (
        <RemoveMemberDialog
          open
          onOpenChange={(open) => !open && setActiveDialog(null)}
          teamAccountId={currentTeamAccountId}
          userId={member.user_id}
        />
      )}
    </>
  );
}
