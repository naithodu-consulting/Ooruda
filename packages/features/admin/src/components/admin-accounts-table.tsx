'use client';

import { useRef, useState, useMemo } from 'react';

import Link from 'next/link';

import { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Clock, EllipsisVertical, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@kit/ui/tooltip';

import { ROLE_LABELS } from '../lib/server/schema/create-user.schema';
import { AdminCreateAssociationDialog } from './admin-create-association-dialog';
import { AdminCreateUserDialog } from './admin-create-user-dialog';
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

function formatConsentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const d = date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const t = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
  return `${d.replace(/\//g, '-')}, ${t}`;
}

export function AdminAccountsTable(props: {
  associations: Account[];
  users: Account[];
  membershipsByAccountId: Record<string, UserMembership[]>;
  phoneByAccountId: Record<string, string>;
  consentByAccountId: Record<string, string | null>;
  superAdminIds: Set<string>;
  testAccountIds: Set<string>;
  initialTab?: 'team' | 'personal';
}) {
  const PAGE_SIZE = 10;

  const [activeTab, setActiveTab] = useState<'team' | 'personal'>(
    props.initialTab ?? 'team',
  );
  const [query, setQuery] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm({ defaultValues: { query: '' } });

  const associationOptions: AssociationOption[] = props.associations.map(
    (a) => ({ id: a.id, name: a.name }),
  );
  const userOptions = props.users.map((u) => ({
    id: u.id,
    name: u.name?.trim() || u.id,
  }));

  const rawData = activeTab === 'team' ? props.associations : props.users;

  const filtered = useMemo(() => {
    if (!query.trim()) return rawData;
    const q = query.toLowerCase();
    return rawData.filter(
      (acc) =>
        acc.name?.toLowerCase().includes(q) ||
        acc.email?.toLowerCase().includes(q),
    );
  }, [rawData, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const paginated = filtered.slice(
    safePageIndex * PAGE_SIZE,
    (safePageIndex + 1) * PAGE_SIZE,
  );

  const teamCount = props.associations.length;
  const personalCount = props.users.length;
  const showCounts = !query;

  const assocLabel = showCounts
    ? `Associations (${teamCount})`
    : 'Associations';
  const usersLabel = showCounts ? `Users (${personalCount})` : 'Users';

  const columns = getColumns(
    activeTab,
    props.membershipsByAccountId,
    props.phoneByAccountId,
    props.consentByAccountId,
    associationOptions,
    props.superAdminIds,
    props.testAccountIds,
  );

  return (
    <div className="flex min-w-0 flex-col space-y-4 overflow-x-hidden">
      {/* Tab row + search + create button */}
      <Form {...form}>
        <form>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v as 'team' | 'personal');
                setQuery('');
                setPageIndex(0);
                form.setValue('query', '');
              }}
            >
              <TabsList>
                <TabsTrigger value="team">{assocLabel}</TabsTrigger>
                <TabsTrigger value="personal">{usersLabel}</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-1 items-center gap-2">
              <FormField
                name="query"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl className="w-full">
                      <Input
                        data-test="admin-accounts-table-filter-input"
                        className="w-full"
                        placeholder={
                          activeTab === 'personal'
                            ? 'Search user...'
                            : 'Search association...'
                        }
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          if (debounceTimer.current)
                            clearTimeout(debounceTimer.current);
                          debounceTimer.current = setTimeout(() => {
                            setQuery(e.target.value);
                            setPageIndex(0);
                          }, 200);
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setQuery(form.getValues('query'))}
              >
                <Search className="h-4 w-4" />
                <span className="sr-only">Search</span>
              </Button>

              {activeTab === 'team' && (
                <AdminCreateAssociationDialog users={userOptions}>
                  <Button data-test="admin-create-association-button">
                    <span className="hidden sm:inline">Create Association</span>
                    <span className="sm:hidden">+ Assoc</span>
                  </Button>
                </AdminCreateAssociationDialog>
              )}

              {activeTab === 'personal' && (
                <AdminCreateUserDialog associations={associationOptions}>
                  <Button data-test="admin-create-user-button">
                    <span className="hidden sm:inline">Create User</span>
                    <span className="sm:hidden">+ User</span>
                  </Button>
                </AdminCreateUserDialog>
              )}
            </div>
          </div>
        </form>
      </Form>

      {/* Table */}
      <div
        className={
          activeTab === 'personal'
            ? 'overflow-x-auto rounded-lg border'
            : 'rounded-lg border'
        }
      >
        <div className={activeTab === 'personal' ? 'min-w-[600px] p-2' : 'p-2'}>
          {filtered.length === 0 ? (
            <EmptyState type={activeTab} query={query} />
          ) : (
            <DataTable
              pageSize={PAGE_SIZE}
              pageIndex={safePageIndex}
              pageCount={pageCount}
              data={paginated}
              manualSorting={false}
              columns={columns}
              onPaginationChange={(pagination) => {
                setPageIndex(pagination.pageIndex);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState(props: { type: 'team' | 'personal'; query?: string }) {
  const label = props.type === 'personal' ? 'users' : 'associations';
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center py-16 text-sm">
      <Search className="mb-3 h-8 w-8 opacity-30" />
      {props.query ? (
        <>
          <p className="font-medium">
            No {label} match &ldquo;{props.query}&rdquo;
          </p>
          <p className="mt-1 text-xs opacity-70">
            Try a different search term.
          </p>
        </>
      ) : (
        <p className="font-medium">No {label} yet.</p>
      )}
    </div>
  );
}

function getColumns(
  type: 'team' | 'personal',
  membershipsByAccountId: Record<string, UserMembership[]>,
  phoneByAccountId: Record<string, string>,
  consentByAccountId: Record<string, string | null>,
  associations: AssociationOption[],
  superAdminIds: Set<string>,
  testAccountIds: Set<string>,
): ColumnDef<Account>[] {
  const nameCol: ColumnDef<Account> = {
    id: 'name',
    header: 'Name',
    enableSorting: true,
    accessorFn: (row) => row.name?.trim() ?? '',
    cell: ({ row }) => {
      const isTest = testAccountIds.has(row.original.id);
      const isSA = superAdminIds.has(row.original.id);
      return (
        <div className="flex min-w-0 items-center gap-1.5">
          {isTest && (
            <Badge
              className="border-warning/40 bg-warning/10 text-warning shrink-0 px-1.5 py-0 text-[10px] whitespace-nowrap"
              variant="outline"
            >
              Test
            </Badge>
          )}

          <Link
            prefetch={false}
            className="min-w-0 flex-1 truncate hover:underline"
            title={row.original.name?.trim() || undefined}
            href={`/admin/accounts/${row.original.id}`}
          >
            {row.original.name?.trim() || '—'}
          </Link>

          {isSA && (
            <Badge
              variant="outline"
              className="shrink-0 px-1.5 py-0 text-[10px] whitespace-nowrap"
            >
              Super Admin
            </Badge>
          )}
        </div>
      );
    },
  };

  const createdAtCol: ColumnDef<Account> = {
    id: 'created_at',
    header: 'Created',
    enableSorting: true,
    accessorFn: (row) => row.created_at ?? '',
    cell: ({ row }) => {
      const full = new Date(row.original.created_at!).toLocaleDateString(
        'en-IN',
        {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
      );
      const short = new Date(row.original.created_at!).toLocaleDateString(
        'en-IN',
        {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        },
      );
      return (
        <span title={full} className="cursor-default">
          {short}
        </span>
      );
    },
  };

  const actionsCol: ColumnDef<Account> = {
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
  };

  if (type === 'personal') {
    return [
      nameCol,
      {
        id: 'phone',
        header: 'Phone',
        cell: ({ row }) => {
          const phone = formatPhoneNumber(phoneByAccountId[row.original.id]);
          return (
            phone || <span className="text-muted-foreground text-xs">—</span>
          );
        },
      },
      {
        id: 'email',
        header: 'Email',
        cell: ({ row }) => {
          const email = row.original.email?.trim();
          return email ? (
            <span
              className="block max-w-[180px] truncate sm:max-w-[240px]"
              title={email}
            >
              {email}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          );
        },
      },
      {
        id: 'role',
        header: 'Roles',
        cell: ({ row }) => {
          const memberships = membershipsByAccountId[row.original.id] ?? [];
          if (memberships.length === 0)
            return <span className="text-muted-foreground text-xs">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {memberships.map((m, i) => (
                <span
                  key={i}
                  className="bg-muted text-foreground inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                >
                  {roleLabel(m.role)}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        id: 'consent',
        header: 'Consent',
        cell: ({ row }) => {
          const ts = consentByAccountId[row.original.id];
          if (ts) {
            return (
              <TooltipProvider delay={200}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Badge
                        variant="outline"
                        className="border-success/40 bg-success/10 text-success cursor-default gap-1 px-2 py-0.5 text-[11px] whitespace-nowrap"
                      >
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        Accepted
                      </Badge>
                    }
                  />
                  <TooltipContent side="top">
                    <span className="font-medium">Consent accepted</span>
                    <span className="opacity-75 before:mx-1.5 before:content-['·']">
                      {formatConsentDate(ts)}
                    </span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }
          return (
            <Badge
              variant="outline"
              className="border-warning/40 bg-warning/10 text-warning cursor-default gap-1 px-2 py-0.5 text-[11px] whitespace-nowrap"
            >
              <Clock className="h-3 w-3 shrink-0" />
              Pending
            </Badge>
          );
        },
      },
      createdAtCol,
      actionsCol,
    ];
  }

  return [nameCol, createdAtCol, actionsCol];
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
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon">
              <EllipsisVertical className="h-4 w-4" />
            </Button>
          }
        />

        <DropdownMenuContent className="min-w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>

            <DropdownMenuItem
              render={
                <Link
                  className="h-full w-full"
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
                  Send Reset Password Link
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
                  Delete User
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
