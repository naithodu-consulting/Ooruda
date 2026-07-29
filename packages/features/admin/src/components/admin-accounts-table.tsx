'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { EllipsisVertical } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import { formatPhoneNumber } from '@kit/shared/utils';
import { Tables } from '@kit/supabase/database';
import { Badge } from '@kit/ui/badge';
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
import { Form, FormControl, FormField, FormItem } from '@kit/ui/form';
import { Input } from '@kit/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@kit/ui/tabs';

import { ROLE_LABELS } from '../lib/server/schema/create-user.schema';
import { AdminDeleteAccountDialog } from './admin-delete-account-dialog';
import { AdminDeleteUserDialog } from './admin-delete-user-dialog';
import { AdminImpersonateUserDialog } from './admin-impersonate-user-dialog';
import {
  AdminManageRolesDialog,
  type AssociationOption,
  type UserMembership,
} from './admin-manage-roles-dialog';
import { AdminResetPasswordDialog } from './admin-reset-password-dialog';

type Account = Tables<'accounts'>;

function roleLabel(role: string): string {
  return ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
}

const FiltersSchema = z.object({
  type: z.enum(['all', 'team', 'personal']),
  kind: z.enum(['all', 'real', 'test']).default('all'),
  query: z.string().optional(),
});

export function AdminAccountsTable(
  props: React.PropsWithChildren<{
    data: Account[];
    pageCount: number;
    pageSize: number;
    page: number;
    filters: {
      type: 'all' | 'team' | 'personal';
      kind: 'all' | 'real' | 'test';
      query: string;
    };
    // Set of account ids that are test accounts (from associations.is_test or profiles.is_test)
    testAccountIds?: Set<string>;
    // Map of personal-account (user) id → the association memberships they
    // hold (association + role), used for both the Role column and the
    // Manage Roles dialog.
    membershipsByAccountId?: Record<string, UserMembership[]>;
    // Map of personal-account (user) id → their phone number, since
    // phone-based users have no `accounts.email`.
    phoneByAccountId?: Record<string, string>;
    // Team accounts a user can be assigned to from the Manage Roles dialog.
    associations?: AssociationOption[];
    // Account ids that hold platform Super Admin access (app_metadata.role).
    // Destructive/role actions are disabled for these accounts since they're
    // already blocked server-side.
    superAdminIds?: Set<string>;
  }>,
) {
  return (
    <div className={'flex min-w-0 flex-col space-y-4'}>
      <AccountsTableFilters filters={props.filters} />

      <div className={'overflow-x-auto rounded-lg border'}>
        <div className={'min-w-[1200px] p-2'}>
          <DataTable
            pageSize={props.pageSize}
            pageIndex={props.page - 1}
            pageCount={props.pageCount}
            data={props.data}
            manualSorting={false}
            columns={getColumns(
              props.membershipsByAccountId ?? {},
              props.phoneByAccountId ?? {},
              props.associations ?? [],
              props.superAdminIds ?? new Set(),
              props.testAccountIds ?? new Set(),
            )}
          />
        </div>
      </div>
    </div>
  );
}

function AccountsTableFilters(props: {
  filters: z.output<typeof FiltersSchema>;
}) {
  const form = useForm({
    resolver: zodResolver(FiltersSchema),
    defaultValues: {
      type: props.filters?.type ?? 'team',
      kind: props.filters?.kind ?? 'all',
      query: props.filters?.query ?? '',
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  const router = useRouter();
  const pathName = usePathname();
  const [isPending, startNavTransition] = useTransition();

  const prefetchTabs = useCallback(() => {
    for (const type of ['team', 'personal', 'all'] as const) {
      router.prefetch(
        `${pathName}?${new URLSearchParams({ account_type: type, kind: props.filters.kind ?? 'all', query: props.filters.query ?? '' }).toString()}`,
      );
    }
  }, [router, pathName, props.filters.kind, props.filters.query]);

  // Prefetch all tab combinations whenever filters change so switching feels instant.
  useEffect(() => {
    prefetchTabs();
  }, [prefetchTabs]);

  const navigate = (overrides: Partial<z.output<typeof FiltersSchema>>) => {
    const values = form.getValues() as z.output<typeof FiltersSchema>;
    const merged = { ...values, ...overrides };
    const params = new URLSearchParams({
      account_type: merged.type,
      kind: merged.kind ?? 'all',
      query: merged.query ?? '',
    });
    startNavTransition(() => {
      router.push(`${pathName}?${params.toString()}`);
    });
  };

  const type = useWatch({ control: form.control, name: 'type' });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => navigate(data))}>
        <div className={'flex items-center justify-between gap-3'}>
          <Tabs
            value={type}
            onValueChange={(value) => {
              const t = value as z.output<typeof FiltersSchema>['type'];
              form.setValue('type', t, { shouldValidate: true });
              navigate({ type: t });
            }}
          >
            <TabsList>
              <TabsTrigger value="all" disabled={isPending && type !== 'all'}>
                All
              </TabsTrigger>
              <TabsTrigger value="team" disabled={isPending && type !== 'team'}>
                Associations
              </TabsTrigger>
              <TabsTrigger
                value="personal"
                disabled={isPending && type !== 'personal'}
              >
                Users
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className={'flex gap-2.5'}>
            <FormField
              name={'query'}
              render={({ field }) => (
                <FormItem>
                  <FormControl className={'w-full min-w-36 md:min-w-72'}>
                    <Input
                      data-test={'admin-accounts-table-filter-input'}
                      className={'w-full'}
                      placeholder={'Search account...'}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <button type="submit" hidden />
          </div>
        </div>

        {isPending && (
          <div
            className={
              'bg-muted mt-2 h-0.5 w-full overflow-hidden rounded-full'
            }
          >
            <div className={'animate-progress-bar bg-primary h-full'} />
          </div>
        )}
      </form>
    </Form>
  );
}

function getColumns(
  membershipsByAccountId: Record<string, UserMembership[]>,
  phoneByAccountId: Record<string, string>,
  associations: AssociationOption[],
  superAdminIds: Set<string>,
  testAccountIds: Set<string>,
): ColumnDef<Account>[] {
  return [
    {
      id: 'name',
      header: 'Name',
      enableSorting: true,
      accessorFn: (row) => row.name?.trim() ?? '',
      cell: ({ row }) => {
        const isTest = testAccountIds.has(row.original.id);
        return (
          <div className={'flex items-center gap-2'}>
            <Link
              prefetch={false}
              className={'hover:underline'}
              href={`/admin/accounts/${row.original.id}`}
            >
              {row.original.name?.trim() || '—'}
            </Link>

            {superAdminIds.has(row.original.id) && (
              <Badge variant={'outline'}>Super Admin</Badge>
            )}

            {isTest && (
              <Badge
                className={'border-amber-400 bg-amber-50 text-amber-700'}
                variant={'outline'}
              >
                Test
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      id: 'phone',
      header: 'Phone',
      cell: ({ row }) => {
        return formatPhoneNumber(phoneByAccountId[row.original.id]);
      },
    },
    {
      id: 'email',
      header: 'Email',
      cell: ({ row }) => {
        return row.original.email?.trim() || '—';
      },
    },
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => {
        return row.original.is_personal_account ? 'User' : 'Association';
      },
    },
    {
      id: 'role',
      header: 'Role',
      cell: ({ row }) => {
        if (!row.original.is_personal_account) {
          return '—';
        }

        const memberships = membershipsByAccountId[row.original.id] ?? [];

        return memberships.length > 0
          ? memberships.map((m) => roleLabel(m.role)).join(', ')
          : '—';
      },
    },
    {
      id: 'created_at',
      header: 'Created At',
      enableSorting: true,
      accessorFn: (row) => row.created_at ?? '',
      cell: ({ row }) => {
        return new Date(row.original.created_at!).toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    },
    {
      id: 'updated_at',
      header: 'Updated At',
      cell: ({ row }) => {
        return row.original.updated_at
          ? new Date(row.original.updated_at).toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-';
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <ActionsCell
          account={row.original}
          associations={associations}
          memberships={membershipsByAccountId[row.original.id] ?? []}
          isSuperAdmin={superAdminIds.has(row.original.id)}
        />
      ),
    },
  ];
}

type ActiveDialog =
  | 'reset-password'
  | 'impersonate'
  | 'delete-user'
  | 'delete-account'
  | 'manage-roles'
  | null;

function ActionsCell({
  account,
  associations,
  memberships,
  isSuperAdmin,
}: {
  account: Account;
  associations: AssociationOption[];
  memberships: UserMembership[];
  isSuperAdmin: boolean;
}) {
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const isPersonalAccount = account.is_personal_account;

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
                  href={`/admin/accounts/${account.id}`}
                >
                  View
                </Link>
              }
            />

            {isPersonalAccount && (
              <>
                <DropdownMenuItem
                  disabled={isSuperAdmin}
                  onClick={() => setActiveDialog('manage-roles')}
                >
                  Manage Roles
                </DropdownMenuItem>

                <DropdownMenuItem
                  disabled={isSuperAdmin}
                  onClick={() => setActiveDialog('reset-password')}
                >
                  Send Reset Password link
                </DropdownMenuItem>

                <DropdownMenuItem
                  disabled={isSuperAdmin}
                  onClick={() => setActiveDialog('impersonate')}
                >
                  Impersonate User
                </DropdownMenuItem>

                <DropdownMenuItem
                  variant="destructive"
                  disabled={isSuperAdmin}
                  onClick={() => setActiveDialog('delete-user')}
                >
                  Delete Personal Account
                </DropdownMenuItem>
              </>
            )}

            {!isPersonalAccount && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setActiveDialog('delete-account')}
              >
                Delete Association
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {isPersonalAccount && (
        <>
          <AdminManageRolesDialog
            userId={account.id}
            userName={account.name?.trim() || account.id}
            associations={associations}
            memberships={memberships}
            open={activeDialog === 'manage-roles'}
            onOpenChange={(open) => !open && setActiveDialog(null)}
          />

          <AdminResetPasswordDialog
            userId={account.id}
            open={activeDialog === 'reset-password'}
            onOpenChange={(open) => !open && setActiveDialog(null)}
          />

          <AdminImpersonateUserDialog
            userId={account.id}
            open={activeDialog === 'impersonate'}
            onOpenChange={(open) => !open && setActiveDialog(null)}
          />

          <AdminDeleteUserDialog
            userId={account.id}
            open={activeDialog === 'delete-user'}
            onOpenChange={(open) => !open && setActiveDialog(null)}
          />
        </>
      )}

      {!isPersonalAccount && (
        <AdminDeleteAccountDialog
          accountId={account.id}
          open={activeDialog === 'delete-account'}
          onOpenChange={(open) => !open && setActiveDialog(null)}
        />
      )}
    </div>
  );
}
