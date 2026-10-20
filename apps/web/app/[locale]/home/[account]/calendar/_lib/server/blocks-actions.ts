'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';

import { requireVillaRole } from '~/lib/villa/auth';

import {
  CreateBlockSchema,
  ReleaseBlockSchema,
} from '../schemas/blocks.schema';
import { createBlocksService } from './blocks.service';

function revalidateCalendar() {
  revalidatePath('/[locale]/home/[account]/calendar', 'page');
  revalidatePath('/[locale]/home/[account]', 'page');
}

// Owners and managers both run the calendar day to day.
export const createBlockAction = authActionClient
  .inputSchema(CreateBlockSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    const block = await createBlocksService().create(parsedInput, ctx.user.id);

    revalidateCalendar();

    return { id: block.id };
  });

export const releaseBlockAction = authActionClient
  .inputSchema(ReleaseBlockSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_admin',
      'villa_manager',
    ]);

    await createBlocksService().release(parsedInput, ctx.user.id);

    revalidateCalendar();
  });
