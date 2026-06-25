'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getLogger } from '@kit/shared/logger';
import { normalizePhoneNumber } from '@kit/shared/utils';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  BanUserSchema,
  DeleteAccountSchema,
  DeleteUserSchema,
  ImpersonateUserSchema,
  ReactivateUserSchema,
} from './schema/admin-actions.schema';
import { AssocAdminPermissionsSchema } from './schema/assoc-permissions.schema';
import { CreateAssociationSchema } from './schema/create-association.schema';
import {
  CreateUserSchema,
  UpdateUserSchema,
} from './schema/create-user.schema';
import {
  RemoveUserRoleSchema,
  SetUserRoleSchema,
} from './schema/manage-role.schema';
import { ResetPasswordSchema } from './schema/reset-password.schema';
import { createAdminAccountsService } from './services/admin-accounts.service';
import { createAdminAuthUserService } from './services/admin-auth-user.service';
import { adminActionClient } from './utils/admin-action-client';
import { isUserSuperAdmin } from './utils/is-super-admin';

function friendlyAuthError(message: string): string {
  const msg = message.toLowerCase();
  if (
    msg.includes('already been registered') ||
    msg.includes('already in use') ||
    (msg.includes('email') && msg.includes('exists'))
  ) {
    return 'This email address is already registered to another user. Please use a different email.';
  }
  if (
    msg.includes('invalid email') ||
    msg.includes('unable to validate email')
  ) {
    return 'The email address is not valid. Please check and try again.';
  }
  if (
    msg.includes('phone') &&
    (msg.includes('invalid') || msg.includes('exists'))
  ) {
    return 'This phone number is already registered or is not valid.';
  }
  return message;
}

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
    async ({
      parsedInput: { phone, email, fullName, associationId, role },
      ctx,
    }) => {
      const adminClient = getSupabaseServerAdminClient();
      const logger = await getLogger();

      // Normalise to canonical E.164 (+91XXXXXXXXXX). Guaranteed non-null by
      // the schema's validation, but guard for type-safety.
      const normalisedPhone = normalizePhoneNumber(phone);

      if (!normalisedPhone) {
        throw new Error('Invalid phone number');
      }

      const normalisedEmail = email.trim().toLowerCase();

      logger.info(
        { phone: normalisedPhone, associationId, role },
        `Super Admin is creating a new user...`,
      );

      // The `kit.setup_new_user` trigger reads `raw_user_meta_data ->> 'name'`
      // to populate `accounts.name`, so the key must be `name` (not just
      // `full_name`) or the personal account is created with a blank name.
      // Email is set + confirmed so the user can immediately use email OTP.
      const { data, error } = await adminClient.auth.admin.createUser({
        phone: normalisedPhone,
        phone_confirm: true,
        email: normalisedEmail,
        email_confirm: true,
        user_metadata: { name: fullName, full_name: fullName },
      });

      if (error) {
        logger.error({ error }, `Error creating user`);
        throw new Error(friendlyAuthError(error.message));
      }

      // Upsert profile so the phone-invite gate recognises this user
      await adminClient.from('profiles').upsert(
        {
          id: data.user.id,
          full_name: fullName,
          mobile_number: normalisedPhone,
          email: normalisedEmail,
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
 * @name createAssociationAction
 * @description Create a new association (team account) owned by an existing
 * user, who becomes its Association Admin. The `associations` row is
 * auto-created by the `trg_create_association` trigger.
 */
export const createAssociationAction = adminActionClient
  .inputSchema(CreateAssociationSchema)
  .action(async ({ parsedInput: { name, ownerId } }) => {
    const adminClient = getSupabaseServerAdminClient();
    const logger = await getLogger();

    logger.info({ name, ownerId }, `Super Admin is creating an association...`);

    const { data, error } = await adminClient.rpc('create_team_account', {
      account_name: name,
      user_id: ownerId,
    });

    if (error) {
      logger.error({ error }, `Error creating association`);
      throw new Error(`Error creating association: ${error.message}`);
    }

    revalidatePath(`/admin/accounts`);

    logger.info(
      { accountId: data?.id, name },
      `Super Admin has successfully created an association`,
    );

    return { success: true };
  });

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

    if (await isUserSuperAdmin(adminClient, userId)) {
      throw new Error('Cannot change roles for a Super Admin account');
    }

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

    if (await isUserSuperAdmin(adminClient, userId)) {
      throw new Error('Cannot remove roles for a Super Admin account');
    }

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

/**
 * @name updateUserDetailsAction
 * @description Update user profile details (full name and phone number).
 */
export const updateUserDetailsAction = adminActionClient
  .inputSchema(UpdateUserSchema)
  .action(
    async ({
      parsedInput: { userId, fullName, phone, email, associationId, role },
      ctx,
    }) => {
      const adminClient = getSupabaseServerAdminClient();
      const logger = await getLogger();

      const normalisedPhone = normalizePhoneNumber(phone);

      if (!normalisedPhone) {
        throw new Error('Invalid phone number');
      }

      const normalisedEmail = email.trim().toLowerCase();

      logger.info(
        { userId, fullName, phone: normalisedPhone, associationId, role },
        `Super Admin is updating user details...`,
      );

      // 1. Update Auth user record (email_confirm so it's usable immediately)
      const { error: authError } = await adminClient.auth.admin.updateUserById(
        userId,
        {
          phone: normalisedPhone,
          email: normalisedEmail,
          email_confirm: true,
          user_metadata: { name: fullName, full_name: fullName },
        },
      );

      if (authError) {
        logger.error({ error: authError }, `Error updating auth user`);
        throw new Error(friendlyAuthError(authError.message));
      }

      // 2. Update profiles table record
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({
          full_name: fullName,
          mobile_number: normalisedPhone,
          email: normalisedEmail,
        })
        .eq('id', userId);

      if (profileError) {
        logger.error({ error: profileError }, `Error updating user profile`);
        throw new Error(`Error updating user profile: ${profileError.message}`);
      }

      // 3. Update accounts table record
      const { error: accountError } = await adminClient
        .from('accounts')
        .update({
          name: fullName,
        })
        .eq('id', userId);

      if (accountError) {
        logger.error({ error: accountError }, `Error updating user account`);
        throw new Error(`Error updating user account: ${accountError.message}`);
      }

      // 4. Update team membership role if both associationId and role are provided.
      // The DB trigger `kit.prevent_memberships_update` only permits an UPDATE
      // that actually changes account_role — any update where old == new raises
      // "Only the account_role can be updated". Use .neq() so the statement is
      // a no-op (0 rows) when the role hasn't changed, avoiding the trigger.
      if (associationId && role) {
        if (await isUserSuperAdmin(adminClient, userId)) {
          throw new Error('Cannot change roles for a Super Admin account');
        }

        const { error: roleError } = await adminClient
          .from('accounts_memberships')
          .update({
            account_role: role,
            updated_by: ctx.user.id,
          })
          .eq('user_id', userId)
          .eq('account_id', associationId)
          .neq('account_role', role);

        if (roleError) {
          logger.error({ error: roleError }, `Error setting user role`);
          throw new Error(`Error setting user role: ${roleError.message}`);
        }
      }

      logger.info(
        { userId },
        `Super Admin has successfully updated user details`,
      );

      revalidateAdmin();
      revalidatePath(`/admin/accounts`);
    },
  );

/**
 * @name setAssocAdminPermissionsAction
 * @description Upsert the 9-permission matrix (3 target roles × 3 actions)
 * for a given association. Only super-admins may call this; the admin client
 * bypasses RLS for the write since assoc_admin only has SELECT on this table.
 */
export const setAssocAdminPermissionsAction = adminActionClient
  .inputSchema(AssocAdminPermissionsSchema)
  .action(async ({ parsedInput: { associationId, permissions }, ctx }) => {
    const adminClient = getSupabaseServerAdminClient();
    const logger = await getLogger();

    logger.info(
      { associationId },
      `Super Admin is updating assoc_admin permissions...`,
    );

    const rows = permissions.map((p) => ({
      association_id: associationId,
      target_role: p.targetRole,
      can_invite: p.canInvite,
      can_edit: p.canEdit,
      can_delete: p.canDelete,
      updated_by: ctx.user.id,
    }));

    const { error } = await adminClient
      .from('assoc_admin_permissions')
      .upsert(rows, { onConflict: 'association_id,target_role' });

    if (error) {
      logger.error({ error }, `Error saving assoc_admin permissions`);
      throw new Error(`Error saving permissions: ${error.message}`);
    }

    revalidateAdmin();

    logger.info(
      { associationId },
      `Super Admin has successfully updated assoc_admin permissions`,
    );

    return { success: true };
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
