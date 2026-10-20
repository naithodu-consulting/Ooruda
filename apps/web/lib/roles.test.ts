import { describe, expect, it } from 'vitest';

import {
  filterSidebarConfigByRole,
  getTeamAccountSidebarConfig,
} from '~/config/team-account-navigation.config';

import {
  PROPOPS_ROLES,
  ROLE_HIERARCHY_LEVEL_BY_ROLE,
  SUPER_ADMIN_ROLE_BY_PRODUCT,
  VILLA_ROLES,
  isVillaRole,
  productForRole,
} from './roles';

function navLabels(config: ReturnType<typeof getTeamAccountSidebarConfig>) {
  return config.routes.flatMap((section) =>
    'children' in section && Array.isArray(section.children)
      ? section.children.map((item) => item.label as string)
      : [],
  );
}

describe('productForRole', () => {
  it('maps villa roles to the villa product', () => {
    for (const role of VILLA_ROLES) {
      expect(productForRole(role)).toBe('villa');
      expect(isVillaRole(role)).toBe(true);
    }
  });

  it('maps association roles, unknown and missing roles to association', () => {
    for (const role of PROPOPS_ROLES) {
      expect(productForRole(role)).toBe('association');
      expect(isVillaRole(role)).toBe(false);
    }

    expect(productForRole(null)).toBe('association');
    expect(productForRole(undefined)).toBe('association');
    expect(productForRole('custom-role')).toBe('association');
  });
});

describe('role hierarchy levels', () => {
  it('are unique and keep villa roles clear of the association band', () => {
    const levels = Object.values(ROLE_HIERARCHY_LEVEL_BY_ROLE);
    expect(new Set(levels).size).toBe(levels.length);

    for (const role of VILLA_ROLES) {
      expect(ROLE_HIERARCHY_LEVEL_BY_ROLE[role]).toBeGreaterThanOrEqual(10);
    }
  });

  it('ranks villa_admin above villa_manager', () => {
    expect(ROLE_HIERARCHY_LEVEL_BY_ROLE.villa_admin).toBeLessThan(
      ROLE_HIERARCHY_LEVEL_BY_ROLE.villa_manager,
    );
  });
});

describe('super-admin acting role', () => {
  it('is the top role of each product', () => {
    expect(SUPER_ADMIN_ROLE_BY_PRODUCT.association).toBe('assoc_admin');
    expect(SUPER_ADMIN_ROLE_BY_PRODUCT.villa).toBe('villa_admin');
  });
});

describe('team sidebar by product', () => {
  it('builds the villa nav for villa roles, never association items', () => {
    for (const role of VILLA_ROLES) {
      const labels = navLabels(
        filterSidebarConfigByRole(getTeamAccountSidebarConfig('v', role), role),
      );

      expect(labels.length).toBeGreaterThan(0);
      expect(labels.every((label) => label.startsWith('villa.nav.'))).toBe(
        true,
      );
    }
  });

  it('hides Members and Discounts from villa managers', () => {
    const labels = navLabels(
      filterSidebarConfigByRole(
        getTeamAccountSidebarConfig('v', 'villa_manager'),
        'villa_manager',
      ),
    );

    expect(labels).not.toContain('villa.nav.members');
    expect(labels).not.toContain('villa.nav.discounts');
  });

  it('builds the association nav for association roles, never villa items', () => {
    const labels = navLabels(
      filterSidebarConfigByRole(
        getTeamAccountSidebarConfig('a', 'assoc_admin'),
        'assoc_admin',
      ),
    );

    expect(labels).toContain('association.nav.billing');
    expect(labels.some((label) => label.startsWith('villa.nav.'))).toBe(false);
  });

  it('shows nothing to an unknown or missing role (deny by default)', () => {
    const config = getTeamAccountSidebarConfig('a');

    expect(navLabels(filterSidebarConfigByRole(config, 'custom-role'))).toEqual(
      [],
    );
    expect(navLabels(filterSidebarConfigByRole(config, null))).toEqual([]);
  });

  it('shows a villa role nothing from the association sidebar', () => {
    // The regression this guards: the old filter failed open for roles it
    // did not know, which would have shown villa users every billing screen.
    const labels = navLabels(
      filterSidebarConfigByRole(
        getTeamAccountSidebarConfig('a', 'assoc_admin'),
        'villa_admin',
      ),
    );

    expect(labels).toEqual([]);
  });
});
