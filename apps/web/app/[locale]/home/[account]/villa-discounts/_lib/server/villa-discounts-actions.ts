'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { villaDiscountsEnabled } from '~/lib/villa/discount-flag';

import {
  DiscountReviewSchema,
  DiscountSchema,
  DiscountToggleSchema,
} from '../schemas/villa-discounts.schema';
import { createVillaDiscountsService } from './villa-discounts.service';

const service = () => createVillaDiscountsService(getSupabaseServerClient());

function assertEnabled() {
  if (!villaDiscountsEnabled())
    throw new Error('Discount codes are not available yet.');
}

// Roles are checked inside the database functions (owner; super-admin to
// approve), so a direct call cannot skip them either.
export const saveDiscountAction = authActionClient
  .inputSchema(DiscountSchema)
  .action(async ({ parsedInput }) => {
    assertEnabled();
    const result = await service().save(parsedInput);
    revalidatePath('/[locale]/home/[account]/villa-discounts', 'page');
    return result;
  });

export const toggleDiscountAction = authActionClient
  .inputSchema(DiscountToggleSchema)
  .action(async ({ parsedInput }) => {
    assertEnabled();
    await service().toggle(parsedInput);
    revalidatePath('/[locale]/home/[account]/villa-discounts', 'page');
  });

export const reviewDiscountAction = authActionClient
  .inputSchema(DiscountReviewSchema)
  .action(async ({ parsedInput }) => {
    assertEnabled();
    await service().review(parsedInput);
    revalidatePath('/[locale]/home/[account]/villa-discounts', 'page');
  });
