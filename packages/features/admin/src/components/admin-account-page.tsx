import Link from 'next/link';

import { BadgeX, Ban, ShieldPlus, VenetianMask } from 'lucide-react';

import { normalizePhoneNumber } from '@kit/shared/utils';
import { Tables } from '@kit/supabase/database';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Heading } from '@kit/ui/heading';
import { If } from '@kit/ui/if';
import { PageBody, PageHeader } from '@kit/ui/page';
import { ProfileAvatar } from '@kit/ui/profile-avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

import {
  AdminAssocPermissions,
  type AssocPermissionRow,
} from './admin-assoc-permissions';
import { AdminBanUserDialog } from './admin-ban-user-dialog';
import { AdminDeleteAccountDialog } from './admin-delete-account-dialog';
import { AdminDeleteUserDialog } from './admin-delete-user-dialog';
import { AdminEditUserDialog } from './admin-edit-user-dialog';
import { AdminImpersonateUserDialog } from './admin-impersonate-user-dialog';
import { AdminMembersTable } from './admin-members-table';
import { AdminMembershipsTable } from './admin-memberships-table';
import { AdminReactivateUserDialog } from './admin-reactivate-user-dialog';

type Account = Tables<'accounts'>;
type Membership = Tables<'accounts_memberships'>;

export function AdminAccountPage(props: {
  account: Account & { memberships: Membership[] };
}) {
  const isPersonalAccount = props.account.is_personal_account;

  if (isPersonalAccount) {
    return <PersonalAccountPage account={props.account} />;
  }

  return <TeamAccountPage account={props.account} />;
}

async function PersonalAccountPage(props: { account: Account }) {
  const adminClient = getSupabaseServerAdminClient();

  const [memberships, userResult, profileResult] = await Promise.all([
    getMemberships(props.account.id),
    adminClient.auth.admin.getUserById(props.account.id),
    adminClient
      .from('profiles')
      .select('mobile_number')
      .eq('id', props.account.id)
      .maybeSingle(),
  ]);

  if (userResult.error) {
    throw userResult.error;
  }

  const isBanned =
    'banned_until' in userResult.data.user &&
    userResult.data.user.banned_until !== 'none';

  const isSuperAdminAccount =
    userResult.data.user.app_metadata?.role === 'super-admin';

  return (
    <PageBody className="gap-y-4">
      <PageHeader
        description={
          <AppBreadcrumbs
            values={{
              [props.account.id]:
                props.account.name ?? props.account.email ?? 'Account',
            }}
          />
        }
      >
        <If condition={!isSuperAdminAccount}>
          <div className={'flex gap-x-2.5'}>
            <If condition={isBanned}>
              <AdminReactivateUserDialog userId={props.account.id}>
                <Button
                  size={'sm'}
                  variant={'secondary'}
                  data-test={'admin-reactivate-account-button'}
                >
                  <ShieldPlus className={'mr-1 h-4'} />
                  Reactivate
                </Button>
              </AdminReactivateUserDialog>
            </If>

            <If condition={!isBanned}>
              <AdminEditUserDialog
                userId={props.account.id}
                userName={props.account.name ?? ''}
                userPhone={
                  normalizePhoneNumber(userResult.data.user.phone) ||
                  userResult.data.user.phone ||
                  profileResult.data?.mobile_number ||
                  ''
                }
                userEmail={userResult.data.user.email ?? ''}
              >
                <Button
                  size={'sm'}
                  variant={'secondary'}
                  data-test={'admin-edit-account-button'}
                >
                  Edit
                </Button>
              </AdminEditUserDialog>

              <AdminBanUserDialog userId={props.account.id}>
                <Button
                  size={'sm'}
                  variant={'secondary'}
                  data-test={'admin-ban-account-button'}
                >
                  <Ban className={'text-destructive mr-1 h-3'} />
                  Ban
                </Button>
              </AdminBanUserDialog>

              <AdminImpersonateUserDialog userId={props.account.id}>
                <Button
                  size={'sm'}
                  variant={'secondary'}
                  data-test={'admin-impersonate-button'}
                >
                  <VenetianMask className={'mr-1 h-4 text-blue-500'} />
                  Impersonate
                </Button>
              </AdminImpersonateUserDialog>
            </If>

            <AdminDeleteUserDialog userId={props.account.id}>
              <Button
                size={'sm'}
                variant={'destructive'}
                data-test={'admin-delete-account-button'}
              >
                <BadgeX className={'mr-1 h-4'} />
                Delete
              </Button>
            </AdminDeleteUserDialog>
          </div>
        </If>
      </PageHeader>

      <div className={'flex items-center justify-between'}>
        <div className={'flex items-center gap-x-4'}>
          <div className={'flex items-center gap-x-2.5'}>
            <ProfileAvatar
              pictureUrl={props.account.picture_url}
              displayName={props.account.name}
            />

            <span className={'text-sm font-semibold capitalize'}>
              {props.account.name}
            </span>
          </div>

          <Badge variant={'outline'}>User Account</Badge>

          <If condition={isSuperAdminAccount}>
            <Badge variant={'outline'}>Super Admin</Badge>
          </If>

          <If condition={isBanned}>
            <Badge variant={'destructive'}>Banned</Badge>
          </If>
        </div>
      </div>

      <div className={'flex flex-col gap-y-8'}>
        <SubscriptionsTable accountId={props.account.id} />

        <div className={'flex flex-col gap-y-2.5'}>
          <Heading level={6}>Teams</Heading>

          <div className={'rounded-lg border p-2'}>
            <AdminMembershipsTable memberships={memberships} />
          </div>
        </div>
      </div>
    </PageBody>
  );
}

async function TeamAccountPage(props: {
  account: Account & { memberships: Membership[] };
}) {
  const adminClient = getSupabaseServerAdminClient();

  const [members, { data: rawPermissions }, { data: assocRow }] =
    await Promise.all([
      getMembers(props.account.slug ?? ''),
      adminClient
        .from('assoc_admin_permissions')
        .select('target_role, can_invite, can_edit, can_delete')
        .eq('association_id', props.account.id),
      adminClient
        .from('associations')
        .select('is_test')
        .eq('account_id', props.account.id)
        .maybeSingle(),
    ]);

  const isTestAssociation = assocRow?.is_test ?? false;

  const initialPermissions: AssocPermissionRow[] = (rawPermissions ?? []).map(
    (r) => ({
      targetRole: r.target_role as AssocPermissionRow['targetRole'],
      canInvite: r.can_invite,
      canEdit: r.can_edit,
      canDelete: r.can_delete,
    }),
  );

  return (
    <PageBody className={'gap-y-6'}>
      <PageHeader
        description={
          <AppBreadcrumbs
            values={{
              [props.account.id]:
                props.account.name ?? props.account.email ?? 'Account',
            }}
          />
        }
      >
        <div className={'flex gap-x-2.5'}>
          <Link href={`/home/${props.account.slug}`} target="_blank">
            <Button size={'sm'} variant={'outline'}>
              Open Association Workspace
            </Button>
          </Link>
        </div>
      </PageHeader>

      <div className={'flex justify-between'}>
        <div className={'flex items-center gap-x-4'}>
          <div className={'flex items-center gap-x-2.5'}>
            <ProfileAvatar
              pictureUrl={props.account.picture_url}
              displayName={props.account.name}
            />

            <span className={'text-sm font-semibold capitalize'}>
              {props.account.name}
            </span>
          </div>

          <Badge variant={'outline'}>Association</Badge>

          {isTestAssociation && (
            <Badge
              className={'border-amber-400 bg-amber-50 text-amber-700'}
              variant={'outline'}
            >
              Test
            </Badge>
          )}
        </div>
      </div>

      <div>
        <div className={'flex flex-col gap-y-8'}>
          <SubscriptionsTable accountId={props.account.id} />

          <div className={'flex flex-col gap-y-2.5'}>
            <Heading level={6}>Team Members</Heading>

            <div className={'rounded-lg border p-2'}>
              <AdminMembersTable members={members} />
            </div>
          </div>

          <Card>
            <CardContent className={'pt-6'}>
              <AdminAssocPermissions
                key={props.account.id}
                associationId={props.account.id}
                initialPermissions={initialPermissions}
              />
            </CardContent>
          </Card>

          <Card className={'border-destructive border'}>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
              <CardDescription>
                Actions in this area are irreversible and can lead to data loss.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={'flex flex-col space-y-4'}>
                <div className={'flex flex-col space-y-1'}>
                  <span className={'text-sm font-medium'}>
                    Delete Team Account
                  </span>
                  <p className={'text-muted-foreground text-sm'}>
                    Once you delete this team account, all associated data,
                    settings, and members will be permanently removed. This
                    action is irreversible.
                  </p>
                </div>
                <div>
                  <AdminDeleteAccountDialog accountId={props.account.id}>
                    <Button
                      size={'sm'}
                      variant={'destructive'}
                      data-test={'admin-delete-account-button'}
                    >
                      <BadgeX className={'mr-1 h-4'} />
                      Delete Team Account
                    </Button>
                  </AdminDeleteAccountDialog>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageBody>
  );
}

async function SubscriptionsTable(props: { accountId: string }) {
  const client = getSupabaseServerClient();

  const { data: subscription, error } = await client
    .from('subscriptions')
    .select('*, subscription_items !inner (*)')
    .eq('account_id', props.accountId)
    .maybeSingle();

  if (error) {
    return (
      <Alert variant={'destructive'}>
        <AlertTitle>There was an error loading subscription.</AlertTitle>

        <AlertDescription>
          Please check the logs for more information or try again later.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={'flex flex-col gap-y-1'}>
      <Heading level={6}>Subscription</Heading>

      <If
        condition={subscription}
        fallback={
          <span className={'text-muted-foreground text-sm'}>
            This account does not currently have a subscription.
          </span>
        }
      >
        {(subscription) => {
          return (
            <div className={'flex flex-col space-y-4'}>
              <Table>
                <TableHeader>
                  <TableHead>Subscription ID</TableHead>

                  <TableHead>Provider</TableHead>

                  <TableHead>Customer ID</TableHead>

                  <TableHead>Status</TableHead>

                  <TableHead>Created At</TableHead>

                  <TableHead>Period Starts At</TableHead>

                  <TableHead>Ends At</TableHead>
                </TableHeader>

                <TableBody>
                  <TableRow>
                    <TableCell>
                      <span>{subscription.id}</span>
                    </TableCell>

                    <TableCell>
                      <span>{subscription.billing_provider}</span>
                    </TableCell>

                    <TableCell>
                      <span>{subscription.billing_customer_id}</span>
                    </TableCell>

                    <TableCell>
                      <span>{subscription.status}</span>
                    </TableCell>

                    <TableCell>
                      <span>{subscription.created_at}</span>
                    </TableCell>

                    <TableCell>
                      <span>{subscription.period_starts_at}</span>
                    </TableCell>

                    <TableCell>
                      <span>{subscription.period_ends_at}</span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <Table>
                <TableHeader>
                  <TableHead>Product ID</TableHead>

                  <TableHead>Variant ID</TableHead>

                  <TableHead>Quantity</TableHead>

                  <TableHead>Price</TableHead>

                  <TableHead>Interval</TableHead>

                  <TableHead>Type</TableHead>
                </TableHeader>

                <TableBody>
                  {subscription.subscription_items.map((item) => {
                    return (
                      <TableRow key={item.variant_id}>
                        <TableCell>
                          <span>{item.product_id}</span>
                        </TableCell>

                        <TableCell>
                          <span>{item.variant_id}</span>
                        </TableCell>

                        <TableCell>
                          <span>{item.quantity}</span>
                        </TableCell>

                        <TableCell>
                          <span>{item.price_amount}</span>
                        </TableCell>

                        <TableCell>
                          <span>{item.interval}</span>
                        </TableCell>

                        <TableCell>
                          <span>{item.type}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          );
        }}
      </If>
    </div>
  );
}

async function getMemberships(userId: string) {
  const client = getSupabaseServerClient();

  const memberships = await client
    .from('accounts_memberships')
    .select<
      string,
      Membership & {
        account: {
          id: string;
          name: string;
        };
      }
    >('*, account: account_id !inner (id, name)')
    .eq('user_id', userId);

  if (memberships.error) {
    throw memberships.error;
  }

  return memberships.data;
}

async function getMembers(accountSlug: string) {
  const client = getSupabaseServerClient();
  // Admin client required: profiles.rls only permits id = auth.uid(), so the
  // regular server client returns only the logged-in admin's own row.
  const adminClient = getSupabaseServerAdminClient();

  const membersResult = await client.rpc('get_account_members', {
    account_slug: accountSlug,
  });

  if (membersResult.error) {
    throw membersResult.error;
  }

  const members = membersResult.data ?? [];
  const userIds = members.map((m) => m.user_id);
  const phoneByUserId = new Map<string, string | null>();
  const emailByUserId = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await adminClient
      .from('profiles')
      .select('id, mobile_number, email')
      .in('id', userIds);

    if (profilesError) {
      console.error(profilesError);
    } else {
      for (const profile of profiles ?? []) {
        phoneByUserId.set(profile.id, profile.mobile_number);
        emailByUserId.set(profile.id, profile.email ?? null);
      }
    }
  }

  return members.map((member) => ({
    ...member,
    phone: phoneByUserId.get(member.user_id) ?? null,
    // accounts.email may be null for phone-only users; fall back to profiles.email
    email: member.email ?? emailByUserId.get(member.user_id) ?? null,
  }));
}
