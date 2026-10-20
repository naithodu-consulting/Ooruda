import { describe, expect, it } from 'vitest';

import { type KitEnvDeps, createKitEnvService } from '../kit-env.service';
import { processEnvDefinitions } from '../scanner';
import { KitEnvUpdateInputSchema } from '../schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDeps(
  files: Record<string, string> = {},
  overrides: Partial<KitEnvDeps> = {},
): KitEnvDeps & { _store: Record<string, string> } {
  const store = { ...files };

  return {
    rootPath: '/repo',
    async readFile(filePath: string) {
      if (!(filePath in store)) {
        const error = new Error(
          `ENOENT: no such file: ${filePath}`,
        ) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return store[filePath]!;
    },
    async writeFile(filePath: string, content: string) {
      store[filePath] = content;
    },
    async fileExists(filePath: string) {
      return filePath in store;
    },
    ...overrides,
    get _store() {
      return store;
    },
  } as KitEnvDeps & { _store: Record<string, string> };
}

// ---------------------------------------------------------------------------
// getSchema
// ---------------------------------------------------------------------------

describe('KitEnvService.getSchema', () => {
  it('returns grouped env variables with expected shape', async () => {
    const service = createKitEnvService(createDeps());
    const result = await service.getSchema();

    expect(result.groups.length).toBeGreaterThan(0);

    for (const group of result.groups) {
      expect(group.name).toBeTruthy();
      expect(group.description).toBeTruthy();
      expect(group.variables.length).toBeGreaterThan(0);

      for (const variable of group.variables) {
        expect(variable.key).toBeTruthy();
        expect(typeof variable.required).toBe('boolean');
        expect(typeof variable.sensitive).toBe('boolean');
        expect(
          ['string', 'url', 'email', 'number', 'boolean', 'enum'].includes(
            variable.type,
          ),
        ).toBe(true);
      }
    }
  });

  it('includes Stripe variables with dependency metadata', async () => {
    const service = createKitEnvService(createDeps());
    const result = await service.getSchema();

    const billingGroup = result.groups.find((g) => g.name === 'Billing');
    expect(billingGroup).toBeDefined();

    const stripeSecret = billingGroup!.variables.find(
      (v) => v.key === 'STRIPE_SECRET_KEY',
    );
    expect(stripeSecret).toBeDefined();
    expect(stripeSecret!.sensitive).toBe(true);
    expect(stripeSecret!.dependencies).toBeDefined();
    expect(stripeSecret!.dependencies!.length).toBeGreaterThan(0);
    expect(stripeSecret!.dependencies![0]!.variable).toBe(
      'NEXT_PUBLIC_BILLING_PROVIDER',
    );
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('KitEnvService.update', () => {
  it('replaces an existing key in-place', async () => {
    const deps = createDeps({
      '/repo/apps/web/.env.local':
        '# Comment\nEMAIL_SENDER=team@example.com\nOTHER=foo\n',
    });

    const service = createKitEnvService(deps);

    const result = await service.update({
      key: 'EMAIL_SENDER',
      value: 'hello@example.com',
      file: '.env.local',
    });

    expect(result.success).toBe(true);

    const content = deps._store['/repo/apps/web/.env.local']!;
    expect(content).toContain('EMAIL_SENDER=hello@example.com');
    // preserves comment
    expect(content).toContain('# Comment');
    // preserves other keys
    expect(content).toContain('OTHER=foo');
  });

  it('appends new key when it does not exist', async () => {
    const deps = createDeps({
      '/repo/apps/web/.env.local': 'EXISTING=value\n',
    });

    const service = createKitEnvService(deps);

    await service.update({
      key: 'NEW_KEY',
      value: 'new_value',
      file: '.env.local',
    });

    const content = deps._store['/repo/apps/web/.env.local']!;
    expect(content).toContain('EXISTING=value');
    expect(content).toContain('NEW_KEY=new_value');
  });

  it('creates file if it does not exist', async () => {
    const deps = createDeps({});

    const service = createKitEnvService(deps);

    await service.update({
      key: 'BRAND_NEW',
      value: 'value',
      file: '.env.local',
    });

    const content = deps._store['/repo/apps/web/.env.local']!;
    expect(content).toContain('BRAND_NEW=value');
  });

  it('throws when key is missing', async () => {
    const service = createKitEnvService(createDeps());

    await expect(service.update({ value: 'v' })).rejects.toThrow(
      'Both key and value are required',
    );
  });

  it('throws when value is missing', async () => {
    const service = createKitEnvService(createDeps());

    await expect(service.update({ key: 'FOO' })).rejects.toThrow(
      'Both key and value are required',
    );
  });

  it('resolves default file for secret key in development mode', async () => {
    const deps = createDeps({});

    const service = createKitEnvService(deps);

    // STRIPE_SECRET_KEY is marked as secret in the model
    await service.update({
      key: 'STRIPE_SECRET_KEY',
      value: 'sk_test_123',
      mode: 'development',
    });

    // Secret keys default to .env.local in dev mode
    expect(deps._store['/repo/apps/web/.env.local']).toContain(
      'STRIPE_SECRET_KEY=sk_test_123',
    );
  });

  it('resolves default file for key without explicit secret flag (defaults to secret)', async () => {
    const deps = createDeps({});

    const service = createKitEnvService(deps);

    // NEXT_PUBLIC_SITE_URL has no explicit `secret` field in the model.
    // resolveDefaultFile defaults unknown to secret=true (conservative),
    // so it should go to .env.local in development mode.
    await service.update({
      key: 'NEXT_PUBLIC_SITE_URL',
      value: 'http://localhost:3000',
      mode: 'development',
    });

    expect(deps._store['/repo/apps/web/.env.local']).toContain(
      'NEXT_PUBLIC_SITE_URL=http://localhost:3000',
    );
  });

  it('resolves default file for secret key in production mode', async () => {
    const deps = createDeps({});

    const service = createKitEnvService(deps);

    await service.update({
      key: 'STRIPE_SECRET_KEY',
      value: 'sk_live_abc',
      mode: 'production',
    });

    // Secret keys in prod default to .env.production.local
    expect(deps._store['/repo/apps/web/.env.production.local']).toContain(
      'STRIPE_SECRET_KEY=sk_live_abc',
    );
  });

  it('does not default file in MCP schema', () => {
    const parsed = KitEnvUpdateInputSchema.parse({
      key: 'FOO',
      value: 'bar',
      mode: 'production',
    });

    expect(parsed.file).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Path traversal prevention
// ---------------------------------------------------------------------------

describe('KitEnvService - path traversal prevention', () => {
  it('rejects file paths that traverse outside web directory', async () => {
    const service = createKitEnvService(createDeps());

    await expect(service.rawRead('../../../../etc/passwd')).rejects.toThrow(
      'resolves outside the web app directory',
    );
  });

  it('rejects rawWrite with traversal path', async () => {
    const service = createKitEnvService(createDeps());

    await expect(
      service.rawWrite('../../../etc/evil', 'malicious'),
    ).rejects.toThrow('resolves outside the web app directory');
  });

  it('rejects update with traversal file path', async () => {
    const service = createKitEnvService(createDeps());

    await expect(
      service.update({ key: 'FOO', value: 'bar', file: '../../.env' }),
    ).rejects.toThrow('resolves outside the web app directory');
  });

  it('allows valid file names within web directory', async () => {
    const deps = createDeps({
      '/repo/apps/web/.env.local': 'KEY=val',
    });

    const service = createKitEnvService(deps);

    const result = await service.rawRead('.env.local');
    expect(result.exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rawRead / rawWrite
// ---------------------------------------------------------------------------

describe('KitEnvService.rawRead', () => {
  it('returns content when file exists', async () => {
    const service = createKitEnvService(
      createDeps({
        '/repo/apps/web/.env.local': '# My env\nFOO=bar\n',
      }),
    );

    const result = await service.rawRead('.env.local');

    expect(result.exists).toBe(true);
    expect(result.content).toBe('# My env\nFOO=bar\n');
  });

  it('returns empty + exists:false when file missing', async () => {
    const service = createKitEnvService(createDeps({}));

    const result = await service.rawRead('.env.local');

    expect(result.exists).toBe(false);
    expect(result.content).toBe('');
  });
});

describe('KitEnvService.rawWrite', () => {
  it('overwrites file with raw content', async () => {
    const deps = createDeps({
      '/repo/apps/web/.env.local': 'OLD=content',
    });

    const service = createKitEnvService(deps);

    const result = await service.rawWrite('.env.local', '# New\nNEW=value');

    expect(result.success).toBe(true);
    expect(deps._store['/repo/apps/web/.env.local']).toBe('# New\nNEW=value');
  });

  it('creates file when it does not exist', async () => {
    const deps = createDeps({});

    const service = createKitEnvService(deps);

    await service.rawWrite('.env.production', 'PROD_KEY=val');

    expect(deps._store['/repo/apps/web/.env.production']).toBe('PROD_KEY=val');
  });
});

// ---------------------------------------------------------------------------
// read - mode-based file precedence
// ---------------------------------------------------------------------------

describe('KitEnvService.read - file precedence', () => {
  it('returns variables with mode information when pointing to real workspace', async () => {
    // Use the actual monorepo root - will scan real .env files
    const service = createKitEnvService(
      createDeps(
        {},
        { rootPath: process.cwd().replace(/\/packages\/mcp-server$/, '') },
      ),
    );

    const result = await service.read('development');

    expect(result.mode).toBe('development');
    expect(typeof result.variables).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// getAppState / getVariable - injected fs
// ---------------------------------------------------------------------------

describe('KitEnvService - injected fs', () => {
  it('getAppState reads from injected fs', async () => {
    const deps = createDeps(
      {
        '/repo/apps/web/.env': 'FOO=bar\n',
      },
      {
        readdir: async (dirPath: string) => {
          if (dirPath === '/repo/apps') {
            return ['web'];
          }
          return [];
        },
        stat: async (path: string) => ({
          isDirectory: () => path === '/repo/apps/web',
        }),
      },
    );

    const service = createKitEnvService(deps);
    const states = await service.getAppState('development');

    expect(states).toHaveLength(1);
    expect(states[0]!.variables['FOO']!.effectiveValue).toBe('bar');
  });

  it('getVariable reads from injected fs', async () => {
    const deps = createDeps(
      {
        '/repo/apps/web/.env': 'HELLO=world\n',
      },
      {
        readdir: async (dirPath: string) => {
          if (dirPath === '/repo/apps') {
            return ['web'];
          }
          return [];
        },
        stat: async (path: string) => ({
          isDirectory: () => path === '/repo/apps/web',
        }),
      },
    );

    const service = createKitEnvService(deps);
    const value = await service.getVariable('HELLO', 'development');

    expect(value).toBe('world');
  });
});

// ---------------------------------------------------------------------------
// processEnvDefinitions - override chains
// ---------------------------------------------------------------------------

describe('processEnvDefinitions - override chains', () => {
  it('resolves override with development precedence (.env < .env.development < .env.local)', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'https://base.com',
          source: '.env',
        },
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'https://dev.com',
          source: '.env.development',
        },
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'https://local.com',
          source: '.env.local',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');
    const variable = result.variables['NEXT_PUBLIC_SITE_URL'];

    expect(variable).toBeDefined();
    // .env.local has highest precedence in development
    expect(variable!.effectiveValue).toBe('https://local.com');
    expect(variable!.effectiveSource).toBe('.env.local');
    expect(variable!.isOverridden).toBe(true);
    expect(variable!.definitions).toHaveLength(3);
  });

  it('resolves override with production precedence (.env < .env.production < .env.local < .env.production.local)', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'https://base.com',
          source: '.env',
        },
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'https://prod.com',
          source: '.env.production',
        },
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'https://local.com',
          source: '.env.local',
        },
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'https://prod-local.com',
          source: '.env.production.local',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'production');
    const variable = result.variables['NEXT_PUBLIC_SITE_URL'];

    expect(variable!.effectiveValue).toBe('https://prod-local.com');
    expect(variable!.effectiveSource).toBe('.env.production.local');
    expect(variable!.isOverridden).toBe(true);
  });

  it('marks single-source variable as NOT overridden', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'https://site.com',
          source: '.env',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');
    const variable = result.variables['NEXT_PUBLIC_SITE_URL'];

    expect(variable!.isOverridden).toBe(false);
    expect(variable!.effectiveSource).toBe('.env');
  });
});

// ---------------------------------------------------------------------------
// processEnvDefinitions - conditional requirements (Stripe keys)
// ---------------------------------------------------------------------------

describe('processEnvDefinitions - conditional requirements', () => {
  it('flags STRIPE_SECRET_KEY as invalid when billing provider is stripe and key is missing', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_BILLING_PROVIDER',
          value: 'stripe',
          source: '.env',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');

    const stripeKey = result.variables['STRIPE_SECRET_KEY'];
    expect(stripeKey).toBeDefined();
    expect(stripeKey!.effectiveSource).toBe('MISSING');
    expect(stripeKey!.validation.success).toBe(false);
    expect(stripeKey!.validation.error.issues.length).toBeGreaterThan(0);

    // Regression guard: contextual message must be preserved, NOT replaced
    // by generic "required but missing"
    expect(
      stripeKey!.validation.error.issues.some((i) =>
        i.includes('NEXT_PUBLIC_BILLING_PROVIDER'),
      ),
    ).toBe(true);
  });

  it('does NOT flag STRIPE_SECRET_KEY when billing provider is lemon-squeezy', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_BILLING_PROVIDER',
          value: 'lemon-squeezy',
          source: '.env',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');

    const stripeKey = result.variables['STRIPE_SECRET_KEY'];
    expect(stripeKey).toBeUndefined();
  });

  it('flags LEMON_SQUEEZY_SECRET_KEY as invalid when provider is lemon-squeezy and key is missing', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_BILLING_PROVIDER',
          value: 'lemon-squeezy',
          source: '.env',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');

    const lsKey = result.variables['LEMON_SQUEEZY_SECRET_KEY'];
    expect(lsKey).toBeDefined();
    expect(lsKey!.effectiveSource).toBe('MISSING');
    expect(lsKey!.validation.success).toBe(false);
  });

  it('validates Stripe key format (must start with sk_ or rk_)', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_BILLING_PROVIDER',
          value: 'stripe',
          source: '.env',
        },
        {
          key: 'STRIPE_SECRET_KEY',
          value: 'invalid_key_123',
          source: '.env.local',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');
    const stripeKey = result.variables['STRIPE_SECRET_KEY'];

    expect(stripeKey).toBeDefined();
    expect(stripeKey!.validation.success).toBe(false);
    expect(
      stripeKey!.validation.error.issues.some(
        (i) =>
          i.toLowerCase().includes('sk_') || i.toLowerCase().includes('rk_'),
      ),
    ).toBe(true);
  });

  it('passes Stripe key validation when key format is correct', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_BILLING_PROVIDER',
          value: 'stripe',
          source: '.env',
        },
        {
          key: 'STRIPE_SECRET_KEY',
          value: 'sk_test_abc123',
          source: '.env.local',
        },
        {
          key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
          value: 'pk_test_abc123',
          source: '.env',
        },
        {
          key: 'STRIPE_WEBHOOK_SECRET',
          value: 'whsec_abc123',
          source: '.env.local',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');
    const stripeKey = result.variables['STRIPE_SECRET_KEY'];

    expect(stripeKey!.validation.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// processEnvDefinitions - cross-variable validations
// ---------------------------------------------------------------------------

describe('processEnvDefinitions - cross-variable validations', () => {
  it('flags SUPABASE_SERVICE_ROLE_KEY when same as ANON_KEY', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_SUPABASE_URL',
          value: 'http://localhost:54321',
          source: '.env',
        },
        {
          key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
          value: 'same-key',
          source: '.env',
        },
        {
          key: 'SUPABASE_SERVICE_ROLE_KEY',
          value: 'same-key',
          source: '.env.local',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');
    const serviceKey = result.variables['SUPABASE_SERVICE_ROLE_KEY'];

    expect(serviceKey).toBeDefined();
    expect(serviceKey!.validation.success).toBe(false);
    expect(
      serviceKey!.validation.error.issues.some((i) =>
        i.toLowerCase().includes('different'),
      ),
    ).toBe(true);
  });

  it('passes when SUPABASE_SERVICE_ROLE_KEY differs from ANON_KEY', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_SUPABASE_URL',
          value: 'http://localhost:54321',
          source: '.env',
        },
        {
          key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
          value: 'anon-key-123',
          source: '.env',
        },
        {
          key: 'SUPABASE_SERVICE_ROLE_KEY',
          value: 'service-key-456',
          source: '.env.local',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');
    const serviceKey = result.variables['SUPABASE_SERVICE_ROLE_KEY'];

    expect(serviceKey!.validation.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// processEnvDefinitions - mode-aware URL validation
// ---------------------------------------------------------------------------

describe('processEnvDefinitions - mode-aware validations', () => {
  it('accepts http:// SITE_URL in development mode', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'http://localhost:3000',
          source: '.env',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');
    const siteUrl = result.variables['NEXT_PUBLIC_SITE_URL'];

    expect(siteUrl!.validation.success).toBe(true);
  });

  it('rejects http:// SITE_URL in production mode', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'http://example.com',
          source: '.env',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'production');
    const siteUrl = result.variables['NEXT_PUBLIC_SITE_URL'];

    expect(siteUrl!.validation.success).toBe(false);
    expect(
      siteUrl!.validation.error.issues.some((i) =>
        i.toLowerCase().includes('https'),
      ),
    ).toBe(true);
  });

  it('accepts https:// SITE_URL in production mode', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_SITE_URL',
          value: 'https://example.com',
          source: '.env',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'production');
    const siteUrl = result.variables['NEXT_PUBLIC_SITE_URL'];

    expect(siteUrl!.validation.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// processEnvDefinitions - missing required variables
// ---------------------------------------------------------------------------

describe('processEnvDefinitions - missing required variables', () => {
  it('injects missing required variables with MISSING source', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_BILLING_PROVIDER',
          value: 'stripe',
          source: '.env',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');

    // NEXT_PUBLIC_SITE_URL is required and missing
    const siteUrl = result.variables['NEXT_PUBLIC_SITE_URL'];
    expect(siteUrl).toBeDefined();
    expect(siteUrl!.effectiveSource).toBe('MISSING');
    expect(siteUrl!.validation.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// processEnvDefinitions - CAPTCHA conditional dependency
// ---------------------------------------------------------------------------

describe('processEnvDefinitions - CAPTCHA conditional dependency', () => {
  it('flags CAPTCHA_SECRET_TOKEN as required when CAPTCHA_SITE_KEY is set', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [
        {
          key: 'NEXT_PUBLIC_CAPTCHA_SITE_KEY',
          value: 'cap_site_123',
          source: '.env',
        },
      ],
    };

    const result = processEnvDefinitions(envInfo, 'development');
    const captchaSecret = result.variables['CAPTCHA_SECRET_TOKEN'];

    expect(captchaSecret).toBeDefined();
    expect(captchaSecret!.effectiveSource).toBe('MISSING');
    expect(captchaSecret!.validation.success).toBe(false);
  });

  it('does NOT flag CAPTCHA_SECRET_TOKEN when CAPTCHA_SITE_KEY is empty/absent', () => {
    const envInfo = {
      appName: 'web',
      filePath: '/repo/apps/web',
      variables: [],
    };

    const result = processEnvDefinitions(envInfo, 'development');

    const captchaSecret = result.variables['CAPTCHA_SECRET_TOKEN'];
    expect(captchaSecret).toBeUndefined();
  });
});
