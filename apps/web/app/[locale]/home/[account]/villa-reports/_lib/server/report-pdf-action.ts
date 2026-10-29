'use server';

import 'server-only';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { loadPdfRenderer } from '~/lib/server/pdf-renderer';
import { getVillaRole } from '~/lib/villa/auth';
import { loadVillaProperties } from '~/lib/villa/properties';
import { resolveReportRange } from '~/lib/villa/reports';

import {
  REPORT_TABS,
  type ReportTabKey,
  loadVillaReportData,
} from './load-report';
import { buildPdfData } from './report-pdf-data';

type Result =
  | { success: true; base64: string; filename: string }
  | { success: false; error: string };

/**
 * Renders the open report tab as a PDF document.
 *
 * It re-reads the figures through the same loader the page uses rather than
 * taking them from the browser, so the file is the villa's data as the server
 * sees it and cannot be steered from the client beyond picking a tab and a
 * date range. It does not refresh the bookings mirror first (see
 * loadVillaReportData), so a tab left open across a sync exports the same
 * stale figures it is showing.
 */
export async function downloadVillaReportPdfAction(
  accountId: string,
  propertyId: string,
  tab: string,
  from: string,
  to: string,
): Promise<Result> {
  // Start loading/warming the renderer; it overlaps the queries below.
  const rendererPromise = loadPdfRenderer();
  rendererPromise.catch(() => undefined);

  const reportTab: ReportTabKey = REPORT_TABS.includes(tab as ReportTabKey)
    ? (tab as ReportTabKey)
    : 'overview';

  // Re-resolved rather than trusted: the dates arrive from a URL.
  const range = resolveReportRange(
    { preset: 'custom', from, to },
    new Date().toISOString().slice(0, 10),
  );

  // Everything this needs starts at once.
  //
  // The role check, the property list and the profile depend on none of each
  // other, and the report queries depend on none of them either: they run on
  // the RLS-enforced client, which is what actually decides whether this
  // caller may read a villa's bookings - the role check above it is defence
  // in depth, and a caller who fails it gets an empty result from the
  // database anyway. Chaining the four made the export wait out three serial
  // round trips before the first report query had even been sent, which on a
  // remote database was most of the time the user spent looking at the
  // spinner. `generatedBy` is read here rather than taken from the browser:
  // the footer is a record of who pulled the figures.
  const reportPromise = loadVillaReportData({
    propertyId,
    tab: reportTab,
    range,
  });

  // Nothing may reject before it is awaited, or Node kills the process.
  reportPromise.catch(() => undefined);

  const [role, properties, { data: profile }] = await Promise.all([
    getVillaRole(accountId),
    loadVillaProperties(accountId),
    getSupabaseServerClient()
      .from('profiles')
      .select('full_name')
      .maybeSingle(),
  ]);

  if (!role) return { success: false, error: 'Access denied.' };

  const property = properties.find((p) => p.id === propertyId);

  if (!property) return { success: false, error: 'Villa not found.' };

  const generatedBy = profile?.full_name ?? 'Ooruda';

  try {
    const data = await reportPromise;

    const renderer = await rendererPromise;
    const buffer = await renderer.renderVillaReportPdf(
      buildPdfData(reportTab, range, property.name, generatedBy, data),
    );

    const stem = property.name.replace(/[^\w-]+/g, '-').toLowerCase();

    return {
      success: true,
      base64: buffer.toString('base64'),
      filename: `${stem}-${reportTab}-${range.from}-to-${range.to}.pdf`,
    };
  } catch (error) {
    (await getLogger()).error(
      { propertyId: property.id, tab: reportTab, error },
      'villa report pdf failed',
    );

    return { success: false, error: 'Could not generate the PDF.' };
  }
}
