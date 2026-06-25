'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import * as z from 'zod';

import { authActionClient } from '@kit/next/safe-action';
import { getLogger } from '@kit/shared/logger';
import { getSafeRedirectPath } from '@kit/shared/utils';
import { Database } from '@kit/supabase/database';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { JWTUserData } from '@kit/supabase/types';

import { AcceptInvitationSchema } from '../../schema/accept-invitation.schema';
import { DeleteInvitationSchema } from '../../schema/delete-invitation.schema';
import { InviteMembersSchema } from '../../schema/invite-members.schema';
import { RenewInvitationSchema } from '../../schema/renew-invitation.schema';
import { UpdateInvitationSchema } from '../../schema/update-invitation.schema';
import { createInvitationContextBuilder } from '../policies/invitation-context-builder';
import { createInvitationsPolicyEvaluator } from '../policies/invitation-policies';
import { createAccountInvitationsService } from '../services/account-invitations.service';
import { createAccountPerSeatBillingService } from '../services/account-per-seat-billing.service';

/**
 * @name createInvitationsAction
 * @description Creates invitations for inviting members.
 */
export const createInvitationsAction = authActionClient
  .inputSchema(
    InviteMembersSchema.and(
      z.object({
        accountSlug: z.string().min(1),
      }),
    ),
  )
  .action(async ({ parsedInput: params, ctx: { user } }) => {
    const logger = await getLogger();

    logger.info(
      { params, userId: user.id },
      'User requested to send invitations',
    );

    const client = getSupabaseServerClient();

    // Get account ID from slug (needed for permission checks and policies)
    const { data: account, error: accountError } = await client
      .from('accounts')
      .select('id')
      .eq('slug', params.accountSlug)
      .single();

    if (accountError || !account) {
      logger.error(
        { accountSlug: params.accountSlug, error: accountError },
        'Account not found',
      );

      return {
        success: false,
        reasons: ['Account not found'],
      };
    }

    // Check invitation permissions (replaces RLS policy checks)
    const permissionsResult = await checkInvitationPermissions(
      account.id,
      user.id,
      params.invitations,
    );

    if (!permissionsResult.allowed) {
      logger.info(
        { reason: permissionsResult.reason, userId: user.id },
        'Invitations blocked by permission check',
      );

      return {
        success: false,
        reasons: permissionsResult.reason ? [permissionsResult.reason] : [],
      };
    }

    // Evaluate custom invitation policies
    const policiesResult = await evaluateInvitationsPolicies(
      params,
      user,
      account.id,
    );

    // If the invitations are not allowed, throw an error
    if (!policiesResult.allowed) {
      logger.info(
        { reasons: policiesResult?.reasons, userId: user.id },
        'Invitations blocked by policies',
      );

      return {
        success: false,
        reasons: policiesResult?.reasons,
      };
    }

    // invitations are allowed, so continue with the action
    // Use admin client since we've already validated permissions
    const adminClient = getSupabaseServerAdminClient();
    const service = createAccountInvitationsService(adminClient);

    try {
      await service.sendInvitations({
        ...params,
        invitedBy: user.id,
      });

      revalidateMemberPage();

      return {
        success: true,
      };
    } catch {
      return {
        success: false,
      };
    }
  });

/**
 * @name deleteInvitationAction
 * @description Deletes an invitation specified by the invitation ID.
 */
export const deleteInvitationAction = authActionClient
  .inputSchema(DeleteInvitationSchema)
  .action(async ({ parsedInput: data }) => {
    const client = getSupabaseServerClient();
    const service = createAccountInvitationsService(client);

    // Delete the invitation
    await service.deleteInvitation(data);

    revalidateMemberPage();

    return {
      success: true,
    };
  });

/**
 * @name updateInvitationAction
 * @description Updates an invitation.
 */
export const updateInvitationAction = authActionClient
  .inputSchema(UpdateInvitationSchema)
  .action(async ({ parsedInput: invitation }) => {
    const client = getSupabaseServerClient();

    const { data: isSuperAdmin } = await client.rpc('is_super_admin');

    if (!isSuperAdmin) {
      // Look up the account this invitation belongs to
      const { data: inv } = await client
        .from('invitations')
        .select('account_id')
        .eq('id', invitation.invitationId)
        .maybeSingle();

      if (inv) {
        const { data: perm } = await client
          .from('assoc_admin_permissions')
          .select('can_invite')
          .eq('association_id', inv.account_id)
          .eq('target_role', invitation.role)
          .maybeSingle();

        if (!perm?.can_invite) {
          throw new Error(
            'You do not have permission to assign this role to invitations',
          );
        }
      }
    }

    const service = createAccountInvitationsService(client);

    await service.updateInvitation(invitation);

    revalidateMemberPage();

    return {
      success: true,
    };
  });

/**
 * @name acceptInvitationAction
 * @description Accepts an invitation to join a team.
 */
export const acceptInvitationAction = authActionClient
  .inputSchema(AcceptInvitationSchema)
  .action(async ({ parsedInput: data, ctx: { user } }) => {
    const client = getSupabaseServerClient();

    const { inviteToken, nextPath } = data;
    const safeNextPath = getSafeRedirectPath(nextPath, '/home');

    // create the services
    const perSeatBillingService = createAccountPerSeatBillingService(client);
    const service = createAccountInvitationsService(client);

    // use admin client to accept invitation
    const adminClient = getSupabaseServerAdminClient();

    if (!user.email) {
      throw new Error('User has not set up a valid email');
    }

    // Accept the invitation
    const accountId = await service.acceptInvitationToTeam(adminClient, {
      inviteToken,
      userId: user.id,
      userEmail: user.email,
    });

    // If the account ID is not present, throw an error
    if (!accountId) {
      throw new Error('Failed to accept invitation');
    }

    // Increase the seats for the account
    await perSeatBillingService.increaseSeats(accountId);

    redirect(safeNextPath);
  });

/**
 * @name renewInvitationAction
 * @description Renews an invitation.
 */
export const renewInvitationAction = authActionClient
  .inputSchema(RenewInvitationSchema)
  .action(async ({ parsedInput: { invitationId } }) => {
    const client = getSupabaseServerClient();

    const service = createAccountInvitationsService(client);

    // Renew the invitation
    await service.renewInvitation(invitationId);

    revalidateMemberPage();

    return {
      success: true,
    };
  });

function revalidateMemberPage() {
  revalidatePath('/home/[account]/members', 'page');
}

/**
 * @name evaluateInvitationsPolicies
 * @description Evaluates invitation policies with performance optimization.
 * @param params - The invitations to evaluate (emails and roles).
 * @param user - The user performing the invitation.
 * @param accountId - The account ID (already fetched to avoid duplicate queries).
 */
async function evaluateInvitationsPolicies(
  params: z.output<typeof InviteMembersSchema> & { accountSlug: string },
  user: JWTUserData,
  accountId: string,
) {
  const evaluator = createInvitationsPolicyEvaluator();
  const hasPolicies = await evaluator.hasPoliciesForStage('submission');

  // No policies to evaluate, skip
  if (!hasPolicies) {
    return {
      allowed: true,
      reasons: [],
    };
  }

  const client = getSupabaseServerClient();
  const builder = createInvitationContextBuilder(client);
  const context = await builder.buildContextWithAccountId(
    params,
    user,
    accountId,
  );

  return evaluator.canInvite(context, 'submission');
}

/**
 * @name checkInvitationPermissions
 * @description Checks if the user has permission to invite members and
 * validates role hierarchy for each invitation.
 * Optimized to batch all checks in parallel.
 */
async function checkInvitationPermissions(
  accountId: string,
  userId: string,
  invitations: z.output<typeof InviteMembersSchema>['invitations'],
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const client = getSupabaseServerClient();
  const logger = await getLogger();

  const ctx = {
    name: 'checkInvitationPermissions',
    userId,
    accountId,
  };

  // Get unique roles from invitations to minimize RPC calls
  const uniqueRoles = [...new Set(invitations.map((inv) => inv.role))];

  // Run all checks in parallel: permission check + super admin check + role hierarchy checks for each unique role
  const [permissionResult, isSuperAdminResult, ...roleResults] =
    await Promise.all([
      client.rpc('has_permission', {
        user_id: userId,
        account_id: accountId,
        permission_name:
          'invites.manage' as Database['public']['Enums']['app_permissions'],
      }),
      client.rpc('is_super_admin'),
      ...uniqueRoles.map((role) =>
        Promise.all([
          client.rpc('has_more_elevated_role', {
            target_user_id: userId,
            target_account_id: accountId,
            role_name: role,
          }),
          client.rpc('has_same_role_hierarchy_level', {
            target_user_id: userId,
            target_account_id: accountId,
            role_name: role,
          }),
        ]).then(([elevated, sameLevel]) => ({
          role,
          allowed: elevated.data || sameLevel.data,
        })),
      ),
    ]);

  const isSuperAdmin = isSuperAdminResult.data;

  if (!isSuperAdmin) {
    const { data: permRows } = await client
      .from('assoc_admin_permissions')
      .select('target_role, can_invite')
      .eq('association_id', accountId)
      .in('target_role', uniqueRoles);

    const allowedRoleSet = new Set(
      (permRows ?? []).filter((r) => r.can_invite).map((r) => r.target_role),
    );

    const invalidRoles = uniqueRoles.filter(
      (role) => !allowedRoleSet.has(role),
    );

    if (invalidRoles.length > 0) {
      logger.info(
        { ...ctx, invalidRoles },
        'User is not a super admin and cannot invite members with these roles',
      );

      return {
        allowed: false,
        reason: 'You do not have permission to invite members with these roles',
      };
    }
  }

  // Check permission first
  if (!isSuperAdmin && !permissionResult.data) {
    logger.info(ctx, 'User does not have invites.manage permission');

    return {
      allowed: false,
      reason: 'You do not have permission to invite members',
    };
  }

  // Check role hierarchy results
  const failedRole = roleResults.find((result) => !result.allowed);

  if (!isSuperAdmin && failedRole) {
    logger.info(
      { ...ctx, role: failedRole.role },
      'User cannot invite to a role higher than their own',
    );

    return {
      allowed: false,
      reason: `You cannot invite members with the "${failedRole.role}" role`,
    };
  }

  return { allowed: true };
}
