import type { SupabaseClient } from '@supabase/supabase-js';

import { getLogger } from '@kit/shared/logger';

import { computeAmcStatus } from '../amc-utils';
import type { AmcStatus } from '../amc-utils';
import type {
  AmcContractInput,
  AmcReminderSettingsInput,
  RenewAmcInput,
  TerminateAmcInput,
  UpdateAmcContractInput,
} from '../schemas/amc.schema';

export { computeAmcStatus };
export type { AmcStatus };

export function createAmcService(client: SupabaseClient) {
  return new AmcService(client);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const uc = (c: unknown) => c as any;

class AmcService {
  constructor(private readonly client: SupabaseClient) {}

  async createContract(userId: string, input: AmcContractInput) {
    const logger = await getLogger();

    const { data, error } = await uc(this.client)
      .from('amc_contracts')
      .insert({
        association_id: input.associationId,
        name: input.name,
        vendor_name: input.vendorName,
        vendor_contact_person: input.vendorContactPerson ?? null,
        vendor_phone: input.vendorPhone ?? null,
        vendor_email: input.vendorEmail ?? null,
        category: input.category,
        start_date: input.startDate,
        end_date: input.endDate,
        contract_value: input.contractValue,
        payment_frequency: input.paymentFrequency,
        next_payment_due: input.nextPaymentDue ?? null,
        auto_renewal: input.autoRenewal,
        notice_period_days: input.noticePeriodDays ?? null,
        priority: input.priority,
        coverage_scope: input.coverageScope ?? null,
        sla_terms: input.slaTerms ?? null,
        notes: input.notes ?? null,
        contract_document_url: input.contractDocumentUrl ?? null,
        created_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      logger.error({ error }, 'amc: failed to create contract');
      throw error;
    }

    logger.info({ id: data.id }, 'amc: contract created');
    return data;
  }

  async updateContract(input: UpdateAmcContractInput) {
    const logger = await getLogger();

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) patch['name'] = input.name;
    if (input.vendorName !== undefined) patch['vendor_name'] = input.vendorName;
    if (input.vendorContactPerson !== undefined)
      patch['vendor_contact_person'] = input.vendorContactPerson;
    if (input.vendorPhone !== undefined)
      patch['vendor_phone'] = input.vendorPhone;
    if (input.vendorEmail !== undefined)
      patch['vendor_email'] = input.vendorEmail;
    if (input.category !== undefined) patch['category'] = input.category;
    if (input.startDate !== undefined) patch['start_date'] = input.startDate;
    if (input.endDate !== undefined) patch['end_date'] = input.endDate;
    if (input.contractValue !== undefined)
      patch['contract_value'] = input.contractValue;
    if (input.paymentFrequency !== undefined)
      patch['payment_frequency'] = input.paymentFrequency;
    if (input.nextPaymentDue !== undefined)
      patch['next_payment_due'] = input.nextPaymentDue;
    if (input.autoRenewal !== undefined)
      patch['auto_renewal'] = input.autoRenewal;
    if (input.noticePeriodDays !== undefined)
      patch['notice_period_days'] = input.noticePeriodDays;
    if (input.priority !== undefined) patch['priority'] = input.priority;
    if (input.coverageScope !== undefined)
      patch['coverage_scope'] = input.coverageScope;
    if (input.slaTerms !== undefined) patch['sla_terms'] = input.slaTerms;
    if (input.notes !== undefined) patch['notes'] = input.notes;
    if (input.contractDocumentUrl !== undefined)
      patch['contract_document_url'] = input.contractDocumentUrl;

    const { error } = await uc(this.client)
      .from('amc_contracts')
      .update(patch)
      .eq('id', input.id)
      .eq('association_id', input.associationId)
      .is('terminated_at', null);

    if (error) {
      logger.error({ error, id: input.id }, 'amc: failed to update contract');
      throw error;
    }

    logger.info({ id: input.id }, 'amc: contract updated');
  }

  async renewContract(userId: string, input: RenewAmcInput) {
    const logger = await getLogger();

    // 1. Archive renewal in history
    const { error: histError } = await uc(this.client)
      .from('amc_renewal_history')
      .insert({
        amc_contract_id: input.id,
        renewed_at: input.renewedAt,
        new_end_date: input.newEndDate,
        contract_value: input.contractValue,
        renewed_by: userId,
        linked_expense_id: input.linkedExpenseId ?? null,
        notes: input.notes ?? null,
      });

    if (histError) {
      logger.error(
        { error: histError },
        'amc: failed to record renewal history',
      );
      throw histError;
    }

    // 2. Update contract with new end date and value
    const patch: Record<string, unknown> = {
      end_date: input.newEndDate,
      contract_value: input.contractValue,
      updated_at: new Date().toISOString(),
    };
    if (input.contractDocumentUrl)
      patch['contract_document_url'] = input.contractDocumentUrl;

    const { error } = await uc(this.client)
      .from('amc_contracts')
      .update(patch)
      .eq('id', input.id)
      .eq('association_id', input.associationId);

    if (error) {
      logger.error(
        { error, id: input.id },
        'amc: failed to update after renewal',
      );
      throw error;
    }

    logger.info({ id: input.id }, 'amc: contract renewed');
  }

  async terminateContract(input: TerminateAmcInput) {
    const logger = await getLogger();

    const { error } = await uc(this.client)
      .from('amc_contracts')
      .update({
        terminated_at: new Date().toISOString(),
        terminated_reason: input.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .eq('association_id', input.associationId)
      .is('terminated_at', null);

    if (error) {
      logger.error({ error, id: input.id }, 'amc: failed to terminate');
      throw error;
    }

    logger.info({ id: input.id }, 'amc: contract terminated');
  }

  async deleteContract(input: { id: string; associationId: string }) {
    const logger = await getLogger();

    const { error } = await uc(this.client)
      .from('amc_contracts')
      .delete()
      .eq('id', input.id)
      .eq('association_id', input.associationId);

    if (error) {
      logger.error({ error, id: input.id }, 'amc: failed to delete contract');
      throw error;
    }

    logger.info({ id: input.id }, 'amc: contract deleted');
  }

  async listContracts(
    associationId: string,
    filters: {
      status?: string;
      category?: string;
      sortBy?: 'end_date' | 'contract_value';
      sortAsc?: boolean;
    } = {},
  ) {
    const { data, error } = await uc(this.client)
      .from('amc_contracts')
      .select(
        'id, name, vendor_name, category, start_date, end_date, contract_value, payment_frequency, priority, auto_renewal, terminated_at, updated_at',
      )
      .eq('association_id', associationId)
      .order(filters.sortBy ?? 'end_date', {
        ascending: filters.sortAsc ?? true,
      });

    if (error) throw error;

    type RawRow = Record<string, unknown>;
    const rows = (data ?? []).map((r: RawRow) => ({
      ...r,
      status: computeAmcStatus(
        r['end_date'] as string,
        r['terminated_at'] as string | null,
      ),
    }));

    if (filters.status) {
      return rows.filter(
        (r: RawRow & { status: AmcStatus }) => r.status === filters.status,
      );
    }
    if (filters.category) {
      return rows.filter(
        (r: RawRow & { status: AmcStatus }) =>
          r['category'] === filters.category,
      );
    }
    return rows;
  }

  async getContract(id: string, associationId: string) {
    const [contractResult, historyResult] = await Promise.all([
      uc(this.client)
        .from('amc_contracts')
        .select('*')
        .eq('id', id)
        .eq('association_id', associationId)
        .single(),
      uc(this.client)
        .from('amc_renewal_history')
        .select(
          'id, renewed_at, new_end_date, contract_value, notes, created_at',
        )
        .eq('amc_contract_id', id)
        .order('created_at', { ascending: false }),
    ]);

    if (contractResult.error) throw contractResult.error;

    const contract = {
      ...contractResult.data,
      status: computeAmcStatus(
        contractResult.data.end_date,
        contractResult.data.terminated_at,
      ),
    };

    return { contract, history: historyResult.data ?? [] };
  }

  async getDashboardStats(associationId: string) {
    const { data, error } = await uc(this.client)
      .from('amc_contracts')
      .select(
        'id, name, vendor_name, category, start_date, end_date, contract_value, payment_frequency, priority, auto_renewal, terminated_at',
      )
      .eq('association_id', associationId)
      .order('end_date', { ascending: true });

    if (error) throw error;

    type DashRow = Record<string, unknown> & { status: AmcStatus };
    const all: DashRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      status: computeAmcStatus(
        r['end_date'] as string,
        r['terminated_at'] as string | null,
      ),
    }));

    // KPI counts exclude terminated contracts
    const active = all.filter((r) => r.status === 'active').length;
    const dueSoon = all.filter((r) => r.status === 'due_soon').length;
    const urgent = all.filter((r) => r.status === 'urgent').length;
    const critical = all.filter((r) => r.status === 'critical').length;
    const expired = all.filter((r) => r.status === 'expired').length;
    const totalAnnualCost = all
      .filter((r) => !r['terminated_at'])
      .reduce(
        (sum: number, r: DashRow) =>
          sum + ((r['contract_value'] as number) ?? 0),
        0,
      );
    const needsAttention = all.filter(
      (r) =>
        r.status === 'urgent' ||
        r.status === 'critical' ||
        r.status === 'expired',
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return {
      active,
      dueSoon,
      urgent,
      critical,
      expired,
      totalAnnualCost,
      needsAttention: needsAttention as any[],
      all: all as any[],
    };
  }

  async getReminderSettings(associationId: string) {
    const { data } = await uc(this.client)
      .from('amc_reminder_settings')
      .select('remind_days_before')
      .eq('association_id', associationId)
      .maybeSingle();

    return { remindDaysBefore: (data?.remind_days_before as number) ?? 30 };
  }

  async upsertReminderSettings(input: AmcReminderSettingsInput) {
    const logger = await getLogger();

    const { error } = await uc(this.client)
      .from('amc_reminder_settings')
      .upsert(
        {
          association_id: input.associationId,
          remind_days_before: input.remindDaysBefore,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'association_id' },
      );

    if (error) {
      logger.error({ error }, 'amc: failed to update reminder settings');
      throw error;
    }
  }
}
