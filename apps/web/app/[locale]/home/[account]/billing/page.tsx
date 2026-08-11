import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ArrowRight, FilePlus2 } from 'lucide-react';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

import { requireRole } from '~/lib/rbac';

import { TeamAccountLayoutPageHeader } from '../_components/team-account-layout-page-header';
import {
  BillingOverview,
  type BillKpiRow,
} from './_components/billing-overview';
import { BILL_AMOUNTS_SELECT } from './_lib/billing-queries';

interface Props {
  params: Promise<{ account: string }>;
  searchParams: Promise<{
    duration?: string;
    status?: string;
    period?: string;
    bills?: string;
    unit?: string;
    filter?: string;
  }>;
}

export const metadata = { title: 'Billing' };

const STATUS_TO_FILTER: Record<string, string> = {
  overdue: 'overdue',
  unpaid: 'outstanding',
  outstanding: 'outstanding',
  partial: 'outstanding',
  paid: 'all_paid',
};

/**
 * Level 1: the Billing landing page — KPI tiles and nothing else.
 *
 * This page used to render the tiles, the full unit tree and a bills card with
 * draft/generated tabs all at once, which meant loading every bill for the
 * association (with line items) before anything could paint. It now runs a
 * single narrow, join-free query and hands off to the drill-down routes.
 */
export default async function BillingPage({ params, searchParams }: Props) {
  const [{ account }, sp] = await Promise.all([params, searchParams]);
  const { accountId } = await requireRole(account, [
    'assoc_admin',
    'billing_operator',
  ]);

  const client = getSupabaseServerClient();

  const { data: association } = await client
    .from('associations')
    .select('id')
    .eq('account_id', accountId)
    .single();

  if (!association) {
    throw new Error('Unable to load the association for this account.');
  }

  // ── Legacy URL compatibility ──────────────────────────────────────────────
  // Dashboard tiles, owner views and old bookmarks still point at /billing with
  // these params. Redirect rather than ignore them, so an inbound link never
  // silently lands on an unfiltered page.
  const unitsHref = `/home/${account}/billing/units`;

  if (sp.bills === 'draft' || sp.bills === 'open') {
    redirect(`/home/${account}/billing/drafts`);
  }

  if (sp.unit) {
    // `?unit=` carried a unit *number*; level 3 is keyed by id. Resolve it so
    // the link lands on that unit rather than dumping the user in the list.
    const { data: match } = await client
      .from('units')
      .select('id')
      .eq('association_id', association.id)
      .eq('unit_no', sp.unit)
      .maybeSingle();

    redirect(match ? `${unitsHref}/${match.id}` : unitsHref);
  }

  const legacy = new URLSearchParams();

  if (sp.filter) legacy.set('filter', sp.filter);
  else if (sp.status && STATUS_TO_FILTER[sp.status]) {
    legacy.set('filter', STATUS_TO_FILTER[sp.status]!);
  }

  if (sp.duration) legacy.set('duration', sp.duration);

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // An arbitrary period isn't expressible as a duration key; only the current
  // month maps cleanly, and anything else falls back to the unfiltered list.
  if (sp.period && !legacy.has('duration')) {
    if (sp.period === currentPeriod) legacy.set('duration', 'current_month');
  }

  if ([...legacy].length > 0) {
    redirect(`${unitsHref}?${legacy.toString()}`);
  }

  // ── Tiles ─────────────────────────────────────────────────────────────────
  const [billsResult, otherChargesCount, sinkingChargesCount, mescomResult] =
    await Promise.all([
      client
        .from('bills')
        .select(BILL_AMOUNTS_SELECT)
        .eq('association_id', association.id)
        .neq('status', 'Void'),
      client
        .from('pending_other_charges')
        .select('id', { count: 'exact', head: true })
        .eq('association_id', association.id)
        .eq('billed', false),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any)
        .from('pending_sinking_fund_charges')
        .select('id', { count: 'exact', head: true })
        .eq('association_id', association.id)
        .eq('billed', false),
      client
        .from('mescom_bills')
        .select('period')
        .eq('association_id', association.id),
    ]);

  const rawBills = billsResult.data ?? [];

  const bills: BillKpiRow[] = rawBills.map((b) => ({
    total_amount: Number(b.total_amount),
    paid_amount: Number(b.paid_amount),
    advance_applied: b.advance_applied != null ? Number(b.advance_applied) : 0,
    status: b.status,
    due_date: b.due_date,
    period: b.period,
  }));

  const generatedElecPeriods = new Set(
    rawBills.filter((b) => b.bill_type === 'electricity').map((b) => b.period),
  );
  const pendingElectricity = (mescomResult.data ?? []).filter(
    (mb) => !generatedElecPeriods.has(mb.period),
  ).length;

  // Maintenance is an informational alert, not a stageable item — exclude it
  // so the badge count reflects actual billable charges only.
  const draftCount =
    (otherChargesCount.count ?? 0) +
    (sinkingChargesCount.count ?? 0) +
    pendingElectricity;

  return (
    <PageBody>
      <TeamAccountLayoutPageHeader
        account={account}
        title={<Trans i18nKey="association.nav.billing" />}
        description={
          bills.length === 0 ? 'No bills yet' : `${bills.length} bills`
        }
      />

      <div className="mt-2 flex flex-col gap-6">
        <BillingOverview
          bills={bills}
          accountSlug={account}
          currentPeriod={currentPeriod}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <NavCard
            href={`${unitsHref}`}
            title="Bills by Unit"
            description="Review what each unit owes, drill into any period, and download bills."
          />
          <NavCard
            href={`/home/${account}/billing/drafts`}
            title="Drafts"
            description={
              draftCount > 0
                ? `${draftCount} charge${draftCount !== 1 ? 's' : ''} waiting to be billed.`
                : 'Nothing waiting — all charges have been billed.'
            }
            badge={draftCount > 0 ? draftCount : undefined}
            icon={<FilePlus2 className="h-4 w-4" />}
          />
        </div>
      </div>
    </PageBody>
  );
}

function NavCard({
  href,
  title,
  description,
  badge,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  badge?: number;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="bg-card hover:bg-accent/40 focus-visible:ring-ring group flex items-center justify-between gap-4 rounded-xl border px-4 py-3.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold">{title}</span>
          {badge !== undefined && (
            <span className="bg-primary text-primary-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold">
              {badge}
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <ArrowRight className="text-muted-foreground group-hover:text-foreground h-4 w-4 shrink-0 transition-colors" />
    </Link>
  );
}
