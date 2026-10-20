# @kit/analytics

## Non-Negotiables

1. Client: `import { analytics } from '@kit/analytics'` / Server: `import { analytics } from '@kit/analytics/server'`
2. NEVER track PII (emails, names, IPs) in event properties
3. NEVER manually call `trackPageView` or `identify` - the analytics provider plugin handles these automatically
4. NEVER create custom providers without implementing the full `AnalyticsService` interface

## Exemplar

- `apps/web/components/analytics-provider.tsx` - provider setup with plugin registration
