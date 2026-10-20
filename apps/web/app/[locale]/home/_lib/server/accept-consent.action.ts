'use server';

import { revalidatePath } from 'next/cache';

import * as z from 'zod';

import { authActionClient } from '@kit/next/safe-action';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

export const acceptConsentAction = authActionClient
  .inputSchema(z.object({}))
  .action(async ({ ctx }) => {
    const client = getSupabaseServerClient();
    const logger = await getLogger();
    const userId = ctx.user.id;

    const { error } = await client
      .from('profiles')
      .update({ consent_accepted_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to save consent');
      throw new Error('Failed to save consent');
    }

    logger.info({ userId }, 'User consent accepted');
    revalidatePath('/home', 'layout');
  });
