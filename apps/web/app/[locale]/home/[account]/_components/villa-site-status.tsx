import { CheckCircle2, CircleAlert, PlugZap } from 'lucide-react';

import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Badge } from '@kit/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Trans } from '@kit/ui/trans';

import { checkSiteReachable, getVillaSite } from '~/lib/villa-db/client';
import { isVillaDbError } from '~/lib/villa-db/errors';

type Status = 'connected' | 'not_configured' | 'unreachable' | 'error';

async function probe(accountId: string, propertyId: string): Promise<Status> {
  try {
    const site = await getVillaSite(accountId, propertyId);
    await checkSiteReachable(site);
    return 'connected';
  } catch (error) {
    const code = isVillaDbError(error) ? error.code : 'UNKNOWN';

    if (code === 'NOT_CONFIGURED') return 'not_configured';

    const logger = await getLogger();
    logger.warn(
      {
        propertyId,
        code,
        detail: isVillaDbError(error) ? error.detail : String(error),
      },
      'villa booking site status check failed',
    );

    return code === 'UNREACHABLE' || code === 'UNCERTAIN'
      ? 'unreachable'
      : 'error';
  }
}

/**
 * Whether each of this villa's properties can reach its booking site.
 * Rendered inside Suspense: a slow site must not hold up the dashboard.
 */
export async function VillaSiteStatus({ accountId }: { accountId: string }) {
  const client = getSupabaseServerClient();

  const { data: properties, error } = await client
    .from('villa_properties')
    .select('id, name, booking_code_prefix')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .order('created_at');

  if (error) {
    // Say so, rather than pretending the villa is simply not connected — but
    // never take the whole dashboard down over a status card.
    const logger = await getLogger();
    logger.warn(
      { accountId, code: error.code },
      'villa properties load failed',
    );
  }

  const rows = await Promise.all(
    (properties ?? []).map(async (property) => ({
      ...property,
      status: await probe(accountId, property.id),
    })),
  );

  return (
    <Card className="bg-card" data-test={'villa-site-status'}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PlugZap className="text-muted-foreground h-4 w-4" />
          <Trans i18nKey={'villa.site.title'} />
        </CardTitle>
        <CardDescription>
          <Trans i18nKey={'villa.site.description'} />
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error ? (
          <p
            className="text-destructive text-sm"
            data-test={'villa-site-status-error'}
          >
            <Trans i18nKey={'villa.site.loadError'} />
          </p>
        ) : rows.length === 0 ? (
          <p
            className="text-muted-foreground text-sm"
            data-test={'villa-site-status-none'}
          >
            <Trans i18nKey={'villa.site.none'} />
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((row) => (
              <li
                key={row.id}
                data-test={'villa-site-status-row'}
                data-status={row.status}
                className="flex flex-col gap-2 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {row.name}
                  {row.booking_code_prefix ? (
                    <span className="text-muted-foreground font-normal">
                      {' · '}
                      {row.booking_code_prefix}
                    </span>
                  ) : null}
                </span>

                <StatusBadge status={row.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'connected') {
    return (
      <Badge
        variant="outline"
        className="border-success/40 text-success w-fit gap-1"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        <Trans i18nKey={'villa.site.connected'} />
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-destructive/40 text-destructive w-fit gap-1"
    >
      <CircleAlert className="h-3.5 w-3.5" />
      <Trans
        i18nKey={
          status === 'not_configured'
            ? 'villa.site.notConfigured'
            : status === 'unreachable'
              ? 'villa.site.unreachable'
              : 'villa.site.error'
        }
      />
    </Badge>
  );
}
