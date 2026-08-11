import 'server-only';
import { getLogger } from '@kit/shared/logger';

export type ErrorClass =
  | 'permission'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'db_function'
  | 'server';

export interface SanitizeResult {
  userMessage: string;
  errorClass: ErrorClass;
  ref: string;
}

interface PgError {
  code?: string;
  message?: string;
  details?: string;
}

/**
 * Sanitizes a raw error at the server action boundary.
 *
 * - Logs the full raw error + context server-side via getLogger()
 * - Classifies the error by Postgres error code and message patterns
 * - Returns a safe, user-facing message — never the raw DB/API string
 *
 * ref: short timestamp code included in unrecoverable messages so users
 * can quote it to support and developers can grep server logs.
 */
export async function sanitizeActionError(
  error: unknown,
  ctx: Record<string, unknown>,
): Promise<SanitizeResult> {
  const logger = await getLogger();

  const now = new Date();
  const ref =
    now.toISOString().slice(5, 10).replace('-', '') + // MMDD
    '-' +
    now.toISOString().slice(11, 16).replace(':', ''); // HHMM

  const msg =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const pgCode = (error as PgError)?.code ?? '';

  logger.error(
    {
      ...ctx,
      errorMessage: msg,
      errorCode: pgCode,
      errorDetails: (error as PgError)?.details,
      ref,
    },
    'Action error',
  );

  const errorClass = classify(msg, pgCode);

  return {
    userMessage: USER_MESSAGES[errorClass](ref),
    errorClass,
    ref,
  };
}

function classify(msg: string, pgCode: string): ErrorClass {
  // Postgres unique violation
  if (pgCode === '23505' || /duplicate|already exists/i.test(msg)) {
    return 'conflict';
  }

  // Postgres ambiguous function call (overload resolution failure)
  if (pgCode === '42725' || /candidate function|overload/i.test(msg)) {
    return 'db_function';
  }

  // Supabase PGRST116 = no rows / not found
  if (pgCode === 'PGRST116' || /not found|no rows|does not exist/i.test(msg)) {
    return 'not_found';
  }

  // Permission / auth errors thrown explicitly from action validation
  if (
    /permission|not authorized|only an association|only a super|cannot be actioned|do not have permission/i.test(
      msg,
    )
  ) {
    return 'permission';
  }

  // Foreign key violation — typically a "not found" for the user
  if (pgCode === '23503') {
    return 'not_found';
  }

  return 'server';
}

const USER_MESSAGES: Record<ErrorClass, (ref: string) => string> = {
  permission: () =>
    "You don't have permission to do this. Contact your association admin if you think this is incorrect.",

  not_found: () =>
    'The item could not be found. It may have been deleted — try refreshing the page.',

  conflict: () =>
    'This already exists. Check for a duplicate entry and try again.',

  // Validation messages are thrown explicitly by action code and are already
  // user-safe — callers should pass the message string directly, not route it
  // through sanitizeActionError. This class is a safety net only.
  validation: (ref) =>
    `The submitted data was invalid. Please check your input and try again. (ref: ${ref})`,

  db_function: (ref) =>
    `Something went wrong on our end. Please try again in a moment. (ref: ${ref})`,

  server: (ref) =>
    `Something went wrong. Please try again, or contact support if the issue persists. (ref: ${ref})`,
};
