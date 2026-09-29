import * as z from 'zod';

export const ConnectVillaSiteSchema = z.object({
  accountId: z.string().uuid(),
  /** Display name in Ooruda; defaults to the site's property name. */
  name: z.string().trim().max(120).optional(),
  /** Supabase project URL of the villa-booking site, e.g. https://xyz.supabase.co */
  siteUrl: z
    .string()
    .trim()
    .url({ message: 'Enter the booking site database URL' })
    .refine(
      (v) => {
        const url = new URL(v);
        const local = ['127.0.0.1', 'localhost', '[::1]'].includes(
          url.hostname,
        );
        // Plain http only for a local development database.
        return url.protocol === 'https:' || (local && url.protocol === 'http:');
      },
      { message: 'The URL must start with https://' },
    ),
  /** That project's service-role key. Stored in Vault; never shown again. */
  serviceKey: z
    .string()
    .trim()
    .min(20, { message: 'This does not look like a service key' }),
  /** properties.slug on the site, e.g. villa-19 */
  siteSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message: 'Use the property slug, e.g. villa-19',
    }),
});

export type ConnectVillaSiteSchemaType = z.output<
  typeof ConnectVillaSiteSchema
>;

export const DisconnectVillaSiteSchema = z.object({
  accountId: z.string().uuid(),
  propertyId: z.string().uuid(),
});
