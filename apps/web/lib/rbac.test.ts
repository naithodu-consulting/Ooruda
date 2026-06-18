import { describe, expect, it } from 'vitest';

import {
  PROPOPS_ROLES,
  ROLE_HIERARCHY,
  ROLE_LABELS,
  type PropOpsRole,
  hasMinimumRole,
} from './rbac';

/**
 * Unit tests for the PropOps RBAC primitives in `lib/rbac.ts`.
 *
 * These cover the pure, database-free authorization logic:
 *   - the role set and its privilege ordering;
 *   - `hasMinimumRole`, the helper that gates every privilege-tiered action.
 *
 * The DB-side mirror of this model (the `roles` / `role_permissions` seed and
 * the RLS policies that read it) is asserted separately in the pgTAP suite
 * (`supabase/tests/database/proptech-rbac.test.sql`).
 */
describe('PropOps role model', () => {
  it('defines exactly the four PropOps roles', () => {
    expect([...PROPOPS_ROLES]).toEqual([
      'assoc_admin',
      'billing_operator',
      'prop_owner',
      'tenant',
    ]);
  });

  it('orders the hierarchy from most to least privileged (lower = more)', () => {
    expect(ROLE_HIERARCHY.assoc_admin).toBeLessThan(
      ROLE_HIERARCHY.billing_operator,
    );
    expect(ROLE_HIERARCHY.billing_operator).toBeLessThan(
      ROLE_HIERARCHY.prop_owner,
    );
    expect(ROLE_HIERARCHY.prop_owner).toBeLessThan(ROLE_HIERARCHY.tenant);
  });

  it('assigns a distinct hierarchy level to every role', () => {
    const levels = Object.values(ROLE_HIERARCHY);

    expect(new Set(levels).size).toBe(levels.length);
  });

  it('provides a human label for every role with no gaps', () => {
    for (const role of PROPOPS_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }

    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...PROPOPS_ROLES].sort());
  });
});

describe('hasMinimumRole', () => {
  // Full role × minimum-role matrix. `true` means the row role meets or exceeds
  // the column's required minimum (i.e. is at least as privileged).
  const matrix: Record<PropOpsRole, Record<PropOpsRole, boolean>> = {
    assoc_admin: {
      assoc_admin: true,
      billing_operator: true,
      prop_owner: true,
      tenant: true,
    },
    billing_operator: {
      assoc_admin: false,
      billing_operator: true,
      prop_owner: true,
      tenant: true,
    },
    prop_owner: {
      assoc_admin: false,
      billing_operator: false,
      prop_owner: true,
      tenant: true,
    },
    tenant: {
      assoc_admin: false,
      billing_operator: false,
      prop_owner: false,
      tenant: true,
    },
  };

  for (const userRole of PROPOPS_ROLES) {
    for (const minimumRole of PROPOPS_ROLES) {
      const expected = matrix[userRole][minimumRole];

      it(`${userRole} ${expected ? 'meets' : 'does NOT meet'} minimum ${minimumRole}`, () => {
        expect(hasMinimumRole(userRole, minimumRole)).toBe(expected);
      });
    }
  }

  it('treats a role as meeting its own minimum (reflexive)', () => {
    for (const role of PROPOPS_ROLES) {
      expect(hasMinimumRole(role, role)).toBe(true);
    }
  });

  it('is asymmetric across distinct tiers — privilege only flows downward', () => {
    expect(hasMinimumRole('assoc_admin', 'tenant')).toBe(true);
    expect(hasMinimumRole('tenant', 'assoc_admin')).toBe(false);
  });
});
