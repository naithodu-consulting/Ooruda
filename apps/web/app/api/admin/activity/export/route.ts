import { NextResponse } from 'next/server';

import { isSuperAdmin } from '@kit/admin';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

export const runtime = 'nodejs';

const MAX_ROWS = 10_000;

function escapeCsv(val: string | null | undefined): string {
  if (val == null) return '';
  // Prefix formula-injection characters so spreadsheet apps don't evaluate them
  const s = /^[=+\-@]/.test(String(val)) ? `'${String(val)}` : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatISTDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

export async function GET(request: Request) {
  const client = getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user || !(await isSuperAdmin(client))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get('search') ?? '';
  const eventType = url.searchParams.get('eventType') ?? '';
  const assocId = url.searchParams.get('assocId') ?? '';
  const dateFrom = url.searchParams.get('dateFrom') ?? '';
  const dateTo = url.searchParams.get('dateTo') ?? '';

  const adminClient = getSupabaseServerAdminClient();

  let query = adminClient
    .from('audit_logs')
    .select(
      'id, action, summary, actor_user_id, association_id, created_at, event_type, status_code, error_code, path',
    )
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (dateFrom) {
    query = query.gte('created_at', dateFrom + 'T00:00:00+05:30');
  }
  if (dateTo) {
    query = query.lte('created_at', dateTo + 'T23:59:59+05:30');
  }

  const validEventTypes = [
    'user_action',
    'api_call',
    'auth_event',
    'system_event',
    'error',
  ];
  if (eventType && validEventTypes.includes(eventType)) {
    if (eventType === 'error') {
      query = query.or(`event_type.eq.error,status_code.gte.400`);
    } else {
      query = query.eq('event_type', eventType);
    }
  }

  if (search) {
    query = query.or(`action.ilike.%${search}%,summary.ilike.%${search}%`);
  }

  if (assocId) {
    query = query.eq('association_id', assocId);
  }

  const { data: logs } = await query;

  // Resolve actor names + association names
  const actorIds = [
    ...new Set((logs ?? []).map((l) => l.actor_user_id).filter(Boolean)),
  ] as string[];
  const assocIds = [
    ...new Set((logs ?? []).map((l) => l.association_id).filter(Boolean)),
  ] as string[];

  const [profilesResult, assocResult] = await Promise.all([
    actorIds.length > 0
      ? adminClient.from('profiles').select('id, full_name').in('id', actorIds)
      : Promise.resolve({ data: [] }),
    assocIds.length > 0
      ? adminClient
          .from('associations')
          .select('id, accounts!inner(name)')
          .in('id', assocIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nameById = new Map(
    (profilesResult.data ?? []).map((p) => [p.id, p.full_name]),
  );
  const assocNameById = new Map(
    (assocResult.data ?? []).map((a) => [
      a.id,
      (a.accounts as { name?: string } | null)?.name ?? null,
    ]),
  );

  const headers = [
    'Date (IST)',
    'Event',
    'Event Type',
    'User',
    'Association',
    'Details',
    'Status Code',
    'Error Code',
    'Path',
  ];

  const csvRows = (logs ?? []).map((l) => [
    formatISTDate(l.created_at),
    l.action,
    l.event_type ?? '',
    l.actor_user_id ? (nameById.get(l.actor_user_id) ?? 'Unknown') : 'System',
    l.association_id
      ? (assocNameById.get(l.association_id) ?? l.association_id.slice(0, 8))
      : '',
    l.summary ?? '',
    l.status_code != null ? String(l.status_code) : '',
    l.error_code ?? '',
    l.path ?? '',
  ]);

  const csv = [headers, ...csvRows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n');

  const date = new Date().toISOString().slice(0, 10);
  const filename = `activity-log-${date}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
