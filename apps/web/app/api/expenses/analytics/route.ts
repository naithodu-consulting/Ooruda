import { NextRequest, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

// GET /api/expenses/analytics?associationId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const associationId = searchParams.get('associationId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!associationId) {
    return NextResponse.json(
      { error: 'Missing associationId' },
      { status: 400 },
    );
  }

  const client = getSupabaseServerClient();

  // Auth check - ensure there is a session
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RLS on the expenses table already scopes to the association - verify membership
  const { data: assoc } = await client
    .from('associations')
    .select('id')
    .eq('id', associationId)
    .single();

  if (!assoc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Fetch all non-deleted expenses for this FY
  let query = client
    .from('expenses')
    .select(
      'amount, gst_amount, payee_name, mode_of_payment, date_of_payment, expense_categories(name)',
    )
    .eq('association_id', associationId)
    .is('deleted_at', null);

  if (from) query = query.gte('date_of_payment', from);
  if (to) query = query.lte('date_of_payment', to);

  const { data: expenses, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also fetch this month's data
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthFrom = new Date(y, m, 1).toLocaleDateString('en-CA');
  const monthTo = new Date(y, m + 1, 0).toLocaleDateString('en-CA');

  const { data: monthExpenses } = await client
    .from('expenses')
    .select(
      'amount, payee_name, mode_of_payment, date_of_payment, expense_categories(name)',
    )
    .eq('association_id', associationId)
    .is('deleted_at', null)
    .gte('date_of_payment', monthFrom)
    .lte('date_of_payment', monthTo);

  const rows = expenses ?? [];
  const monthRows = monthExpenses ?? [];

  // Aggregations
  const totalThisFy = rows.reduce(
    (s: number, e: any) => s + (e.amount ?? 0),
    0,
  );
  const totalThisMonth = monthRows.reduce(
    (s: number, e: any) => s + (e.amount ?? 0),
    0,
  );
  const countThisMonth = monthRows.length;

  // Category breakdown (FY)
  const catMap = new Map<string, number>();
  for (const e of rows) {
    const catName =
      (e.expense_categories as { name: string } | null)?.name ??
      'Uncategorized';
    catMap.set(catName, (catMap.get(catName) ?? 0) + e.amount);
  }
  const categoryBreakdown = Array.from(catMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Top category this month
  const monthCatMap = new Map<string, number>();
  for (const e of monthRows) {
    const catName =
      (e.expense_categories as { name: string } | null)?.name ??
      'Uncategorized';
    monthCatMap.set(catName, (monthCatMap.get(catName) ?? 0) + e.amount);
  }
  const sortedCategories = Array.from(monthCatMap.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const topCategoryThisMonth = sortedCategories[0]?.[0] ?? null;

  // Monthly trend - all 12 months of this FY (Apr → Mar), zero-filled for months with no data.
  // Build the canonical 12-month list from the FY start date so the chart always shows a full year.
  const fyStartDate = from ? new Date(from + 'T00:00:00') : new Date();
  const monthlyMap = new Map<string, number>();
  // Pre-seed all 12 FY months with 0 so months without expenses still appear.
  for (let i = 0; i < 12; i++) {
    const d = new Date(
      fyStartDate.getFullYear(),
      fyStartDate.getMonth() + i,
      1,
    );
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, 0);
  }
  for (const e of rows) {
    const key = e.date_of_payment.slice(0, 7); // YYYY-MM
    if (monthlyMap.has(key))
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + e.amount);
  }
  const monthlyTrend = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({
      // Show just the month abbreviation - year is redundant on a "This FY" chart
      // and 'Aug 26' (en-IN short year) is ambiguous with a date like "26 Aug".
      month: new Date(month + '-01T00:00:00').toLocaleDateString('en-IN', {
        month: 'short',
      }),
      amount,
    }));

  // Top payees (FY)
  const payeeMap = new Map<string, number>();
  for (const e of rows) {
    payeeMap.set(e.payee_name, (payeeMap.get(e.payee_name) ?? 0) + e.amount);
  }
  const topPayees = Array.from(payeeMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, amount]) => ({ name, amount }));

  // Mode breakdown (FY)
  const modeMap = new Map<string, number>();
  for (const e of rows) {
    modeMap.set(
      e.mode_of_payment,
      (modeMap.get(e.mode_of_payment) ?? 0) + e.amount,
    );
  }
  const modeBreakdown = Array.from(modeMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return NextResponse.json({
    totalThisMonth,
    totalThisFy,
    countThisMonth,
    topCategoryThisMonth,
    categoryBreakdown,
    monthlyTrend,
    topPayees,
    modeBreakdown,
  });
}
