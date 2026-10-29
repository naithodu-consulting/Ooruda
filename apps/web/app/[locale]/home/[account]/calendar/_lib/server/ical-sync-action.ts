'use server';

import { revalidatePath } from 'next/cache';

import * as z from 'zod';

import { authActionClient } from '@kit/next/safe-action';

import { getVillaSite } from '~/lib/villa-db/client';
import { requireVillaRole } from '~/lib/villa/auth';
import { syncIcalFeeds } from '~/lib/villa/ical-sync';

const SyncIcalSchema = z.object({
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export const syncIcalAction = authActionClient
  .inputSchema(SyncIcalSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    const site = await getVillaSite(
      parsedInput.accountId,
      parsedInput.propertyId,
    );
    const result = await syncIcalFeeds(site, ctx.user.id);

    revalidatePath('/[locale]/home/[account]/calendar', 'page');
    revalidatePath('/[locale]/home/[account]/bookings', 'page');
    revalidatePath('/[locale]/home/[account]', 'page');

    return result;
  });
