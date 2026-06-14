import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { requireRole } from '~/lib/rbac';

import { AssociationForm } from './_components/association-form';
import { ChargeTypesCard } from './_components/charge-types-card';

interface Props {
  params: Promise<{ account: string }>;
}

export const metadata = { title: 'Association Settings' };

export default async function AssociationSettingsPage({ params }: Props) {
  const { account } = await params;

  // Association configuration (status, GST, branding, billing defaults) is an
  // admin-only task — the underlying RLS write policies require assoc_admin.
  const { accountId } = await requireRole(account, ['assoc_admin']);

  const client = getSupabaseServerClient();

  // Load or create the associations row (safety net — the row is normally
  // auto-created by the create-team trigger).
  let { data: association } = await client
    .from('associations')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    const { data } = await client
      .from('associations')
      .insert({ account_id: accountId })
      .select()
      .single();
    association = data;
  }

  // If the row still can't be loaded or created, fail loudly rather than
  // dereferencing null further down. Next.js renders the nearest error UI.
  if (!association) {
    throw new Error(
      'Unable to load the association record. Please try again or contact support.',
    );
  }

  const { data: billingSettings } = await client
    .from('billing_settings')
    .select('due_day_of_month, minimum_electricity_charge')
    .eq('association_id', association.id)
    .single();

  const { data: chargeTypes } = await client
    .from('charge_types')
    .select(
      'id, key, name, is_builtin, calc_method, frequency, default_payer, is_active',
    )
    .eq('association_id', association.id)
    .order('is_builtin', { ascending: false })
    .order('name');

  return (
    <div className="flex max-w-2xl flex-1 flex-col gap-6">
      <AssociationForm
        association={{
          id: association.id,
          status: association.status,
          address: association.address,
          brand_colour: association.brand_colour,
          gstin: association.gstin,
          gst_enabled: association.gst_enabled,
          mescom_consumer_no: association.mescom_consumer_no,
        }}
        billingSettings={billingSettings ?? null}
      />

      <ChargeTypesCard
        chargeTypes={chargeTypes ?? []}
        associationId={association.id}
      />
    </div>
  );
}
