'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAuditEvent } from '~/lib/audit-log';
import { getAssociationRole } from '~/lib/rbac';

import {
  AmcContractSchema,
  AmcReminderSettingsSchema,
  DeleteAmcSchema,
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
    void logAuditEvent({
      associationId: input.associationId,
      action: 'amc.contract.created',
      entityType: 'amc_contract',
      entityId: contract.id,
      summary: `AMC contract added: ${input.name} (${input.category})`,
    });
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
    void logAuditEvent({
      associationId: input.associationId,
      action: 'amc.contract.updated',
      entityType: 'amc_contract',
      entityId: input.id,
      summary: `AMC contract updated${input.name ? `: ${input.name}` : ''}`,
    });
  });

// ── Renew ─────────────────────────────────────────────────────────────────────

export const renewAmcContractAction = authActionClient
  .inputSchema(RenewAmcSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    await requireAdminAccess(input.associationId);
    const service = createAmcService(getSupabaseServerClient());
    await service.renewContract(ctx.user.id, input);
    revalidateAmc();
    void logAuditEvent({
      associationId: input.associationId,
      action: 'amc.contract.renewed',
      entityType: 'amc_contract',
      entityId: input.id,
      summary: `AMC contract renewed — new expiry: ${input.newEndDate}`,
    });
  });

// ── Terminate ─────────────────────────────────────────────────────────────────

export const terminateAmcContractAction = authActionClient
  .inputSchema(TerminateAmcSchema)
  .action(async ({ parsedInput: input }) => {
    await requireAdminAccess(input.associationId);
    const service = createAmcService(getSupabaseServerClient());
    await service.terminateContract(input);
    revalidateAmc();
    void logAuditEvent({
      associationId: input.associationId,
      action: 'amc.contract.terminated',
      entityType: 'amc_contract',
      entityId: input.id,
      summary: `AMC contract ended${input.reason ? `: ${input.reason}` : ''}`,
    });
  });

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteAmcContractAction = authActionClient
  .inputSchema(DeleteAmcSchema)
  .action(async ({ parsedInput: input }) => {
    await requireAdminAccess(input.associationId);
    const service = createAmcService(getSupabaseServerClient());
    await service.deleteContract(input);
    revalidateAmc();
    void logAuditEvent({
      associationId: input.associationId,
      action: 'amc.contract.deleted',
      entityType: 'amc_contract',
      entityId: input.id,
      summary: `AMC contract deleted${input.name ? `: ${input.name}` : ''}`,
    });
  });

// ── Reminder Settings ─────────────────────────────────────────────────────────

export const updateAmcReminderSettingsAction = authActionClient
  .inputSchema(AmcReminderSettingsSchema)
  .action(async ({ parsedInput: input }) => {
    await requireAdminAccess(input.associationId);
    const service = createAmcService(getSupabaseServerClient());
    await service.upsertReminderSettings(input);
    revalidateAmc();
    void logAuditEvent({
      associationId: input.associationId,
      action: 'amc.settings.updated',
      entityType: 'amc_reminder_settings',
      summary: `AMC reminder set to ${input.remindDaysBefore} days before expiry`,
    });
  });

// ── Guard ─────────────────────────────────────────────────────────────────────

async function requireAdminAccess(associationId: string) {
  const role = await getAssociationRole(associationId);
  if (role !== 'assoc_admin') {
    throw new Error('Only association admins can manage AMC contracts');
  }
}
