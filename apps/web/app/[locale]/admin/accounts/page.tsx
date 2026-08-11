import { AdminAccountsTable } from '@kit/admin/components/admin-accounts-table';
import { AdminGuard } from '@kit/admin/components/admin-guard';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { PageBody, PageHeader } from '@kit/ui/page';

interface SearchParams {
  account_type?: 'all' | 'team' | 'personal';
}

interface AdminAccountsPageProps {
  searchParams: Promise<SearchParams>;
}

export const metadata = {
  title: `Accounts`,
};

// Specific test-number prefixes — narrow enough to never match real Airtel/Vodafone numbers.
// Covers +919911000000–99 and +919999999900–99 (matches all known test accounts).
function isTestPhone(mobile_number: string | null): boolean {
  if (!mobile_number) return false;
  return (
    mobile_number.startsWith('+9199110000') ||
    mobile_number.startsWith('+9199999999')
  );
}

async function AccountsPage(props: AdminAccountsPageProps) {
  const adminClient = getSupabaseServerAdminClient();
  const searchParams = await props.searchParams;

  const initialTab: 'team' | 'personal' =
    searchParams.account_type === 'personal' ? 'personal' : 'team';

  // Load all data in one parallel batch — dataset is small (~3-5 assocs, ~70 users)
  const [
    { data: associationAccounts },
    { data: userAccounts },
    { data: authUsers },
    { data: testAssociations, error: testAssocError },
    { data: testProfiles, error: testProfilesError },
  ] = await Promise.all([
    adminClient
      .from('accounts')
      .select('*')
      .eq('is_personal_account', false)
      .order('name'),
    adminClient
      .from('accounts')
      .select('*')
      .eq('is_personal_account', true)
      .order('name'),
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
    adminClient.from('associations').select('account_id').eq('is_test', true),
    adminClient
      .from('profiles')
      .select('id, mobile_number')
      .eq('is_test', true),
  ]);

  const superAdminIds = new Set(
    (authUsers?.users ?? [])
      .filter((user) => user.app_metadata?.role === 'super-admin')
      .map((user) => user.id),
  );

  if (authUsers?.users.length === 1000) {
    console.error(
      '[admin/accounts] listUsers returned exactly 1000 results — super admin detection may be incomplete. Implement cursor pagination.',
    );
  }
  if (testAssocError)
    console.error(
      '[admin/accounts] Failed to load test associations:',
      testAssocError.message,
    );
  if (testProfilesError)
    console.error(
      '[admin/accounts] Failed to load test profiles:',
      testProfilesError.message,
    );

  const testAccountIds = new Set([
    ...(testAssociations ?? []).map((r) => r.account_id),
    ...(testProfiles ?? []).map((r) => r.id),
  ]);

  // Enrich personal accounts: memberships + phones
  const personalIds = (userAccounts ?? []).map((u) => u.id);
  const membershipsByAccountId: Record<
    string,
    { associationId: string; associationName: string; role: string }[]
  > = {};
  const phoneByAccountId: Record<string, string> = {};
  const effectiveTestIds = new Set(testAccountIds);

  if (personalIds.length > 0) {
    const associationNameById = new Map(
      (associationAccounts ?? []).map((a) => [a.id, a.name]),
    );

    const [{ data: memberships }, { data: profiles }] = await Promise.all([
      adminClient
        .from('accounts_memberships')
        .select('user_id, account_id, account_role')
        .in('user_id', personalIds),
      adminClient
        .from('profiles')
        .select('id, mobile_number')
        .in('id', personalIds),
    ]);

    for (const m of memberships ?? []) {
      (membershipsByAccountId[m.user_id] ??= []).push({
        associationId: m.account_id,
        associationName: associationNameById.get(m.account_id) ?? 'Association',
        role: m.account_role,
      });
    }

    for (const p of profiles ?? []) {
      if (p.mobile_number) {
        phoneByAccountId[p.id] = p.mobile_number;
        if (isTestPhone(p.mobile_number)) effectiveTestIds.add(p.id);
      }
    }
  }

  return (
    <PageBody>
      <PageHeader description={<AppBreadcrumbs />} />

      <AdminAccountsTable
        associations={associationAccounts ?? []}
        users={userAccounts ?? []}
        membershipsByAccountId={membershipsByAccountId}
        phoneByAccountId={phoneByAccountId}
        superAdminIds={superAdminIds}
        testAccountIds={effectiveTestIds}
        initialTab={initialTab}
      />
    </PageBody>
  );
}

export default AdminGuard(AccountsPage);
