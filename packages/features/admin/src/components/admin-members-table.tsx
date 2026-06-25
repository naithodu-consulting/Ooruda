'use client';

import { useState } from 'react';

import Link from 'next/link';

import { ColumnDef } from '@tanstack/react-table';
import { EllipsisVertical } from 'lucide-react';

import { normalizePhoneNumber } from '@kit/shared/utils';
import { Database } from '@kit/supabase/database';
import { Button } from '@kit/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { DataTable } from '@kit/ui/enhanced-data-table';
import { ProfileAvatar } from '@kit/ui/profile-avatar';

import { AdminEditUserDialog } from './admin-edit-user-dialog';
import { AdminRemoveMemberDialog } from './admin-remove-member-dialog';

type Memberships =
  Database['public']['Functions']['get_account_members']['Returns'][number] & {
    phone?: string | null;
  };

export function AdminMembersTable(props: { members: Memberships[] }) {
  return <DataTable data={props.members} columns={getColumns()} />;
}

function getColumns(): ColumnDef<Memberships>[] {
  return [
    {
      header: 'Name',
      enableSorting: false,
      cell: ({ row }) => {
        const name = row.original.name ?? row.original.email;

        return (
          <div className={'flex items-center space-x-2'}>
            <div>
              <ProfileAvatar
                pictureUrl={row.original.picture_url}
                displayName={name}
              />
            </div>

            <Link
              className={'hover:underline'}
              href={`/admin/accounts/${row.original.user_id}`}
            >
              <span>{name}</span>
            </Link>
          </div>
        );
      },
    },
    {
      header: 'Email',
      accessorKey: 'email',
      enableSorting: false,
    },
    {
      header: 'Role',
      enableSorting: false,
      cell: ({ row }) => {
        return row.original.role;
      },
    },
    {
      header: 'Created At',
      accessorKey: 'created_at',
      enableSorting: false,
      cell: ({ row }) => {
        return renderDate(row.original.created_at);
      },
    },
    {
      header: 'Updated At',
      accessorKey: 'updated_at',
      enableSorting: false,
      cell: ({ row }) => {
        return renderDate(row.original.updated_at);
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => <ActionsCell member={row.original} />,
    },
  ];
}

function ActionsCell({ member }: { member: Memberships }) {
  const [activeDialog, setActiveDialog] = useState<'edit' | 'remove' | null>(
    null,
  );

  const isPrimaryOwner = member.user_id === member.primary_owner_user_id;

  return (
    <div className={'flex justify-end'}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant={'outline'} size={'icon'}>
              <EllipsisVertical className={'h-4'} />
            </Button>
          }
        />

        <DropdownMenuContent className="min-w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>

            <DropdownMenuItem
              render={
                <Link
                  className={'h-full w-full'}
                  href={`/admin/accounts/${member.user_id}`}
                >
                  View Profile
                </Link>
              }
            />

            <DropdownMenuItem
              disabled={isPrimaryOwner}
              onClick={() => setActiveDialog('edit')}
            >
              Edit Details / Role
            </DropdownMenuItem>

            <DropdownMenuItem
              variant="destructive"
              disabled={isPrimaryOwner}
              onClick={() => setActiveDialog('remove')}
            >
              Remove Member
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AdminEditUserDialog
        open={activeDialog === 'edit'}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        userId={member.user_id}
        userName={member.name || member.email || 'Member'}
        userPhone={normalizePhoneNumber(member.phone) ?? member.phone ?? ''}
        userEmail={member.email ?? ''}
        teamAccountId={member.account_id}
        currentRole={member.role}
      />

      <AdminRemoveMemberDialog
        open={activeDialog === 'remove'}
        onOpenChange={(open) => !open && setActiveDialog(null)}
        userId={member.user_id}
        userName={member.name || member.email || 'Member'}
        associationId={member.account_id}
      />
    </div>
  );
}

function renderDate(date: string) {
  return (
    <span className={'text-xs'}>
      {new Date(date).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}
    </span>
  );
}
