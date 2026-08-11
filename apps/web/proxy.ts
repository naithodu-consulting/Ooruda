import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import createNextIntlMiddleware from 'next-intl/middleware';

import { isSuperAdmin } from '@kit/admin';
import { routing } from '@kit/i18n/routing';
import { getSafeRedirectPath } from '@kit/shared/utils';
import { checkRequiresMultiFactorAuthentication } from '@kit/supabase/check-requires-mfa';
import { createMiddlewareClient } from '@kit/supabase/middleware-client';

import pathsConfig from '~/config/paths.config';

const NEXT_ACTION_HEADER = 'next-action';
const ACCESS_COOKIE = 'ooruda_access'; // must match COOKIE_NAME in access-action.ts
const ACCESS_PATH = '/access';

// Seeded dev users are provisioned phone-only and are exempt from the
// mandatory-email gate (they also receive synthetic <phone>@ooruda.test emails
// in the seed, so this is belt-and-suspenders). Phones are stored E.164 without
// a leading '+', matching auth.users.phone / the JWT phone claim.
const EMAIL_GATE_EXEMPT_PHONES = new Set([
  '919911000001',
  '919911000002',
  '919911000003',
  '919911000004',
  '919911000005',
  '919911000006',
]);

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|images|locales|assets|sitemap.xml|robots.txt).*)',
  ],
};

// ── In-process rate limiter ───────────────────────────────────────────────────
// Simple sliding-window counter keyed by IP. Works per-instance; sufficient
// for current single-instance scale. Replace with Upstash Redis for multi-instance.

interface RateLimitBucket {
  count: number;
  resetAt: number; // epoch ms
}

// Map key: "<route-group>:<ip>"
const rateLimitStore = new Map<string, RateLimitBucket>();

const RATE_LIMIT_RULES = [
  // Auth routes (sign-in, OTP, password reset) — 5 per minute
  { pathPrefix: '/auth', limit: 5, windowMs: 60_000, group: 'auth' },
  // API routes — 30 per 10 seconds
  { pathPrefix: '/api', limit: 30, windowMs: 10_000, group: 'api' },
];

function checkRateLimit(
  ip: string,
  pathname: string,
): { limited: boolean; retryAfter?: number } {
  const normalized = getNormalizedPathname(pathname);
  const rule = RATE_LIMIT_RULES.find((r) =>
    normalized.startsWith(r.pathPrefix),
  );
  if (!rule) return { limited: false };

  const key = `${rule.group}:${ip}`;
  const now = Date.now();
  const bucket = rateLimitStore.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { limited: false };
  }

  if (bucket.count >= rule.limit) {
    return {
      limited: true,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { limited: false };
}

// Periodically prune expired buckets to prevent unbounded memory growth.
// Runs every 5 minutes; safe to skip if the runtime hasn't warmed up yet.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateLimitStore.entries()) {
      if (now > bucket.resetAt) rateLimitStore.delete(key);
    }
  }, 5 * 60_000);
}

// create i18n middleware once at module scope
const handleI18nRouting = createNextIntlMiddleware(routing);

const getUser = (request: NextRequest, response: NextResponse) => {
  const supabase = createMiddlewareClient(request, response);

  return supabase.auth.getClaims();
};

export default async function proxy(request: NextRequest) {
  // ── Rate limiting ───────────────────────────────────────────────────────────
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '0.0.0.0';

  const { limited, retryAfter } = checkRateLimit(ip, request.nextUrl.pathname);
  if (limited) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        'Content-Type': 'text/plain',
        'Retry-After': String(retryAfter ?? 60),
      },
    });
  }

  // ── Skip non-page routes (API) — no i18n/session middleware needed ──────────
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // run next-intl middleware first to get the i18n-aware response
  const response = handleI18nRouting(request);

  // apply secure headers on top of the i18n response
  const secureHeadersResponse = await createResponseWithSecureHeaders(response);

  // set a unique request ID for each request
  // this helps us log and trace requests
  setRequestId(request);

  // handle patterns for specific routes
  const handlePattern = await matchUrlPattern(request);

  // if a pattern handler exists, call it
  if (handlePattern) {
    const patternHandlerResponse = await handlePattern(
      request,
      secureHeadersResponse,
    );

    // if a pattern handler returns a response, return it
    if (patternHandlerResponse) {
      return patternHandlerResponse;
    }
  }

  // append the action path to the request headers
  // which is useful for knowing the action path in server actions
  if (isServerAction(request)) {
    secureHeadersResponse.headers.set(
      'x-action-path',
      request.nextUrl.pathname,
    );
  }

  // if no pattern handler returned a response,
  // return the session response
  return secureHeadersResponse;
}

function isServerAction(request: NextRequest) {
  const headers = new Headers(request.headers);

  return headers.has(NEXT_ACTION_HEADER);
}

async function adminMiddleware(request: NextRequest, response: NextResponse) {
  const { data, error } = await getUser(request, response);

  // If user is not logged in, redirect to sign in page.
  // This should never happen, but just in case.
  if (!data?.claims || error) {
    return NextResponse.redirect(
      new URL(pathsConfig.auth.signIn, request.nextUrl.origin).href,
    );
  }

  const client = createMiddlewareClient(request, response);
  const userIsSuperAdmin = await isSuperAdmin(client);

  // If user is not an admin, redirect to 404 page.
  if (!userIsSuperAdmin) {
    return NextResponse.redirect(new URL('/404', request.nextUrl.origin).href);
  }

  // in all other cases, return the response
  return response;
}

// Memoised at module scope — URLPattern instances are created once, not per-request.
let cachedPatterns: Awaited<ReturnType<typeof buildPatterns>> | null = null;

async function getPatterns() {
  if (cachedPatterns) return cachedPatterns;
  cachedPatterns = await buildPatterns();
  return cachedPatterns;
}

/**
 * Define URL patterns and their corresponding handlers.
 */
async function buildPatterns() {
  let URLPattern = globalThis.URLPattern;

  if (!URLPattern) {
    const { URLPattern: polyfill } = await import('urlpattern-polyfill');
    URLPattern = polyfill as typeof URLPattern;
  }

  return [
    {
      pattern: new URLPattern({ pathname: '/admin/*?' }),
      handler: adminMiddleware,
    },
    {
      // PIN gate: /auth/* and /home/* require the access cookie.
      // Visitors without it are sent to /access?next=<destination>.
      pattern: new URLPattern({ pathname: '/(auth|home)/*?' }),
      handler: async (req: NextRequest, res: NextResponse) => {
        const hasAccess = req.cookies.get(ACCESS_COOKIE)?.value === '1';

        if (!hasAccess) {
          const normalizedPath = getNormalizedPathname(req.nextUrl.pathname);
          const accessUrl = new URL(ACCESS_PATH, req.nextUrl.origin);
          accessUrl.searchParams.set('next', normalizedPath);
          return NextResponse.redirect(accessUrl.href);
        }
      },
    },
    {
      pattern: new URLPattern({ pathname: '/auth/*?' }),
      handler: async (req: NextRequest, res: NextResponse) => {
        const { data } = await getUser(req, res);
        const normalizedPathname = getNormalizedPathname(req.nextUrl.pathname);

        // the user is logged out, so we don't need to do anything
        if (!data?.claims) {
          return;
        }

        // check if we need to verify MFA (user is authenticated but needs to verify MFA)
        const isVerifyMfa = normalizedPathname === pathsConfig.auth.verifyMfa;

        // the complete-profile page lives under /auth but is for already
        // logged-in users adding a mandatory email — don't bounce them home.
        const isCompleteProfile =
          normalizedPathname === pathsConfig.auth.completeProfile;

        // If user is logged in and does not need to verify MFA or complete
        // their profile, redirect to home page.
        if (!isVerifyMfa && !isCompleteProfile) {
          const nextPath = getSafeRedirectPath(
            req.nextUrl.searchParams.get('next'),
            pathsConfig.app.home,
          );

          return NextResponse.redirect(
            new URL(nextPath, req.nextUrl.origin).href,
          );
        }
      },
    },
    {
      // Root: authenticated users go to /home; unauthenticated users see
      // the landing page (no redirect — let the marketing page render).
      // Skip the Supabase round-trip when there is no auth session cookie,
      // which is the common case for unauthenticated landing-page visitors.
      pattern: new URLPattern({ pathname: '/' }),
      handler: async (req: NextRequest, res: NextResponse) => {
        const hasSessionCookie = req.cookies
          .getAll()
          .some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));

        if (!hasSessionCookie) return; // no session — let the landing page render

        const { data } = await getUser(req, res);

        if (data?.claims) {
          return NextResponse.redirect(
            new URL(pathsConfig.app.home, req.nextUrl.origin).href,
          );
        }

        return;
      },
    },
    {
      pattern: new URLPattern({ pathname: '/home/*?' }),
      handler: async (req: NextRequest, res: NextResponse) => {
        const { data } = await getUser(req, res);
        const { origin, pathname: next } = req.nextUrl;

        // If user is not logged in, redirect to sign in page.
        if (!data?.claims) {
          const signIn = pathsConfig.auth.signIn;
          const redirectPath = `${signIn}?next=${next}`;

          return NextResponse.redirect(new URL(redirectPath, origin).href);
        }

        const supabase = createMiddlewareClient(req, res);

        const requiresMultiFactorAuthentication =
          await checkRequiresMultiFactorAuthentication(supabase);

        // If user requires multi-factor authentication, redirect to MFA page.
        if (requiresMultiFactorAuthentication) {
          return NextResponse.redirect(
            new URL(pathsConfig.auth.verifyMfa, origin).href,
          );
        }

        // Email is mandatory. A user with no email on their account (legacy
        // phone-only users) is sent to complete their profile before reaching
        // the app. Seeded dev phones are exempt. Super-admins authenticate by
        // email already, so they always have one.
        const claims = data.claims as {
          email?: string;
          phone?: string;
        };

        const hasEmail = !!claims.email;
        const isExemptPhone =
          !!claims.phone && EMAIL_GATE_EXEMPT_PHONES.has(claims.phone);

        if (!hasEmail && !isExemptPhone) {
          return NextResponse.redirect(
            new URL(pathsConfig.auth.completeProfile, origin).href,
          );
        }
      },
    },
  ];
}

/**
 * Match URL patterns to specific handlers.
 * @param request
 */
async function matchUrlPattern(request: NextRequest) {
  const patterns = await getPatterns();
  const input = getNormalizedPathname(request.nextUrl.pathname);

  for (const pattern of patterns) {
    const patternResult = pattern.pattern.exec(input, request.nextUrl.origin);

    if (patternResult !== null && 'pathname' in patternResult) {
      return pattern.handler;
    }
  }
}

function getNormalizedPathname(pathname: string) {
  const localePrefix = getLocalePrefix(pathname);

  if (!localePrefix) {
    return pathname;
  }

  const normalizedPathname = pathname.slice(localePrefix.length);

  return normalizedPathname || '/';
}

function getLocalePrefix(pathname: string) {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;

    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return prefix;
    }
  }

  return null;
}

/**
 * Set a unique request ID for each request.
 * @param request
 */
function setRequestId(request: Request) {
  request.headers.set('x-correlation-id', crypto.randomUUID());
}

/**
 * @name createResponseWithSecureHeaders
 * @description Create a middleware with enhanced headers applied (if applied).
 * This is disabled by default. To enable set ENABLE_STRICT_CSP=true
 */
async function createResponseWithSecureHeaders(response: NextResponse) {
  const enableStrictCsp = process.env.ENABLE_STRICT_CSP ?? 'false';

  // we disable ENABLE_STRICT_CSP by default
  if (enableStrictCsp === 'false') {
    return response;
  }

  const { createCspResponse } = await import('./lib/create-csp-response');
  const cspResponse = await createCspResponse();

  // set the CSP headers on the i18n response
  if (cspResponse) {
    for (const [key, value] of cspResponse.headers.entries()) {
      response.headers.set(key, value);
    }
  }

  return response;
}
