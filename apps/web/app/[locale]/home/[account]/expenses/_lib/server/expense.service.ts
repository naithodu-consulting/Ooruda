import type { SupabaseClient } from '@supabase/supabase-js';

import { getLogger } from '@kit/shared/logger';

import type {
  CreateVendorInput,
  DeleteExpenseInput,
  ExpenseInput,
  UpdateExpenseInput,
} from '../schemas/expense.schema';

export function createExpenseService(client: SupabaseClient) {
  return new ExpenseService(client);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const uc = (c: unknown) => c as any;

class ExpenseService {
  constructor(private readonly client: SupabaseClient) {}

  async createExpense(userId: string, input: ExpenseInput) {
    const logger = await getLogger();

    const { data, error } = await uc(this.client)
      .from('expenses')
      .insert({
        association_id: input.associationId,
        title: input.title,
        category_id: input.categoryId ?? null,
        sub_category: input.subCategory ?? null,
        amount: input.amount,
        gst_amount: input.gstAmount ?? null,
        payor: input.payor,
        payee_id: input.payeeId ?? null,
        payee_name: input.payeeName,
        mode_of_payment: input.modeOfPayment,
        reference_number: input.referenceNumber ?? null,
        invoice_number: input.invoiceNumber ?? null,
        date_of_payment: input.dateOfPayment,
        notes: input.notes ?? null,
        recurring: input.recurring,
        recurring_frequency: input.recurringFrequency ?? null,
        linked_amc_id: input.linkedAmcId ?? null,
        attachment_url: input.attachmentUrl ?? null,
        created_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      logger.error({ error }, 'expense: failed to create');
      throw error;
    }

    logger.info({ id: data.id }, 'expense: created');
    return data;
  }

  async updateExpense(input: UpdateExpenseInput) {
    const logger = await getLogger();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.title !== undefined) updateData['title'] = input.title;
    if (input.categoryId !== undefined)
      updateData['category_id'] = input.categoryId;
    if (input.subCategory !== undefined)
      updateData['sub_category'] = input.subCategory;
    if (input.amount !== undefined) updateData['amount'] = input.amount;
    if (input.gstAmount !== undefined)
      updateData['gst_amount'] = input.gstAmount;
    if (input.payor !== undefined) updateData['payor'] = input.payor;
    if (input.payeeId !== undefined) updateData['payee_id'] = input.payeeId;
    if (input.payeeName !== undefined)
      updateData['payee_name'] = input.payeeName;
    if (input.modeOfPayment !== undefined)
      updateData['mode_of_payment'] = input.modeOfPayment;
    if (input.referenceNumber !== undefined)
      updateData['reference_number'] = input.referenceNumber;
    if (input.invoiceNumber !== undefined)
      updateData['invoice_number'] = input.invoiceNumber;
    if (input.dateOfPayment !== undefined)
      updateData['date_of_payment'] = input.dateOfPayment;
    if (input.notes !== undefined) updateData['notes'] = input.notes;
    if (input.recurring !== undefined)
      updateData['recurring'] = input.recurring;
    if (input.recurringFrequency !== undefined)
      updateData['recurring_frequency'] = input.recurringFrequency;
    if (input.linkedAmcId !== undefined)
      updateData['linked_amc_id'] = input.linkedAmcId;
    if (input.attachmentUrl !== undefined)
      updateData['attachment_url'] = input.attachmentUrl;

    const { error } = await uc(this.client)
      .from('expenses')
      .update(updateData)
      .eq('id', input.id)
      .eq('association_id', input.associationId)
      .is('deleted_at', null);

    if (error) {
      logger.error({ error, id: input.id }, 'expense: failed to update');
      throw error;
    }

    logger.info({ id: input.id }, 'expense: updated');
  }

  async softDeleteExpense(input: DeleteExpenseInput) {
    const logger = await getLogger();

    const { error } = await uc(this.client)
      .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', input.id)
      .eq('association_id', input.associationId)
      .is('deleted_at', null);

    if (error) {
      logger.error({ error, id: input.id }, 'expense: failed to delete');
      throw error;
    }

    logger.info({ id: input.id }, 'expense: soft-deleted');
  }

  async listExpenses(
    associationId: string,
    filters: {
      from?: string;
      to?: string;
      categoryId?: string;
      payeeName?: string;
      mode?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    let query = uc(this.client)
      .from('expenses')
      .select(
        `
        id, title, amount, gst_amount, payor, payee_name, mode_of_payment,
        reference_number, invoice_number, date_of_payment, notes, recurring,
        attachment_url, created_at,
        category:expense_categories(id, name)
      `,
        { count: 'exact' },
      )
      .eq('association_id', associationId)
      .is('deleted_at', null)
      .order('date_of_payment', { ascending: false });

    if (filters.from) query = query.gte('date_of_payment', filters.from);
    if (filters.to) query = query.lte('date_of_payment', filters.to);
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.mode) query = query.eq('mode_of_payment', filters.mode);
    if (filters.payeeName)
      query = query.ilike('payee_name', `%${filters.payeeName}%`);
    if (filters.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,reference_number.ilike.%${filters.search}%,invoice_number.ilike.%${filters.search}%`,
      );
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data ?? [], count: count ?? 0 };
  }

  async getExpense(id: string, associationId: string) {
    const { data, error } = await uc(this.client)
      .from('expenses')
      .select(`
        *,
        category:expense_categories(id, name),
        vendor:vendors(id, name, contact_person, phone, email)
      `)
      .eq('id', id)
      .eq('association_id', associationId)
      .is('deleted_at', null)
      .single();

    if (error) throw error;
    return data;
  }

  async getAnalytics(associationId: string, from: string, to: string) {
    const { data, error } = await uc(this.client)
      .from('expenses')
      .select(
        'amount, gst_amount, date_of_payment, mode_of_payment, payee_name, category:expense_categories(name)',
      )
      .eq('association_id', associationId)
      .is('deleted_at', null)
      .gte('date_of_payment', from)
      .lte('date_of_payment', to);

    if (error) throw error;
    return data ?? [];
  }

  async listCategories(associationId: string) {
    const { data, error } = await uc(this.client)
      .from('expense_categories')
      .select('id, name')
      .or(`association_id.is.null,association_id.eq.${associationId}`)
      .order('name');

    if (error) throw error;
    return data ?? [];
  }

  async listVendors(associationId: string, search?: string) {
    let query = uc(this.client)
      .from('vendors')
      .select('id, name, contact_person, phone, email')
      .eq('association_id', associationId)
      .order('name')
      .limit(50);

    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async upsertVendor(input: CreateVendorInput) {
    const logger = await getLogger();

    const { data, error } = await uc(this.client)
      .from('vendors')
      .insert({
        association_id: input.associationId,
        name: input.name,
        contact_person: input.contactPerson ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        gst_number: input.gstNumber ?? null,
        bank_details: input.bankDetails ?? null,
      })
      .select('id, name')
      .single();

    if (error) {
      logger.error({ error }, 'vendor: failed to create');
      throw error;
    }

    return data;
  }
}
