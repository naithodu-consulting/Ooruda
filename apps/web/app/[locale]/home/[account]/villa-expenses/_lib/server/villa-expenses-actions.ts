'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { requireVillaRole } from '~/lib/villa/auth';

import {
  DeleteExpenseSchema,
  ExpenseSchema,
} from '../schemas/villa-expenses.schema';
import { createVillaExpensesService } from './villa-expenses.service';

const service = () => createVillaExpensesService(getSupabaseServerClient());

export const saveVillaExpenseAction = authActionClient
  .inputSchema(ExpenseSchema)
  .action(async ({ parsedInput, ctx }) => {
    await requireVillaRole(parsedInput.accountId, [
      'villa_owner',
      'villa_manager',
    ]);
    await service().save(parsedInput, ctx.user.id);
    revalidatePath('/[locale]/home/[account]/villa-expenses', 'page');
  });

export const deleteVillaExpenseAction = authActionClient
  .inputSchema(DeleteExpenseSchema)
  .action(async ({ parsedInput }) => {
    await requireVillaRole(parsedInput.accountId, ['villa_owner']);
    await service().remove(parsedInput);
    revalidatePath('/[locale]/home/[account]/villa-expenses', 'page');
  });
