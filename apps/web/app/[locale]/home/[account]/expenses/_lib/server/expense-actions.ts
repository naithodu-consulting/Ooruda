'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getAssociationRole } from '~/lib/rbac';

import {
  CreateVendorSchema,
  DeleteExpenseSchema,
  ExpenseSchema,
  UpdateExpenseSchema,
} from '../schemas/expense.schema';
import { createExpenseService } from './expense.service';

function revalidateExpenses(accountSlug: string) {
  revalidatePath(`/home/${accountSlug}/expenses`, 'page');
}

// ── Create ────────────────────────────────────────────────────────────────────

export const createExpenseAction = authActionClient
  .inputSchema(ExpenseSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    await requireBillingAccess(input.associationId);
    const service = createExpenseService(getSupabaseServerClient());
    const expense = await service.createExpense(ctx.user.id, input);
    revalidateExpenses('[account]');
    return expense;
  });

// ── Update ────────────────────────────────────────────────────────────────────

export const updateExpenseAction = authActionClient
  .inputSchema(UpdateExpenseSchema)
  .action(async ({ parsedInput: input }) => {
    await requireBillingAccess(input.associationId);
    const service = createExpenseService(getSupabaseServerClient());
    await service.updateExpense(input);
    revalidateExpenses('[account]');
  });

// ── Delete (soft) ──────────────────────────────────────────────────────────────

export const deleteExpenseAction = authActionClient
  .inputSchema(DeleteExpenseSchema)
  .action(async ({ parsedInput: input }) => {
    await requireBillingAccess(input.associationId);
    const service = createExpenseService(getSupabaseServerClient());
    await service.softDeleteExpense(input);
    revalidateExpenses('[account]');
  });

// ── Create Vendor ─────────────────────────────────────────────────────────────

export const createVendorAction = authActionClient
  .inputSchema(CreateVendorSchema)
  .action(async ({ parsedInput: input }) => {
    await requireBillingAccess(input.associationId);
    const service = createExpenseService(getSupabaseServerClient());
    return service.upsertVendor(input);
  });

// ── Guard ─────────────────────────────────────────────────────────────────────

async function requireBillingAccess(associationId: string) {
  const role = await getAssociationRole(associationId);
  if (role !== 'assoc_admin' && role !== 'billing_operator') {
    throw new Error('Insufficient permissions');
  }
}
