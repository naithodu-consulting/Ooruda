'use client';

import Link from 'next/link';

import { ColumnDef } from '@tanstack/react-table';

import { Tables } from '@kit/supabase/database';
import { DataTable } from '@kit/ui/enhanced-data-table';

type Membership = Tables<'accounts_memberships'> & {
  account: {
    id: string;
    name: string;
  };
};

export function AdminMembershipsTable(props: { memberships: Membership[] }) {
  return <DataTable data={props.memberships} columns={getColumns()} manualSorting={false} />;
}

function getColumns(): ColumnDef<Membership>[] {
  return [
    {
      header: 'Team',
      enableSorting: true,
      accessorFn: (row) => row.account.name ?? '',
      cell: ({ row }) => {
        return (
          <Link
            className={'hover:underline'}
            href={`/admin/accounts/${row.original.account_id}`}
          >
            {row.original.account.name}
          </Link>
        );
      },
    },
    {
      header: 'Role',
      accessorKey: 'account_role',
      enableSorting: true,
    },
    {
      header: 'Created At',
      accessorKey: 'created_at',
      enableSorting: true,
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
  ];
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
