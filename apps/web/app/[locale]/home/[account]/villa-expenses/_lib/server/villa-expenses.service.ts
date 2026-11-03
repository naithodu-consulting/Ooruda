import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import type * as z from 'zod';

import type { Database } from '~/lib/database.types';
import { todayIst } from '~/lib/villa-db/dates';

import type {
  DeleteExpenseSchema,
  ExpenseSchema,
} from '../schemas/villa-expenses.schema';

type Client = SupabaseClient<Database>;

/**
 * Villa expenses. Runs on the member's own client: RLS decides who may add
 * (owner, manager), edit (owner, manager) and delete (owner only).
 */
export function createVillaExpensesService(client: Client) {
  return {
    async save(input: z.output<typeof ExpenseSchema>, actor: string) {
      if (input.category !== 'commission' && input.spentOn > todayIst()) {
        throw new Error('An expense cannot be dated in the future.');
      }

      const row = {
        property_id: input.propertyId,
        category: input.category,
        description: input.description,
        vendor: input.vendor || null,
        amount: input.amount,
        gst_amount: input.gstAmount,
        mode: input.mode,
        spent_on: input.spentOn,
        invoice_no: input.invoiceNo || null,
        notes: input.notes || null,
      };

      if (input.id) {
        const { data, error } = await client
          .from('villa_expenses')
          .update(row)
          .eq('id', input.id)
          .eq('account_id', input.accountId)
          .select('id');

        if (error) throw new Error('Could not save the expense.');
        if (!data?.length) throw new Error('That expense no longer exists.');

        return;
      }

      const { error } = await client.from('villa_expenses').insert({
        ...row,
        account_id: input.accountId,
        created_by: actor,
      });

      if (error) throw new Error('Could not save the expense.');
    },

    async remove(input: z.output<typeof DeleteExpenseSchema>) {
      const { data, error } = await client
        .from('villa_expenses')
        .delete()
        .eq('id', input.id)
        .eq('account_id', input.accountId)
        .select('id');

      if (error) throw new Error('Could not delete the expense.');
      if (!data?.length) {
        throw new Error('Only the villa owner can delete expenses.');
      }
    },
  };
}
