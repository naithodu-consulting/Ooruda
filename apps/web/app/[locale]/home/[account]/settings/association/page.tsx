import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import pathsConfig from '~/config/paths.config';
import { requireRole } from '~/lib/rbac';

import { AssociationForm } from './_components/association-form';
import { AssociationLogoUploader } from './_components/association-logo-uploader';
import { AssociationNameCard } from './_components/association-name-card';
import { ChargeTypesCard } from './_components/charge-types-card';
import { PaymentGatewayCard } from './_components/payment-gateway-card';
import { WorkspaceFeaturesCard } from './_components/workspace-features-card';

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

  // Fire accounts and associations queries in parallel — both only need accountId.
  const [{ data: accountRow }, { data: associationRow }] = await Promise.all([
    client
      .from('accounts')
      .select('name, slug, picture_url, primary_owner_user_id')
      .eq('id', accountId)
      .single(),
    client
      .from('associations')
      .select('*')
      .eq('account_id', accountId)
      .single(),
  ]);

  if (!accountRow) {
    throw new Error('Unable to load the association account record.');
  }

  // Safety net: auto-create the associations row if the trigger didn't fire.
  let association = associationRow;
  if (!association) {
    const { data } = await client
      .from('associations')
      .insert({ account_id: accountId })
      .select()
      .single();
    association = data;
  }

  if (!association) {
    throw new Error(
      'Unable to load the association record. Please try again or contact support.',
    );
  }

  const admin = getSupabaseServerAdminClient();

  // Fire all remaining independent queries in parallel.
  const [
    { data: isSuperAdmin },
    { data: billingSettings },
    { data: chargeTypes },
    { data: gatewayRow },
  ] = await Promise.all([
    client.rpc('is_super_admin'),
    client
      .from('billing_settings')
      .select('electricity_due_day, maintenance_due_day, other_charges_due_day')
      .eq('association_id', association.id)
      .single(),
    client
      .from('charge_types')
      .select(
        'id, key, name, is_builtin, calc_method, frequency, default_payer, is_active, rate_or_amount, gst_applicable',
      )
      .eq('association_id', association.id)
      .order('is_builtin', { ascending: false })
      .order('name'),
    // Admin client required — association_payment_gateways has no authenticated policies.
    admin
      .from('association_payment_gateways')
      .select('key_id, is_active, key_secret, webhook_secret, created_at')
      .eq('association_id', association.id)
      .maybeSingle(),
  ]);

  const gatewayConfig = gatewayRow
    ? {
        key_id: gatewayRow.key_id,
        is_active: gatewayRow.is_active,
        has_secret: !!gatewayRow.key_secret,
        has_webhook_secret: !!gatewayRow.webhook_secret,
        created_at: gatewayRow.created_at,
      }
    : null;

  return (
    <div className="flex max-w-2xl flex-1 flex-col gap-6">
      <AssociationLogoUploader
        account={{ id: accountId, pictureUrl: accountRow.picture_url }}
      />

      <AssociationNameCard
        account={{
          id: accountId,
          name: accountRow.name,
          slug: accountRow.slug as string,
        }}
        // Pass the UNRESOLVED template (with the `[account]` placeholder) — the
        // update action does `path.replace('[account]', newSlug)` to redirect
        // after a slug change. Resolving it here would break that redirect.
        path={pathsConfig.app.accountAssociationSettings}
      />

      <AssociationForm
        association={{
          id: association.id,
          status: association.status,
          address: association.address,
          registration_number: association.registration_number ?? null,
          brand_colour: association.brand_colour,
          gstin: association.gstin,
          gst_enabled: association.gst_enabled,
          gst_rate: association.gst_rate,
          mescom_consumer_no: association.mescom_consumer_no,
          authorised_signatory: association.authorised_signatory ?? null,
          sanctioned_load_kva: association.sanctioned_load_kva ?? null,
          pan_number: association.pan_number ?? null,
          email: association.email ?? null,
          phone: association.phone ?? null,
          bank_account_name: association.bank_account_name ?? null,
          bank_account_number: association.bank_account_number ?? null,
          bank_name: association.bank_name ?? null,
          bank_ifsc: association.bank_ifsc ?? null,
          bank_branch: association.bank_branch ?? null,
        }}
        billingSettings={billingSettings ?? null}
      />

      <ChargeTypesCard
        chargeTypes={chargeTypes ?? []}
        associationId={association.id}
        isSuperAdmin={!!isSuperAdmin}
        gstEnabled={!!association.gst_enabled}
      />

      <PaymentGatewayCard
        associationId={association.id}
        gateway={gatewayConfig}
      />

      {isSuperAdmin && (
        <WorkspaceFeaturesCard
          associationId={association.id}
          cashLedgerEnabled={association.cash_ledger_enabled ?? true}
        />
      )}
    </div>
  );
}
