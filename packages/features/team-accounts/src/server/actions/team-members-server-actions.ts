'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { createOtpApi } from '@kit/otp';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { RemoveMemberSchema } from '../../schema/remove-member.schema';
import { TransferOwnershipConfirmationSchema } from '../../schema/transfer-ownership-confirmation.schema';
import { UpdateMemberRoleSchema } from '../../schema/update-member-role.schema';
import { createAccountMembersService } from '../services/account-members.service';

/**
 * @name removeMemberFromAccountAction
 * @description Removes a member from an account.
 */
export const removeMemberFromAccountAction = authActionClient
  .inputSchema(RemoveMemberSchema)
  .action(async ({ parsedInput: { accountId, userId } }) => {
    const client = getSupabaseServerClient();

    const { data: isSuperAdmin } = await client.rpc('is_super_admin');

    if (!isSuperAdmin) {
      // Fetch the target member's current role to gate the delete action
      const { data: membership } = await client
        .from('accounts_memberships')
        .select('account_role')
        .eq('account_id', accountId)
        .eq('user_id', userId)
        .maybeSingle();

      if (membership) {
        const { data: perm } = await client
          .from('assoc_admin_permissions')
          .select('can_delete')
          .eq('association_id', accountId)
          .eq('target_role', membership.account_role)
          .maybeSingle();

        if (!perm?.can_delete) {
          throw new Error(
            'You do not have permission to remove members with this role',
          );
        }
      }
    }

    const service = createAccountMembersService(client);

    await service.removeMemberFromAccount({
      accountId,
      userId,
    });

    // revalidate all pages that depend on the account
    revalidatePath('/home/[account]', 'layout');

    return { success: true };
  });

/**
 * @name updateMemberRoleAction
 * @description Updates the role of a member in an account.
 */
export const updateMemberRoleAction = authActionClient
  .inputSchema(UpdateMemberRoleSchema)
  .action(async ({ parsedInput: data, ctx: { user } }) => {
    const client = getSupabaseServerClient();

    const { data: isSuperAdmin } = await client.rpc('is_super_admin');

    if (!isSuperAdmin) {
      const { data: perm } = await client
        .from('assoc_admin_permissions')
        .select('can_edit')
        .eq('association_id', data.accountId)
        .eq('target_role', data.role)
        .maybeSingle();

      if (!perm?.can_edit) {
        throw new Error(
          'You do not have permission to assign this role to members',
        );
      }
    }

    const service = createAccountMembersService(client);
    const adminClient = getSupabaseServerAdminClient();

    // update the role of the member. The acting user's id is passed so the
    // service can verify the actor is not assigning a role more elevated than
    // their own.
    await service.updateMemberRole(data, adminClient, user.id);

    // revalidate all pages that depend on the account
    revalidatePath('/home/[account]', 'layout');

    return { success: true };
  });

/**
 * @name transferOwnershipAction
 * @description Transfers the ownership of an account to another member.
 * Requires OTP verification for security.
 */
export const transferOwnershipAction = authActionClient
  .inputSchema(TransferOwnershipConfirmationSchema)
  .action(async ({ parsedInput: data, ctx: { user } }) => {
    const client = getSupabaseServerClient();
    const logger = await getLogger();

    const ctx = {
      name: 'teams.transferOwnership',
      userId: user.id,
      accountId: data.accountId,
    };

    logger.info(ctx, 'Processing team ownership transfer request...');

    // assert that the user is the owner of the account
    const { data: isOwner, error } = await client.rpc('is_account_owner', {
      account_id: data.accountId,
    });

    if (error || !isOwner) {
      logger.error(ctx, 'User is not the owner of this account');

      throw new Error(
        `You must be the owner of the account to transfer ownership`,
      );
    }

    // Verify the OTP
    const otpApi = createOtpApi(client);

    const otpResult = await otpApi.verifyToken({
      token: data.otp,
      userId: user.id,
      purpose: `transfer-team-ownership-${data.accountId}`,
      // allow a few honest retries while still bounding brute-force attempts
      maxVerificationAttempts: 5,
    });

    if (!otpResult.valid) {
      logger.error(ctx, 'Invalid OTP provided');
      throw new Error('Invalid OTP');
    }

    // validate the user ID matches the nonce's user ID
    if (otpResult.user_id !== user.id) {
      logger.error(
        ctx,
        `This token was meant to be used by a different user. Exiting.`,
      );

      throw new Error('Nonce mismatch');
    }

    logger.info(
      ctx,
      'OTP verification successful. Proceeding with ownership transfer...',
    );

    const service = createAccountMembersService(client);

    // at this point, the user is authenticated, is the owner of the account, and has verified via OTP
    // so we proceed with the transfer of ownership with admin privileges
    const adminClient = getSupabaseServerAdminClient();

    // transfer the ownership of the account
    await service.transferOwnership(data, adminClient);

    // revalidate all pages that depend on the account
    revalidatePath('/home/[account]', 'layout');

    logger.info(ctx, 'Team ownership transferred successfully');

    return {
      success: true,
    };
  });
