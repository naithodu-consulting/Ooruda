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
import { isSuperAdmin, isUserSuperAdmin } from './utils/is-super-admin';

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

    revalidateAdmin();

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

export interface BulkInviteRow {
  phone: string;
  name?: string;
  email?: string;
  role: string;
  association_name: string;
  /** Unit number from the association XLSX — used to update units.status */
  unit_no?: string;
  /** DB value to write to units.status when unit_no is provided */
  unit_status?: 'Self Occupied' | 'Rented' | 'Vacant';
  /**
   * When the owner row represents a company (e.g. "AAJEETH INNOVATION LLP"),
   * set this to write owner_is_company + owner_company_name on the unit.
   * Only applied on prop_owner rows.
   */
  owner_company_name?: string;
}

export interface BulkInviteResult {
  imported: number;
  skipped: { row: number; phone: string; reason: string }[];
}

/**
 * Bulk-invite multiple members via CSV. Each row specifies phone, name, email
 * (optional), role, and association_name. Bad rows are skipped; a summary is
 * returned so the caller can display what succeeded and what failed.
 */
export async function bulkInviteMembersAction(
  rows: BulkInviteRow[],
): Promise<BulkInviteResult> {
  const adminClient = getSupabaseServerAdminClient();
  const logger = await getLogger();

  const serverClient = getSupabaseServerClient();
  const [
    isAdmin,
    {
      data: { user: actorUser },
    },
  ] = await Promise.all([
    isSuperAdmin(serverClient),
    serverClient.auth.getUser(),
  ]);
  if (!isAdmin) {
    throw new Error('Only super admins can perform bulk invites.');
  }
  // Resolve all association names up-front to avoid N+1 queries.
  const { data: accounts } = await adminClient
    .from('accounts')
    .select('id, name')
    .eq('is_personal_account', false);

  const assocIdByName = new Map<string, string>(
    (accounts ?? []).map((a) => [(a.name ?? '').trim().toLowerCase(), a.id]),
  );

  // associations.id (FK used in units.association_id) differs from accounts.id.
  // Build a lookup from accounts.id → associations.id so unit updates use the right FK.
  const { data: assocRows } = await adminClient
    .from('associations')
    .select('id, account_id');
  const assocRowIdByAccountId = new Map<string, string>(
    (assocRows ?? []).map((a) => [a.account_id, a.id]),
  );

  // Resolve existing users for phones AND emails in this batch by querying
  // auth.users directly (not profiles) — this catches users whose
  // profiles.mobile_number was cleared or never populated after a previous
  // import to another association.
  const existingUserByPhone = new Map<string, string>();
  const existingUserByEmail = new Map<string, string>();
  {
    const batchPhones = rows
      .map((r) => normalizePhoneNumber(r.phone))
      .filter((p): p is string => Boolean(p));
    const batchEmails = rows
      .map((r) => r.email?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e));

    if (batchPhones.length > 0 || batchEmails.length > 0) {
      const { data: foundUsers } = await adminClient.rpc(
        'find_users_by_phones_or_emails',
        { p_phones: batchPhones, p_emails: batchEmails },
      );
      for (const u of foundUsers ?? []) {
        if (u.phone) existingUserByPhone.set(u.phone, u.id);
        if (u.email) existingUserByEmail.set(u.email, u.id);
      }
    }
  }

  let imported = 0;
  const skipped: BulkInviteResult['skipped'] = [];
  const importedByAssociation = new Map<string, number>();
  const validRoles = [
    'assoc_admin',
    'billing_operator',
    'prop_owner',
    'tenant',
  ];

  // ── Phase 1: Validate all rows synchronously (no DB calls) ──────────────────
  // Catch bad phones, unknown associations, and invalid roles up-front so the
  // parallel phases below only work with clean data.
  type ValidatedRow = {
    rowNum: number;
    normalised: string;
    associationId: string;
    row: BulkInviteRow;
  };
  const validatedRows: ValidatedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 1;
    const normalised = normalizePhoneNumber(row.phone);

    if (!normalised) {
      skipped.push({
        row: rowNum,
        phone: row.phone,
        reason: 'Invalid phone number',
      });
      continue;
    }
    const associationId = assocIdByName.get(
      row.association_name.trim().toLowerCase(),
    );
    if (!associationId) {
      skipped.push({
        row: rowNum,
        phone: normalised,
        reason: `Association "${row.association_name}" not found`,
      });
      continue;
    }
    if (!validRoles.includes(row.role)) {
      skipped.push({
        row: rowNum,
        phone: normalised,
        reason: `Invalid role "${row.role}"`,
      });
      continue;
    }
    validatedRows.push({ rowNum, normalised, associationId, row });
  }

  // ── Phase 2: Resolve / create users in parallel batches ─────────────────────
  // Each unique phone needs at most one createUser call. Deduplicate first so
  // two rows sharing a phone (e.g. owner + tenant in a RENTED unit) only fire
  // one Auth API call; subsequent rows reuse the result from the map.
  // Supabase Auth rate-limits concurrent createUser calls, so use batches of 8.
  const USER_CREATE_BATCH = 8;
  const createFailures = new Map<string, string>(); // phone → error reason

  // Seed email-based lookups into the phone map so membership phase can
  // resolve users who exist by email but not by phone.
  for (const { normalised, row } of validatedRows) {
    if (!existingUserByPhone.has(normalised) && row.email) {
      const byEmail = existingUserByEmail.get(row.email.trim().toLowerCase());
      if (byEmail) existingUserByPhone.set(normalised, byEmail);
    }
  }

  // Collect unique phones that still need a new user created.
  const phonesNeedingCreation = [
    ...new Set(
      validatedRows
        .map((r) => r.normalised)
        .filter((p) => !existingUserByPhone.has(p)),
    ),
  ];

  const rowByPhone = new Map(validatedRows.map((r) => [r.normalised, r.row]));

  for (let i = 0; i < phonesNeedingCreation.length; i += USER_CREATE_BATCH) {
    const batch = phonesNeedingCreation.slice(i, i + USER_CREATE_BATCH);

    await Promise.all(
      batch.map(async (normalised) => {
        const row = rowByPhone.get(normalised)!;

        const createPayload: Parameters<
          typeof adminClient.auth.admin.createUser
        >[0] = {
          phone: normalised,
          phone_confirm: true,
          user_metadata: { name: row.name ?? '', full_name: row.name ?? '' },
        };
        if (row.email) {
          createPayload.email = row.email.trim().toLowerCase();
          createPayload.email_confirm = true;
        }

        const { data, error: createError } =
          await adminClient.auth.admin.createUser(createPayload);

        if (createError) {
          createFailures.set(
            normalised,
            friendlyAuthError(createError.message),
          );
          return;
        }

        const userId = data.user.id;
        existingUserByPhone.set(normalised, userId);

        // Profile upsert can run concurrently — fire and don't block batch.
        await adminClient.from('profiles').upsert(
          {
            id: userId,
            full_name: row.name ?? '',
            mobile_number: normalised,
            ...(row.email ? { email: row.email.trim().toLowerCase() } : {}),
          },
          { onConflict: 'id' },
        );
      }),
    );
  }

  // ── Phase 3: Insert memberships in parallel ──────────────────────────────────
  // All users are now resolved (or failed). Fire all membership inserts at once.
  await Promise.all(
    validatedRows.map(async ({ rowNum, normalised, associationId, row }) => {
      if (createFailures.has(normalised)) {
        skipped.push({
          row: rowNum,
          phone: normalised,
          reason: createFailures.get(normalised)!,
        });
        return;
      }

      const userId = existingUserByPhone.get(normalised);
      if (!userId) {
        skipped.push({
          row: rowNum,
          phone: normalised,
          reason: 'User could not be created or found',
        });
        return;
      }

      try {
        const { error: membershipError } = await adminClient
          .from('accounts_memberships')
          .insert({
            user_id: userId,
            account_id: associationId,
            account_role: row.role,
          });

        if (membershipError) {
          skipped.push({
            row: rowNum,
            phone: normalised,
            reason:
              membershipError.code === '23505'
                ? 'Already a member of this association'
                : membershipError.message,
          });
          return;
        }

        imported++;
        importedByAssociation.set(
          associationId,
          (importedByAssociation.get(associationId) ?? 0) + 1,
        );
        logger.info(
          { phone: normalised, associationId, role: row.role },
          'Bulk invite: member added',
        );
      } catch (err) {
        skipped.push({
          row: rowNum,
          phone: normalised,
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }),
  );

  // existingUserByPhone now covers all batch phones (populated at startup + updated
  // after each new createUser call), so reuse it directly for unit linking —
  // no second profiles query needed.
  const resolvedUserIdByPhone = existingUserByPhone;

  // Apply unit-level updates for rows that carry unit_no + unit_status.
  // Deduplicate by association_id + unit_no so each unit is written once.
  // unit_no is normalised to uppercase to match the convention used at unit creation.
  // For prop_owner rows: write owner_id, owner_is_company, owner_company_name.
  // For tenant rows: write tenant_id so a tenancies record can be created.
  const unitUpdateMap = new Map<
    string,
    {
      associationId: string;
      unit_no: string;
      unit_status: 'Self Occupied' | 'Rented' | 'Vacant';
      owner_id?: string;
      owner_is_company?: boolean;
      owner_company_name?: string | null;
      tenant_id?: string;
    }
  >();

  for (const row of rows) {
    if (!row.unit_no || !row.unit_status) continue;
    const accountId = assocIdByName.get(
      row.association_name.trim().toLowerCase(),
    );
    if (!accountId) continue;
    const associationId = assocRowIdByAccountId.get(accountId);
    if (!associationId) continue;
    const normalizedUnitNo = row.unit_no.trim().toUpperCase();
    const key = `${associationId}::${normalizedUnitNo}`;

    // unit_status is taken from the first row for this unit. If multiple rows
    // reference the same unit with different statuses, the first one wins.
    // Order rows in the CSV so the most authoritative status row comes first.
    const existing = unitUpdateMap.get(key) ?? {
      associationId,
      unit_no: normalizedUnitNo,
      unit_status: row.unit_status,
    };

    // assoc_admin with a unit_no is treated as the unit owner (they manage
    // the building because they own property in it). To register an admin
    // as a tenant of a unit, add a separate row with role = tenant.
    if (row.role === 'prop_owner' || row.role === 'assoc_admin') {
      const normPhone = normalizePhoneNumber(row.phone);
      if (normPhone) {
        const ownerId = resolvedUserIdByPhone.get(normPhone);
        if (ownerId) existing.owner_id = ownerId;
      }
      if (row.owner_company_name) {
        existing.owner_is_company = true;
        existing.owner_company_name = row.owner_company_name;
      }
    }

    if (row.role === 'tenant') {
      const normPhone = normalizePhoneNumber(row.phone);
      if (normPhone) {
        const tenantId = resolvedUserIdByPhone.get(normPhone);
        if (tenantId) existing.tenant_id = tenantId;
      }
    }

    unitUpdateMap.set(key, existing);
  }

  // All unit updates are independent — run them in parallel.
  await Promise.allSettled(
    [...unitUpdateMap.values()].map(
      async ({
        associationId,
        unit_no,
        unit_status,
        owner_id,
        owner_is_company,
        owner_company_name,
        tenant_id,
      }) => {
        const { data: updatedUnit, error } = await adminClient
          .from('units')
          .update({
            status: unit_status,
            ...(owner_id !== undefined ? { owner_id } : {}),
            ...(owner_is_company !== undefined ? { owner_is_company } : {}),
            ...(owner_company_name !== undefined ? { owner_company_name } : {}),
          })
          .eq('association_id', associationId)
          .eq('unit_no', unit_no)
          .select('id')
          .single();

        if (error) {
          logger.error(
            { associationId, unit_no, error },
            'bulkInvite: failed to update unit',
          );
          return;
        }

        // For RENTED units with a resolved tenant, create an active tenancy.
        // The DB enforces one active tenancy per unit (partial unique index on
        // unit_id where end_date IS NULL), so ignore 23505 for idempotency.
        if (tenant_id && updatedUnit?.id) {
          const { error: tenancyError } = await adminClient
            .from('tenancies')
            .insert({
              unit_id: updatedUnit.id,
              tenant_id,
              start_date: new Date().toISOString().split('T')[0]!,
              status: 'active',
            });
          if (tenancyError && tenancyError.code !== '23505') {
            logger.error(
              { unit_no, tenant_id, error: tenancyError },
              'bulkInvite: failed to create tenancy',
            );
          }
        }
      },
    ),
  );

  revalidatePath('/admin/accounts', 'page');

  // Write one audit log entry per association that had members imported.
  // Uses adminClient because the super-admin actor is not an association member
  // and would fail the member_insert_own RLS policy on audit_logs.
  if (actorUser?.id) {
    await Promise.all(
      [...importedByAssociation].map(async ([assocId, count]) => {
        const { error } = await adminClient.from('audit_logs').insert({
          association_id: assocId,
          actor_user_id: actorUser.id,
          action: 'members.bulk_imported',
          entity_type: 'account',
          entity_id: assocId,
          summary: `Bulk import: ${count} member${count === 1 ? '' : 's'} added`,
        });
        if (error) {
          logger.error(
            { assocId, error },
            'bulkInvite: failed to write audit log',
          );
        }
      }),
    );
  }

  skipped.sort((a, b) => a.row - b.row);
  return { imported, skipped };
}

// ─── Payment Gateway ──────────────────────────────────────────────────────────
// Super admin has read-only visibility into gateway status.
// All write operations (create / toggle / delete) are owned by the
// association admin via the association settings page.

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
