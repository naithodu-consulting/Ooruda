import { createRegistry } from '@kit/shared/registry';

import {
  MonitoringProvider,
  getMonitoringProvider,
} from './get-monitoring-provider';

type CaptureMechanism =
  | 'onerror'
  | 'onunhandledrejection'
  | 'react-error-boundary';

type ClientInstrumentationRegistration = {
  init: () => Promise<void> | void;
  captureException: (error: unknown, mechanism: CaptureMechanism) => void;
};

const clientInstrumentationRegistry = createRegistry<
  ClientInstrumentationRegistration,
  NonNullable<MonitoringProvider>
>();

clientInstrumentationRegistry.register('sentry', async () => {
  const [{ initializeSentryBrowserClient }, sentry] = await Promise.all([
    import('@kit/sentry/config/client'),
    import('@sentry/nextjs'),
  ]);

  return {
    init: () => {
      initializeSentryBrowserClient({
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      });
    },
    captureException: (error, mechanism) => {
      sentry.captureException(error, {
        mechanism: { handled: false, type: mechanism },
      });
    },
  };
});

// Module-level promise so `captureClientException` callers can await the
// same lazy init that `registerClientMonitoringInstrumentation` kicks off.
// `null` once init succeeds (resolved) or fails (rejected) - we still keep
// the resolved promise; nulling out just lets us short-circuit `register`
// when called twice.
let initPromise: Promise<ClientInstrumentationRegistration | null> | null =
  null;

function loadInstrumentation() {
  if (initPromise) return initPromise;

  const provider = getMonitoringProvider();

  if (!provider) {
    initPromise = Promise.resolve(null);
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const instrumentation = await clientInstrumentationRegistry.get(provider);

      await instrumentation.init();

      return instrumentation;
    } catch (error) {
      console.error(
        '[monitoring] failed to load client instrumentation',
        error,
      );

      return null;
    }
  })();

  return initPromise;
}

/**
 * @name registerClientMonitoringInstrumentation
 * @description Install provider-agnostic global error handlers and lazily
 * load the configured monitoring provider. The handlers are owned by this
 * module - not by any specific provider - and forward unhandled errors
 * through the registered provider's `captureException`. Errors that fire
 * before the provider chunk finishes loading are buffered, then replayed.
 */
export function registerClientMonitoringInstrumentation() {
  if (typeof window === 'undefined') return;

  const provider = getMonitoringProvider();

  if (!provider) return;

  const buffer: Array<{ error: unknown; mechanism: CaptureMechanism }> = [];

  let capture: ((error: unknown, mechanism: CaptureMechanism) => void) | null =
    null;

  const forward = (error: unknown, mechanism: CaptureMechanism) => {
    if (capture) {
      capture(error, mechanism);
    } else {
      buffer.push({ error, mechanism });
    }
  };

  const onError = (event: ErrorEvent) => {
    forward(event.error ?? new Error(event.message), 'onerror');
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    forward(event.reason, 'onunhandledrejection');
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  // Kick the lazy load immediately - the Sentry chunk fetches in parallel
  // with hydration without blocking it, and any errors that fire in the
  // meantime sit in the buffer.
  void loadInstrumentation().then((instrumentation) => {
    if (!instrumentation) {
      buffer.length = 0;
      return;
    }

    capture = instrumentation.captureException;

    for (const { error, mechanism } of buffer) {
      try {
        capture(error, mechanism);
      } catch (replayError) {
        console.error('[monitoring] replay failed', replayError);
      }
    }

    buffer.length = 0;
  });
}

/**
 * @name captureClientException
 * @description Report a client-side exception without depending on the
 * React `MonitoringContext`. Use this where the provider tree isn't
 * available (e.g. `global-error.tsx`, which replaces the root layout).
 */
export async function captureClientException(
  error: unknown,
  mechanism: CaptureMechanism = 'react-error-boundary',
) {
  if (typeof window === 'undefined') return;

  const instrumentation = await loadInstrumentation();

  if (!instrumentation) {
    console.error('[monitoring]', error);
    return;
  }

  try {
    instrumentation.captureException(error, mechanism);
  } catch (captureError) {
    console.error('[monitoring] capture failed', captureError, error);
  }
}
