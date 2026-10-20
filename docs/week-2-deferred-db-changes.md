# Week 2 - Deferred (non-additive) DB changes

**Why this file exists.** Week 2 is developed on the `week-2` branch but shares a
single Supabase project with production (`main`). To avoid breaking production we
follow an **additive-only** migration rule on the shared DB:

> ✅ Allowed (additive): new tables, new columns with safe defaults, new indexes,
> new RLS policies, new functions/triggers (`create or replace` of *new* objects).
>
> ❌ Deferred (non-additive): altering/dropping existing columns, changing
> existing RLS policies, modifying existing functions/triggers relied on by
> production, type/enum changes, destructive backfills.

Anything we _would_ have changed but couldn't under this rule gets logged below,
so it isn't lost. **Before merging `week-2` → `main`, every open item here must be
resolved** (applied as a proper migration once production can absorb it).

How to apply on the shared DB while the CLI direct connection is down (IPv6
timeout): run the SQL via the Supabase Management API query endpoint and record a
row in `supabase_migrations.schema_migrations`, OR use the IPv4 session pooler
`--db-url`. See the chat history / DEPLOYMENT notes.

---

## Open deferrals

_None yet._

<!--
Template for an entry:

### [SHORT TITLE]
- **Date noted:** YYYY-MM-DD
- **Where:** table/policy/function/file
- **What we'd ideally change:** …
- **Why deferred:** would alter an existing object relied on by production
- **Additive workaround used instead:** …
- **Resolve at merge by:** the exact migration to write before/at merge
-->

## Resolved

_None yet._
