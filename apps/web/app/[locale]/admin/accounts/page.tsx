import { ServerDataLoader } from '@makerkit/data-loader-supabase-nextjs';

import { AdminAccountsTable } from '@kit/admin/components/admin-accounts-table';
import { AdminCreateAssociationDialog } from '@kit/admin/components/admin-create-association-dialog';
import { AdminCreateUserDialog } from '@kit/admin/components/admin-create-user-dialog';
import { AdminGuard } from '@kit/admin/components/admin-guard';
import { type Tables } from '@kit/supabase/database';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Button } from '@kit/ui/button';
import { PageBody, PageHeader } from '@kit/ui/page';

interface SearchParams {
  page?: string;
  account_type?: 'all' | 'team' | 'personal';
  kind?: 'all' | 'real' | 'test';
  query?: string;
}

interface AdminAccountsPageProps {
  searchParams: Promise<SearchParams>;
}

interface AssociationOption {
  id: string;
  name: string;
}

export const metadata = {
  title: `Accounts`,
};

async function AccountsPage(props: AdminAccountsPageProps) {
  const client = getSupabaseServerClient();
  const adminClient = getSupabaseServerAdminClient();
  const searchParams = await props.searchParams;
  const page = searchParams.page ? parseInt(searchParams.page) : 1;

  // Team accounts a user can be assigned to, with a role, plus the existing
  // users that can own a new association.
  // Validate kind param server-side — unknown values fall back to 'all'
  const safeKind = (['all', 'real', 'test'] as const).includes(
    searchParams.kind as 'all' | 'real' | 'test',
  )
    ? (searchParams.kind as 'all' | 'real' | 'test')
    : ('all' as const);

  const [
    { data: associationRows },
    { data: userRows },
    { data: authUsers },
    { data: testAssociations, error: testAssocError },
    { data: testProfiles, error: testProfilesError },
  ] = await Promise.all([
    adminClient
      .from('accounts')
      .select('id, name')
      .eq('is_personal_account', false)
      .order('name'),
    adminClient
      .from('accounts')
      .select('id, name')
      .eq('is_personal_account', true)
      .order('name'),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
    adminClient.from('associations').select('account_id').eq('is_test', true),
    adminClient.from('profiles').select('id').eq('is_test', true),
  ]);

  const superAdminIds = new Set(
    (authUsers?.users ?? [])
      .filter((user) => user.app_metadata?.role === 'super-admin')
      .map((user) => user.id),
  );

  if (testAssocError)
    console.warn('Failed to load test associations:', testAssocError.message);
  if (testProfilesError)
    console.warn('Failed to load test profiles:', testProfilesError.message);

  const testAccountIds = new Set([
    ...(testAssociations ?? []).map((r) => r.account_id),
    ...(testProfiles ?? []).map((r) => r.id),
  ]);

  const associations: AssociationOption[] = (associationRows ?? []).map(
    (association) => ({ id: association.id, name: association.name }),
  );

  const users = (userRows ?? []).map((user) => ({
    id: user.id,
    name: user.name?.trim() || user.id,
  }));

  return (
    <PageBody>
      <PageHeader description={<AppBreadcrumbs />}>
        <div className="flex justify-end gap-2">
          <AdminCreateAssociationDialog users={users}>
            <Button
              variant="outline"
              data-test="admin-create-association-button"
            >
              Create Association
            </Button>
          </AdminCreateAssociationDialog>

          <AdminCreateUserDialog associations={associations}>
            <Button data-test="admin-create-user-button">Create User</Button>
          </AdminCreateUserDialog>
        </div>
      </PageHeader>

      <ServerDataLoader
        table={'accounts'}
        client={
          client as unknown as Parameters<typeof ServerDataLoader>[0]['client']
        }
        page={page}
        where={(queryBuilder) => {
          const { account_type: type, query } = searchParams;
          const effectiveType = type ?? 'team';

          if (effectiveType !== 'all') {
            queryBuilder.eq(
              'is_personal_account',
              effectiveType === 'personal',
            );
          }

          if (safeKind !== 'all') {
            const ids = [...testAccountIds];
            if (safeKind === 'test') {
              if (ids.length > 0) {
                queryBuilder.in('id', ids);
              } else {
                // No test accounts — match nothing
                queryBuilder.eq('id', '00000000-0000-0000-0000-000000000000');
              }
            } else {
              // safeKind === 'real'
              if (ids.length > 0) {
                queryBuilder.not('id', 'in', `(${ids.join(',')})`);
              }
            }
          }

          if (query) {
            queryBuilder.or(`name.ilike.%${query}%,email.ilike.%${query}%`);
          }

          return queryBuilder;
        }}
      >
        {({ data, page, pageSize, pageCount }) => {
          return (
            <AccountsTableWithRoles
              page={page}
              pageSize={pageSize}
              pageCount={pageCount}
              data={data}
              associations={associations}
              superAdminIds={superAdminIds}
              testAccountIds={testAccountIds}
              filters={{
                type: searchParams.account_type ?? 'team',
                kind: safeKind,
                query: searchParams.query ?? '',
              }}
            />
          );
        }}
      </ServerDataLoader>
    </PageBody>
  );
}

interface UserMembership {
  associationId: string;
  associationName: string;
  role: string;
}

/**
 * Resolves the association membership(s) and phone for each personal account,
 * then renders the accounts table. Roles live in `accounts_memberships` and
 * phones in `profiles`, not on the `accounts` row, so they're fetched
 * separately for the accounts on this page.
 */
async function AccountsTableWithRoles(props: {
  data: Tables<'accounts'>[];
  pageCount: number;
  pageSize: number;
  page: number;
  associations: AssociationOption[];
  superAdminIds: Set<string>;
  testAccountIds: Set<string>;
  filters: {
    type: 'all' | 'team' | 'personal';
    kind: 'all' | 'real' | 'test';
    query: string;
  };
}) {
  const adminClient = getSupabaseServerAdminClient();

  const associationNameById = new Map(
    props.associations.map((association) => [association.id, association.name]),
  );

  const personalAccountIds = props.data
    .filter((account) => account.is_personal_account)
    .map((account) => account.id);

  const membershipsByAccountId: Record<string, UserMembership[]> = {};
  const phoneByAccountId: Record<string, string> = {};

  if (personalAccountIds.length > 0) {
    const [{ data: memberships }, { data: profiles }] = await Promise.all([
      adminClient
        .from('accounts_memberships')
        .select('user_id, account_id, account_role')
        .in('user_id', personalAccountIds),
      adminClient
        .from('profiles')
        .select('id, mobile_number')
        .in('id', personalAccountIds),
    ]);

    for (const membership of memberships ?? []) {
      (membershipsByAccountId[membership.user_id] ??= []).push({
        associationId: membership.account_id,
        associationName:
          associationNameById.get(membership.account_id) ?? 'Association',
        role: membership.account_role,
      });
    }

    for (const profile of profiles ?? []) {
      if (profile.mobile_number) {
        phoneByAccountId[profile.id] = profile.mobile_number;
      }
    }
  }

  return (
    <AdminAccountsTable
      page={props.page}
      pageSize={props.pageSize}
      pageCount={props.pageCount}
      data={props.data}
      filters={props.filters}
      associations={props.associations}
      membershipsByAccountId={membershipsByAccountId}
      phoneByAccountId={phoneByAccountId}
      superAdminIds={props.superAdminIds}
      testAccountIds={props.testAccountIds}
    />
  );
}

export default AdminGuard(AccountsPage);
