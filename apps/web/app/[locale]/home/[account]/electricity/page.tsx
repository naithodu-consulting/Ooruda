import { Gauge, IndianRupee, Power, PowerOff } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { MetricCard } from '@kit/ui/metric-card';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { formatPeriod } from '~/lib/format-period';
import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  BillsSection,
  type ElectricityBillRow,
} from './_components/bills-section';
import {
  SubMetersSection,
  type SubMeterRow,
} from './_components/sub-meters-section';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Electricity' };

export default async function MescomPage({ params }: Props) {
  const { account } = await params;
  const { accountId, role } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  const client = getSupabaseServerClient();

  const [{ data: association }, { data: isSuperAdmin }] = await Promise.all([
    client
      .from('associations')
      .select('id')
      .eq('account_id', accountId)
      .single(),
    client.rpc('is_super_admin'),
  ]);

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  const { data: units } = await client
    .from('units')
    .select('id, unit_no')
    .eq('association_id', association.id)
    .order('unit_no');

  const unitRows = units ?? [];

  const unitIds = unitRows.map((u) => u.id);

  const { data: subMeters } = unitIds.length
    ? await client
        .from('sub_meters')
        .select(
          'id, meter_label, meter_type, is_active, unit_id, units(unit_no)',
        )
        .in('unit_id', unitIds)
        .order('meter_label')
    : { data: [] };

  const subMeterRows: SubMeterRow[] = (subMeters ?? []).map((m) => ({
    id: m.id,
    meter_label: m.meter_label,
    meter_type: m.meter_type,
    is_active: m.is_active,
    unit_id: m.unit_id,
    unit_no: (m.units as unknown as { unit_no: string } | null)?.unit_no ?? '—',
  }));

  const activeSubMeters = subMeterRows.filter((m) => m.is_active);
  const activeSubMeterIds = activeSubMeters.map((m) => m.id);

  const { data: bills } = await client
    .from('mescom_bills')
    .select('id, period, invoice_amount, block_consumption_units')
    .eq('association_id', association.id)
    .order('period', { ascending: false });

  const billRows: ElectricityBillRow[] = bills ?? [];

  const { data: readings } = activeSubMeterIds.length
    ? await client
        .from('meter_readings')
        .select(
          'sub_meter_id, mescom_bill_id, period, previous_reading, current_reading, minimum_charge',
        )
        .in('sub_meter_id', activeSubMeterIds)
        .order('period', { ascending: true })
    : { data: [] };

  const allReadings = readings ?? [];

  const readingsByBill: Record<
    string,
    Record<
      string,
      {
        previous_reading: number;
        current_reading: number;
        minimum_charge: number;
      }
    >
  > = {};

  const consumedByBill: Record<string, number> = {};

  for (const r of allReadings) {
    readingsByBill[r.mescom_bill_id] ??= {};
    readingsByBill[r.mescom_bill_id]![r.sub_meter_id] = {
      previous_reading: r.previous_reading,
      current_reading: r.current_reading,
      minimum_charge: r.minimum_charge ?? 0,
    };

    consumedByBill[r.mescom_bill_id] =
      (consumedByBill[r.mescom_bill_id] ?? 0) +
      (r.current_reading - r.previous_reading);
  }

  // For each bill's readings dialog, the default "previous reading" for a
  // sub-meter should be its most recent current_reading from any period
  // BEFORE this bill's period — not the global latest. This ensures entering
  // an older bill after a newer one doesn't carry forward a future reading.
  // `allReadings` is sorted ascending by period, so iterating and overwriting
  // gives us the most recent reading strictly before each bill's period.
  const lastReadingBeforePeriodByBill: Record<
    string,
    Record<string, number>
  > = {};
  // Last minimum_charge recorded for each sub-meter strictly before each
  // bill's period — used to pre-fill the min charge field so admins only need
  // to edit it when the charge actually changes.
  const lastMinChargeBeforePeriodByBill: Record<
    string,
    Record<string, number>
  > = {};
  for (const bill of billRows) {
    lastReadingBeforePeriodByBill[bill.id] = {};
    lastMinChargeBeforePeriodByBill[bill.id] = {};
    for (const r of allReadings) {
      if (r.period < bill.period) {
        lastReadingBeforePeriodByBill[bill.id]![r.sub_meter_id] =
          r.current_reading;
        lastMinChargeBeforePeriodByBill[bill.id]![r.sub_meter_id] =
          r.minimum_charge ?? 0;
      }
    }
  }

  const canManage = role === 'assoc_admin';
  const activeCount = activeSubMeters.length;
  const inactiveCount = subMeterRows.length - activeCount;
  const latestBill = billRows[0];
  const latestBlockRate =
    latestBill && latestBill.block_consumption_units > 0
      ? latestBill.invoice_amount / latestBill.block_consumption_units
      : null;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.mescom" />}
        description={
          subMeterRows.length === 0
            ? 'No sub-meters yet'
            : `${subMeterRows.length} meters · ${activeCount} active · ${inactiveCount} inactive`
        }
      />

      <div className="flex flex-col gap-4">
        {subMeterRows.length > 0 ? (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <MetricCard
              icon={Gauge}
              label="Total meters"
              value={String(subMeterRows.length)}
              sublabel="All sub-meters"
              variant="blue"
            />
            <MetricCard
              icon={Power}
              label="Active"
              value={String(activeCount)}
              sublabel="Recording readings"
              variant="green"
            />
            <MetricCard
              icon={PowerOff}
              label="Inactive"
              value={String(inactiveCount)}
              sublabel="Not metered"
              variant="amber"
            />
            <MetricCard
              icon={IndianRupee}
              label="Latest block rate"
              value={
                latestBlockRate !== null
                  ? `₹${latestBlockRate.toFixed(2)}`
                  : '—'
              }
              sublabel={
                latestBill
                  ? `For ${formatPeriod(latestBill.period)}`
                  : 'No bills yet'
              }
              variant="teal"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-6">
          <SubMetersSection
            associationId={association.id}
            subMeters={subMeterRows}
            units={unitRows}
            canManage={canManage}
          />

          <BillsSection
            associationId={association.id}
            bills={billRows}
            activeSubMeters={activeSubMeters}
            readingsByBill={readingsByBill}
            consumedByBill={consumedByBill}
            lastReadingBeforePeriodByBill={lastReadingBeforePeriodByBill}
            lastMinChargeBeforePeriodByBill={lastMinChargeBeforePeriodByBill}
            canManage={canManage}
            isSuperAdmin={!!isSuperAdmin}
          />
        </div>
      </div>
    </PageBody>
  );
}
