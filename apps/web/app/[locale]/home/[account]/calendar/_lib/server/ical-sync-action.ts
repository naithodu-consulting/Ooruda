'use server';

import { revalidatePath } from 'next/cache';

import * as z from 'zod';

import { authActionClient } from '@kit/next/safe-action';

import { requireVillaRole } from '~/lib/villa/auth';
import { getVillaSite } from '~/lib/villa-db/client';
import { syncIcalFeeds } from '~/lib/villa/ical-sync';

const SyncIcalSchema = z.object({
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export const syncIcalAction = authActionClient
  .inputSchema(SyncIcalSchema)
  .action(async ({ parsedInput }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    const site = await getVillaSite(parsedInput.accountId, parsedInput.propertyId);
    const result = await syncIcalFeeds(site);

    revalidatePath('/[locale]/home/[account]/calendar', 'page');
    revalidatePath('/[locale]/home/[account]', 'page');

    return result;
  });
