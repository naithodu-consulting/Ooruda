import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';

import { addDays, formatISO } from 'date-fns';
import * as z from 'zod';

import { getLogger } from '@kit/shared/logger';
import { Database } from '@kit/supabase/database';

import type { DeleteInvitationSchema } from '../../schema/delete-invitation.schema';
import type { InviteMembersSchema } from '../../schema/invite-members.schema';
import type { UpdateInvitationSchema } from '../../schema/update-invitation.schema';

/**
 *
 * Create an account invitations service.
 */
export function createAccountInvitationsService(
  client: SupabaseClient<Database>,
) {
  return new AccountInvitationsService(client);
}

/**
 * @name AccountInvitationsService
 * @description Service for managing account invitations.
 */
class AccountInvitationsService {
  private readonly namespace = 'invitations';

  constructor(private readonly client: SupabaseClient<Database>) {}

  /**
   * @name deleteInvitation
   * @description Removes an invitation from the database.
   * @param params
   */
  async deleteInvitation(params: z.output<typeof DeleteInvitationSchema>) {
    const logger = await getLogger();

    const ctx = {
      name: this.namespace,
      ...params,
    };

    logger.info(ctx, 'Removing invitation...');

    const { data, error } = await this.client
      .from('invitations')
      .delete()
      .match({
        id: params.invitationId,
      });

    if (error) {
      logger.error(ctx, `Failed to remove invitation`);

      throw error;
    }

    logger.info(ctx, 'Invitation successfully removed');

    return data;
  }

  /**
   * @name updateInvitation
   * @param params
   * @description Updates an invitation in the database.
   */
  async updateInvitation(params: z.output<typeof UpdateInvitationSchema>) {
    const logger = await getLogger();

    const ctx = {
      name: this.namespace,
      ...params,
    };

    logger.info(ctx, 'Updating invitation...');

    const { data, error } = await this.client
      .from('invitations')
      .update({
        role: params.role,
      })
      .match({
        id: params.invitationId,
      });

    if (error) {
      logger.error(
        {
          ...ctx,
          error,
        },
        'Failed to update invitation',
      );

      throw error;
    }

    logger.info(ctx, 'Invitation successfully updated');

    return data;
  }

  /**
   * @name sendInvitations
   * @description Invites members to an association by phone number.
   *
   * This app authenticates with phone OTP only (no email), so there is no
   * invitation email to dispatch. For each phone number we call
   * `invite_to_association_by_phone`, which either adds an existing user to the
   * association immediately or stores a pending invitation that is claimed the
   * first time that phone signs in. Permission and role-hierarchy checks are
   * performed by the caller before this runs (it uses the admin client).
   * @param accountSlug
   * @param invitations
   * @param invitedBy
   */
  async sendInvitations({
    accountSlug,
    invitations,
    invitedBy,
  }: {
    invitations: z.output<typeof InviteMembersSchema>['invitations'];
    accountSlug: string;
    invitedBy: string;
  }) {
    const logger = await getLogger();

    const ctx = {
      accountSlug,
      name: this.namespace,
    };

    logger.info(
      { ...ctx, count: invitations.length },
      'Processing phone invitations...',
    );

    const results = await Promise.all(
      invitations.map((invitation) =>
        this.client.rpc('invite_to_association_by_phone', {
          account_slug: accountSlug,
          p_phone: invitation.phone,
          p_role: invitation.role,
          invited_by: invitedBy,
          p_name: invitation.name || undefined,
          p_email: invitation.email || undefined,
        }),
      ),
    );

    for (const result of results) {
      if (result.error) {
        logger.error(
          {
            ...ctx,
            error: result.error,
          },
          `Failed to invite member to account ${accountSlug}`,
        );

        throw result.error;
      }
    }

    logger.info(
      {
        ...ctx,
        outcomes: results.map((result) => result.data),
      },
      'Phone invitations processed',
    );
  }

  /**
   * @name acceptInvitationToTeam
   * @description Accepts an invitation to join a team.
   */
  async acceptInvitationToTeam(
    adminClient: SupabaseClient<Database>,
    params: {
      userId: string;
      userEmail: string;
      inviteToken: string;
    },
  ) {
    const logger = await getLogger();

    const ctx = {
      name: this.namespace,
      userId: params.userId,
      inviteTokenFingerprint: getSecretFingerprint(params.inviteToken),
    };

    logger.info(ctx, 'Accepting invitation to team');

    const invitation = await adminClient
      .from('invitations')
      .select('email')
      .eq('invite_token', params.inviteToken)
      .single();

    if (invitation.error) {
      logger.error(
        {
          ...ctx,
          error: invitation.error,
        },
        'Failed to get invitation',
      );
    }

    // For email-based invitations verify the accepting user's email matches.
    // Phone-only invitations have no email on the row, so skip this check.
    if (invitation.data?.email && invitation.data.email !== params.userEmail) {
      logger.error({
        ...ctx,
        error: 'Invitation email does not match user email',
      });

      throw new Error('Invitation email does not match user email');
    }

    const { error, data } = await adminClient.rpc('accept_invitation', {
      token: params.inviteToken,
      user_id: params.userId,
    });

    if (error) {
      logger.error(
        {
          ...ctx,
          error,
        },
        'Failed to accept invitation to team',
      );

      throw error;
    }

    logger.info(ctx, 'Successfully accepted invitation to team');

    return data;
  }

  /**
   * @name renewInvitation
   * @description Renews an invitation to join a team by extending the expiration date by 7 days.
   * @param invitationId
   */
  async renewInvitation(invitationId: number) {
    const logger = await getLogger();

    const ctx = {
      invitationId,
      name: this.namespace,
    };

    logger.info(ctx, 'Renewing invitation...');

    const sevenDaysFromNow = formatISO(addDays(new Date(), 7));

    const { data, error } = await this.client
      .from('invitations')
      .update({
        expires_at: sevenDaysFromNow,
      })
      .match({
        id: invitationId,
      });

    if (error) {
      logger.error(
        {
          ...ctx,
          error,
        },
        'Failed to renew invitation',
      );

      throw error;
    }

    logger.info(ctx, 'Invitation successfully renewed');

    return data;
  }
}

function getSecretFingerprint(value: string) {
  if (value.length <= 8) {
    return '[redacted]';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
