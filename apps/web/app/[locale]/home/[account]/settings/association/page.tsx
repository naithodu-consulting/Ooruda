import { getSupabaseServerClient } from '@kit/supabase/server-client';

import pathsConfig from '~/config/paths.config';
import { requireRole } from '~/lib/rbac';

import { AssociationForm } from './_components/association-form';
import { AssociationLogoUploader } from './_components/association-logo-uploader';
import { AssociationNameCard } from './_components/association-name-card';
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

  // The association logo is the MakerKit team account image (accounts.picture_url).
  // Name/slug/owner are fetched here too so the name-edit and danger-zone
  // sections (moved from the old, now-redirected /settings tab) can render
  // alongside the rest of the association's identity on this single page.
  const { data: accountRow } = await client
    .from('accounts')
    .select('name, slug, picture_url, primary_owner_user_id')
    .eq('id', accountId)
    .single();

  if (!accountRow) {
    throw new Error('Unable to load the association account record.');
  }

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
    .select('due_day_of_month')
    .eq('association_id', association.id)
    .single();

  const { data: chargeTypes } = await client
    .from('charge_types')
    .select(
      'id, key, name, is_builtin, calc_method, frequency, default_payer, is_active, rate_or_amount',
    )
    .eq('association_id', association.id)
    .order('is_builtin', { ascending: false })
    .order('name');

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
          brand_colour: association.brand_colour,
          gstin: association.gstin,
          gst_enabled: association.gst_enabled,
          gst_rate: association.gst_rate,
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
