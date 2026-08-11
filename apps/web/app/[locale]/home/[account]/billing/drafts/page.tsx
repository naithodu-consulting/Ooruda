import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../../_components/team-account-layout-page-header';
import {
  DraftBillsTab,
  type PendingChargeWithUnit,
  type PendingElectricityBill,
  type PendingSinkingChargeWithUnit,
} from '../_components/draft-bills-tab';
import { GenerateBillsDialog } from '../_components/generate-bills-dialog';
import { OtherChargesDialog } from '../_components/other-charges-dialog';
import { SinkingFundDialog } from '../_components/sinking-fund-dialog';
import { DeleteAllBillsButton } from './_components/delete-all-bills-button';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Draft Bills · Billing' };

/**
 * Level 2 (side branch): staging area for charges that have not been turned
 * into bills yet, plus the actions that generate them.
 *
 * This is a different job from reviewing who owes money, which is why it is its
 * own route rather than a tab: it loads only the pending tables, and the
 * unbilled electricity and maintenance drafts here are association-level (they
 * have no unit) so they could never appear in the unit tree.
 */
export default async function BillingDraftsPage({ params }: Props) {
  const { account } = await params;
  const { accountId, role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  const client = getSupabaseServerClient();

  const [{ data: isSuperAdmin }, { data: association }] = await Promise.all([
    client.rpc('is_super_admin'),
    client
      .from('associations')
      .select('id')
      .eq('account_id', accountId)
      .single(),
  ]);

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  const [
    unitsResult,
    otherChargesCTResult,
    sinkingFundCTResult,
    pendingChargesResult,
    pendingSinkingChargesResult,
    mescomBillsResult,
    // Only period + bill_type: just enough to tell which periods have already
    // been generated, so a draft isn't offered twice.
    generatedResult,
  ] = await Promise.all([
    client
      .from('units')
      .select('id, unit_no')
      .eq('association_id', association.id)
      .order('unit_no'),
    client
      .from('charge_types')
      .select('is_active')
      .eq('association_id', association.id)
      .eq('key', 'other_charges')
      .maybeSingle(),
    client
      .from('charge_types')
      .select('is_active')
      .eq('association_id', association.id)
      .eq('key', 'sinking_fund')
      .maybeSingle(),
    client
      .from('pending_other_charges')
      .select(
        'id, unit_id, period, label, amount, split_mode, due_date, billed',
      )
      .eq('association_id', association.id)
      .eq('billed', false)
      .order('created_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any)
      .from('pending_sinking_fund_charges')
      .select(
        'id, unit_id, period, label, amount, split_mode, due_date, billed',
      )
      .eq('association_id', association.id)
      .eq('billed', false)
      .order('created_at', { ascending: false }),
    client
      .from('mescom_bills')
      .select(
        'id, period, invoice_amount, block_consumption_units, uploaded_at',
      )
      .eq('association_id', association.id)
      .order('period', { ascending: false }),
    client
      .from('bills')
      .select('period, bill_type')
      .eq('association_id', association.id)
      .in('bill_type', ['electricity', 'maintenance'])
      .neq('status', 'Void'),
  ]);

  // Only for super admins — these drive the danger-zone summary and would be
  // wasted work for everyone else.
  let deletionCounts: {
    bills: number;
    payments: number;
    receipts: number;
  } | null = null;

  if (isSuperAdmin) {
    const [
      { count: billsCount },
      { count: paymentsCount },
      { count: receiptsCount },
    ] = await Promise.all([
      client
        .from('bills')
        .select('id', { count: 'exact', head: true })
        .eq('association_id', association.id),
      client
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('association_id', association.id),
      client
        .from('receipts')
        .select('id, payments!inner(association_id)', {
          count: 'exact',
          head: true,
        })
        .eq('payments.association_id', association.id),
    ]);

    deletionCounts = {
      bills: billsCount ?? 0,
      payments: paymentsCount ?? 0,
      receipts: receiptsCount ?? 0,
    };
  }

  const unitRows = unitsResult.data ?? [];
  const unitNoById = new Map(unitRows.map((u) => [u.id, u.unit_no]));

  const pendingCharges: PendingChargeWithUnit[] = (
    pendingChargesResult.data ?? []
  ).map((pc) => ({
    ...pc,
    unit_no: pc.unit_id ? (unitNoById.get(pc.unit_id) ?? null) : null,
  }));

  const pendingSinkingCharges: PendingSinkingChargeWithUnit[] = (
    (pendingSinkingChargesResult.data as PendingSinkingChargeWithUnit[]) ?? []
  ).map((pc) => ({
    ...pc,
    unit_no: pc.unit_id ? (unitNoById.get(pc.unit_id) ?? null) : null,
  }));

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const periodOptions: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periodOptions.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    );
  }

  const generatedRows = generatedResult.data ?? [];
  const generatedElecPeriods = new Set(
    generatedRows
      .filter((b) => b.bill_type === 'electricity')
      .map((b) => b.period),
  );
  const generatedMaintPeriods = new Set(
    generatedRows
      .filter((b) => b.bill_type === 'maintenance')
      .map((b) => b.period),
  );

  const pendingElectricityBills: PendingElectricityBill[] = (
    mescomBillsResult.data ?? []
  )
    .filter((mb) => !generatedElecPeriods.has(mb.period))
    .map((mb) => ({
      id: mb.id,
      period: mb.period,
      invoice_amount: Number(mb.invoice_amount),
      block_consumption_units: Number(mb.block_consumption_units),
      uploaded_at: mb.uploaded_at,
    }));

  const maintenancePending = !generatedMaintPeriods.has(currentPeriod);

  const isOtherChargesActive = otherChargesCTResult.data?.is_active ?? false;
  const isSinkingFundActive = sinkingFundCTResult.data?.is_active ?? false;
  const canManage = role === 'assoc_admin' || role === 'billing_operator';

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title="Draft Bills"
        description="Charges waiting to be turned into bills."
      />

      <div className="mt-2 flex flex-col gap-4">
        <Link
          href={`/home/${account}/billing`}
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-base transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Billing
        </Link>

        <div className="bg-card rounded-xl border p-4">
          <DraftBillsTab
            associationId={association.id}
            maintenancePending={maintenancePending}
            currentPeriod={currentPeriod}
            pendingElectricityBills={pendingElectricityBills}
            pendingCharges={pendingCharges}
            pendingSinkingCharges={pendingSinkingCharges}
            canManage={canManage}
            generateBillsAction={
              canManage ? (
                <GenerateBillsDialog associationId={association.id} />
              ) : undefined
            }
            otherChargesAction={
              canManage && isOtherChargesActive ? (
                <OtherChargesDialog
                  associationId={association.id}
                  units={unitRows}
                  pendingCharges={pendingCharges}
                  periods={periodOptions}
                />
              ) : undefined
            }
            sinkingFundAction={
              canManage && isSinkingFundActive ? (
                <SinkingFundDialog
                  associationId={association.id}
                  units={unitRows}
                  pendingCharges={pendingSinkingCharges}
                  periods={periodOptions}
                />
              ) : undefined
            }
            dangerZoneAction={
              isSuperAdmin && deletionCounts ? (
                <DeleteAllBillsButton
                  associationId={association.id}
                  accountSlug={account}
                  counts={deletionCounts}
                />
              ) : undefined
            }
          />
        </div>
      </div>
    </PageBody>
  );
}
