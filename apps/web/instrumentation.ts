import { type Instrumentation } from 'next';

export async function register() {
  const { registerMonitoringInstrumentation } =
    await import('@kit/monitoring/instrumentation');

  await registerMonitoringInstrumentation();
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  // Forward to monitoring provider (Sentry etc.) — no-op when unconfigured.
  const { onRequestError: handler } =
    await import('@kit/monitoring/instrumentation');
  void handler(error, request, context);

  // Also persist to audit_logs so unhandled server errors appear in the
  // Activity Log without requiring an external monitoring subscription.
  // Runs best-effort — never throws.
  try {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      const { logAuditEvent } = await import('~/lib/audit-log');
      const err = error instanceof Error ? error : new Error(String(error));
      await logAuditEvent({
        action: 'request.unhandled_error',
        entityType: 'request',
        eventType: 'error',
        summary: err.message.slice(0, 300),
        httpMethod: request.method ?? null,
        path: request.path ?? null,
        statusCode: 500,
        useAdminClient: true,
      });
    }
  } catch {
    // intentionally silent
  }
};
