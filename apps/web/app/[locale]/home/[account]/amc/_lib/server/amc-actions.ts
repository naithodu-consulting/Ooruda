'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getAssociationRole } from '~/lib/rbac';

import {
  AmcContractSchema,
  AmcReminderSettingsSchema,
  RenewAmcSchema,
  TerminateAmcSchema,
  UpdateAmcContractSchema,
} from '../schemas/amc.schema';
import { createAmcService } from './amc.service';

function revalidateAmc() {
  revalidatePath('/home/[account]/amc', 'page');
}

// ── Create ────────────────────────────────────────────────────────────────────

export const createAmcContractAction = authActionClient
  .inputSchema(AmcContractSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    await requireAdminAccess(input.associationId);
    const service = createAmcService(getSupabaseServerClient());
    const contract = await service.createContract(ctx.user.id, input);
    revalidateAmc();
    return contract;
  });

// ── Update ────────────────────────────────────────────────────────────────────

export const updateAmcContractAction = authActionClient
  .inputSchema(UpdateAmcContractSchema)
  .action(async ({ parsedInput: input }) => {
    await requireAdminAccess(input.associationId);
    const service = createAmcService(getSupabaseServerClient());
    await service.updateContract(input);
    revalidateAmc();
  });

// ── Renew ─────────────────────────────────────────────────────────────────────

export const renewAmcContractAction = authActionClient
  .inputSchema(RenewAmcSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    await requireAdminAccess(input.associationId);
    const service = createAmcService(getSupabaseServerClient());
    await service.renewContract(ctx.user.id, input);
    revalidateAmc();
  });

// ── Terminate ─────────────────────────────────────────────────────────────────

export const terminateAmcContractAction = authActionClient
  .inputSchema(TerminateAmcSchema)
  .action(async ({ parsedInput: input }) => {
    await requireAdminAccess(input.associationId);
    const service = createAmcService(getSupabaseServerClient());
    await service.terminateContract(input);
    revalidateAmc();
  });

// ── Reminder Settings ─────────────────────────────────────────────────────────

export const updateAmcReminderSettingsAction = authActionClient
  .inputSchema(AmcReminderSettingsSchema)
  .action(async ({ parsedInput: input }) => {
    await requireAdminAccess(input.associationId);
    const service = createAmcService(getSupabaseServerClient());
    await service.upsertReminderSettings(input);
    revalidateAmc();
  });

// ── Guard ─────────────────────────────────────────────────────────────────────

async function requireAdminAccess(associationId: string) {
  const role = await getAssociationRole(associationId);
  if (role !== 'assoc_admin') {
    throw new Error('Only association admins can manage AMC contracts');
  }
}
