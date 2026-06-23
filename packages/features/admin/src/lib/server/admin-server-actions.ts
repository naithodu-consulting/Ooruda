'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  BanUserSchema,
  DeleteAccountSchema,
  DeleteUserSchema,
  ImpersonateUserSchema,
  ReactivateUserSchema,
} from './schema/admin-actions.schema';
import { CreateUserSchema } from './schema/create-user.schema';
import {
  RemoveUserRoleSchema,
  SetUserRoleSchema,
} from './schema/manage-role.schema';
import { ResetPasswordSchema } from './schema/reset-password.schema';
import { createAdminAccountsService } from './services/admin-accounts.service';
import { createAdminAuthUserService } from './services/admin-auth-user.service';
import { adminActionClient } from './utils/admin-action-client';

/**
 * @name banUserAction
 * @description Ban a user from the system.
 */
export const banUserAction = adminActionClient
  .inputSchema(BanUserSchema)
  .action(async ({ parsedInput: { userId } }) => {
    const service = getAdminAuthService();
    const logger = await getLogger();

    logger.info({ userId }, `Super Admin is banning user...`);

    const { error } = await service.banUser(userId);

    if (error) {
      logger.error({ error }, `Error banning user`);
      throw new Error('Error banning user');
    }

    revalidateAdmin();

    logger.info({ userId }, `Super Admin has successfully banned user`);
  });

/**
 * @name reactivateUserAction
 * @description Reactivate a user in the system.
 */
export const reactivateUserAction = adminActionClient
  .inputSchema(ReactivateUserSchema)
  .action(async ({ parsedInput: { userId } }) => {
    const service = getAdminAuthService();
    const logger = await getLogger();

    logger.info({ userId }, `Super Admin is reactivating user...`);

    const { error } = await service.reactivateUser(userId);

    if (error) {
      logger.error({ error }, `Error reactivating user`);
      throw new Error('Error reactivating user');
    }

    revalidateAdmin();

    logger.info({ userId }, `Super Admin has successfully reactivated user`);
  });

/**
 * @name impersonateUserAction
 * @description Impersonate a user in the system.
 */
export const impersonateUserAction = adminActionClient
  .inputSchema(ImpersonateUserSchema)
  .action(async ({ parsedInput: { userId } }) => {
    const service = getAdminAuthService();
    const logger = await getLogger();

    logger.info({ userId }, `Super Admin is impersonating user...`);

    return await service.impersonateUser(userId);
  });

/**
 * @name deleteUserAction
 * @description Delete a user from the system.
 */
export const deleteUserAction = adminActionClient
  .inputSchema(DeleteUserSchema)
  .action(async ({ parsedInput: { userId } }) => {
    const service = getAdminAuthService();
    const logger = await getLogger();

    logger.info({ userId }, `Super Admin is deleting user...`);

    await service.deleteUser(userId);

    logger.info({ userId }, `Super Admin has successfully deleted user`);

    redirect('/admin/accounts');
  });

/**
 * @name deleteAccountAction
 * @description Delete an account from the system.
 */
export const deleteAccountAction = adminActionClient
  .inputSchema(DeleteAccountSchema)
  .action(async ({ parsedInput: { accountId } }) => {
    const service = getAdminAccountsService();
    const logger = await getLogger();

    logger.info({ accountId }, `Super Admin is deleting account...`);

    await service.deleteAccount(accountId);

    revalidateAdmin();

    logger.info({ accountId }, `Super Admin has successfully deleted account`);

    redirect('/admin/accounts');
  });

/**
 * @name createUserAction
 * @description Create a new user in the system.
 */
export const createUserAction = adminActionClient
  .inputSchema(CreateUserSchema)
  .action(
    async ({ parsedInput: { phone, fullName, associationId, role }, ctx }) => {
      const adminClient = getSupabaseServerAdminClient();
      const logger = await getLogger();

      // Normalise phone: ensure it starts with +
      const normalisedPhone = phone.startsWith('+') ? phone : `+${phone}`;

      logger.info(
        { phone: normalisedPhone, associationId, role },
        `Super Admin is creating a new user...`,
      );

      // The `kit.setup_new_user` trigger reads `raw_user_meta_data ->> 'name'`
      // to populate `accounts.name`, so the key must be `name` (not just
      // `full_name`) or the personal account is created with a blank name.
      const { data, error } = await adminClient.auth.admin.createUser({
        phone: normalisedPhone,
        phone_confirm: true,
        user_metadata: { name: fullName, full_name: fullName },
      });

      if (error) {
        logger.error({ error }, `Error creating user`);
        throw new Error(`Error creating user: ${error.message}`);
      }

      // Upsert profile so the phone-invite gate recognises this user
      await adminClient.from('profiles').upsert(
        {
          id: data.user.id,
          full_name: fullName,
          mobile_number: normalisedPhone,
        },
        { onConflict: 'id' },
      );

      // Add the user to the chosen association with the chosen role.
      const { error: membershipError } = await adminClient
        .from('accounts_memberships')
        .insert({
          user_id: data.user.id,
          account_id: associationId,
          account_role: role,
          created_by: ctx.user.id,
        });

      if (membershipError) {
        logger.error(
          { error: membershipError, userId: data.user.id },
          `User created but failed to assign association role`,
        );

        throw new Error(
          `User created but the role could not be assigned: ${membershipError.message}`,
        );
      }

      logger.info(
        { userId: data.user.id, associationId, role },
        `Super Admin has successfully created a new user`,
      );

      revalidatePath(`/admin/accounts`);

      return {
        success: true,
        user: data.user,
      };
    },
  );

/**
 * @name setUserRoleAction
 * @description Assign or change a user's role within an association. Upserts
 * the `accounts_memberships` row keyed by (user_id, account_id).
 */
export const setUserRoleAction = adminActionClient
  .inputSchema(SetUserRoleSchema)
  .action(async ({ parsedInput: { userId, associationId, role }, ctx }) => {
    const adminClient = getSupabaseServerAdminClient();
    const logger = await getLogger();

    logger.info(
      { userId, associationId, role },
      `Super Admin is setting a user's association role...`,
    );

    const { error } = await adminClient.from('accounts_memberships').upsert(
      {
        user_id: userId,
        account_id: associationId,
        account_role: role,
        updated_by: ctx.user.id,
      },
      { onConflict: 'user_id,account_id' },
    );

    if (error) {
      logger.error({ error }, `Error setting user role`);
      throw new Error(`Error setting user role: ${error.message}`);
    }

    revalidatePath(`/admin/accounts`);

    logger.info(
      { userId, associationId, role },
      `Super Admin has successfully set the user's role`,
    );
  });

/**
 * @name removeUserRoleAction
 * @description Remove a user's membership (and therefore role) from an
 * association.
 */
export const removeUserRoleAction = adminActionClient
  .inputSchema(RemoveUserRoleSchema)
  .action(async ({ parsedInput: { userId, associationId } }) => {
    const adminClient = getSupabaseServerAdminClient();
    const logger = await getLogger();

    logger.info(
      { userId, associationId },
      `Super Admin is removing a user's association role...`,
    );

    const { error } = await adminClient
      .from('accounts_memberships')
      .delete()
      .eq('user_id', userId)
      .eq('account_id', associationId);

    if (error) {
      logger.error({ error }, `Error removing user role`);

      // The DB blocks removing the association owner's own membership.
      throw new Error(`Error removing user role: ${error.message}`);
    }

    revalidatePath(`/admin/accounts`);

    logger.info(
      { userId, associationId },
      `Super Admin has successfully removed the user's role`,
    );
  });

/**
 * @name resetPasswordAction
 * @description Reset a user's password by sending a password reset email.
 */
export const resetPasswordAction = adminActionClient
  .inputSchema(ResetPasswordSchema)
  .action(async ({ parsedInput: { userId } }) => {
    const service = getAdminAuthService();
    const logger = await getLogger();

    logger.info({ userId }, `Super Admin is resetting user password...`);

    const result = await service.resetPassword(userId);

    logger.info(
      { userId },
      `Super Admin has successfully sent password reset email`,
    );

    return result;
  });

function revalidateAdmin() {
  revalidatePath(`/admin/accounts/[id]`, 'page');
}

function getAdminAuthService() {
  const client = getSupabaseServerClient();
  const adminClient = getSupabaseServerAdminClient();

  return createAdminAuthUserService(client, adminClient);
}

function getAdminAccountsService() {
  const client = getSupabaseServerClient();
  const adminClient = getSupabaseServerAdminClient();

  return createAdminAccountsService(adminClient, client);
}
