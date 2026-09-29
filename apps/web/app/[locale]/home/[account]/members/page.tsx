import { PlusCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { AdminBulkInviteDialog } from '@kit/admin/components/admin-bulk-invite-dialog';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import {
  AccountInvitationsTable,
  AccountMembersTable,
  InviteMembersDialogContainer,
} from '@kit/team-accounts/components';
import { AppBreadcrumbs } from '@kit/ui/app-breadcrumbs';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { If } from '@kit/ui/if';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { productForRole } from '~/lib/roles';

// local imports
import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import { DEFAULT_INVITE_ROLES } from './_lib/server/assoc-permissions.loader';
import { loadMembersPageData } from './_lib/server/members-page.loader';

interface TeamAccountMembersPageProps {
  params: Promise<{ account: string }>;
}

export const generateMetadata = async () => {
  const t = await getTranslations('teams');
  const title = t('members.pageTitle');

  return {
    title,
  };
};

async function TeamAccountMembersPage({ params }: TeamAccountMembersPageProps) {
  const client = getSupabaseServerClient();
  const slug = (await params).account;

  const [
    [members, invitations, canAddMember, { user, account }, assocPermissions],
    { data: isSuperAdmin },
  ] = await Promise.all([
    loadMembersPageData(client, slug),
    client.rpc('is_super_admin'),
  ]);

  const canManageRoles =
    !!isSuperAdmin || account.permissions.includes('roles.manage');
  const canManageInvitations =
    !!isSuperAdmin || account.permissions.includes('invites.manage');

  const isPrimaryOwner = account.primary_owner_user_id === user.id;
  const currentUserRoleHierarchy = account.role_hierarchy_level;

  // For non-super-admins, constrain invite/edit/delete to what super-admin
  // has granted for this association. Super-admins bypass all these checks.
  const effectiveAssocPermissions = isSuperAdmin
    ? {
        canInvite: () => true,
        canEdit: () => true,
        canDelete: () => true,
        allowedInviteRoles:
          productForRole(account.role) === 'villa'
            ? DEFAULT_INVITE_ROLES.villa
            : ['prop_owner', 'billing_operator', 'tenant'],
        // Undefined => no per-role gating; super-admins bypass these checks.
        editableRoles: undefined,
        deletableRoles: undefined,
      }
    : assocPermissions;

  // Hide the invite button when no roles are grantable yet (super-admin hasn't
  // configured can_invite for any role in this association).
  const hasInvitableRoles =
    !!isSuperAdmin || effectiveAssocPermissions.allowedInviteRoles.length > 0;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        title={<Trans i18nKey={'common.routes.members'} />}
        description={<AppBreadcrumbs />}
        account={account.slug}
      />

      <div className={'flex w-full max-w-4xl flex-col space-y-4 pb-32'}>
        <Card>
          <CardHeader className={'flex flex-row justify-between'}>
            <div className={'flex flex-col space-y-1.5'}>
              <CardTitle>
                <Trans i18nKey={'common.accountMembers'} />
              </CardTitle>

              <CardDescription>
                <Trans i18nKey={'common.membersTabDescription'} />
              </CardDescription>
            </div>

            <div className={'flex items-center gap-2'}>
              {isSuperAdmin ? (
                <AdminBulkInviteDialog
                  associationName={account.name ?? undefined}
                >
                  <Button
                    variant={'outline'}
                    size={'sm'}
                    data-test={'admin-bulk-invite-button'}
                  >
                    Bulk Invite Members
                  </Button>
                </AdminBulkInviteDialog>
              ) : null}

              <If
                condition={
                  canManageInvitations && canAddMember && hasInvitableRoles
                }
              >
                <InviteMembersDialogContainer
                  userRoleHierarchy={currentUserRoleHierarchy}
                  accountSlug={account.slug}
                  isSuperAdmin={!!isSuperAdmin}
                  allowedRoles={effectiveAssocPermissions.allowedInviteRoles}
                >
                  <Button size={'sm'} data-test={'invite-members-form-trigger'}>
                    <PlusCircle className={'w-4'} />

                    <span>
                      <Trans i18nKey={'teams.inviteMembersButton'} />
                    </span>
                  </Button>
                </InviteMembersDialogContainer>
              </If>
            </div>
          </CardHeader>

          <CardContent>
            <AccountMembersTable
              userRoleHierarchy={currentUserRoleHierarchy}
              currentUserId={user.id}
              currentAccountId={account.id}
              members={members}
              isPrimaryOwner={isPrimaryOwner}
              canManageRoles={canManageRoles}
              isSuperAdmin={!!isSuperAdmin}
              assocEditableRoles={effectiveAssocPermissions.editableRoles}
              assocDeletableRoles={effectiveAssocPermissions.deletableRoles}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={'flex flex-row justify-between'}>
            <div className={'flex flex-col space-y-1.5'}>
              <CardTitle>
                <Trans i18nKey={'teams.pendingInvitesHeading'} />
              </CardTitle>

              <CardDescription>
                <Trans i18nKey={'teams.pendingInvitesDescription'} />
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <AccountInvitationsTable
              permissions={{
                canUpdateInvitation: canManageRoles,
                canRemoveInvitation: canManageRoles,
                currentUserRoleHierarchy,
                isSuperAdmin: !!isSuperAdmin,
              }}
              invitations={invitations}
            />
          </CardContent>
        </Card>
      </div>
    </PageBody>
  );
}

export default TeamAccountMembersPage;
