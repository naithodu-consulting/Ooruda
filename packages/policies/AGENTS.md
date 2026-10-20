# @kit/policies - Registry-Based Policy System

## Non-Negotiables

1. ALWAYS use `definePolicy` with a unique `id` and register in a registry via `createPolicyRegistry()`
2. NEVER write inline policies in feature code - define in a registry file
3. ALWAYS use `allow()`/`deny()` returns with error codes and remediation messages
4. ALWAYS assign stages (`preliminary`, `submission`) for stage-aware evaluation
5. ALWAYS use `createPoliciesFromRegistry()` to load policies by ID - supports config tuples like `['max-invitations', { maxInvitations: 5 }]`
6. ALWAYS use `createPolicyEvaluator()` and call `evaluatePolicies()` or `evaluateGroups()`
7. NEVER evaluate policies without specifying an operator (`ALL` = AND, `ANY` = OR)

## Key Imports

- `definePolicy`, `allow`, `deny`, `createPolicyRegistry`, `createPoliciesFromRegistry`, `createPolicyEvaluator` - all from `@kit/policies`

## Exemplar

- `packages/features/team-accounts/src/server/policies/policies.ts` - real-world registry with stage-aware, configurable policies
