import { z } from 'zod';

// TODO: import roles
const TenantLookupSchema = z.object({
  lookupApiKey: z.string(),
  role: z.enum(['admin', 'user', 'reader'])
});

const LocalizedTextSchema = z.object({
  en: z.string(),
  sv: z.string()
});

// TODO: define more schemas for other data types to reuse
export const SeedDataSchema = z.object({
  faq: z.array(
    z.object({
      question: LocalizedTextSchema,
      answer: LocalizedTextSchema
    })
  ),
  stockMedia: z.array(
    z.object({
      alt: z.string(),
      subject: z.string().optional(),
      credit: z.string().optional(),
      licence: z.string().optional(),
      filename: z.string(),
      filePath: z.string()
    })
  ),
  users: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      email: z.string(),
      password: z.string(),
      role: z.enum(['system-user', 'user']),
      tenants: z.array(TenantLookupSchema),
      /** User preferred language */
      locale: z.enum(['en', 'sv'])
    })
  ),
  tenants: z.array(
    z.object({
      name: z.string(),
      slug: z.string(),
      /** The Infisical folder and Fly app suffix, when the tenant is deployed */
      deployment: z.string().optional(),
      description: z.string(),
      /** Seed data locale */
      locale: z.enum(['en', 'sv']),
      supportedLocales: z.array(z.enum(['en', 'sv'])),
      apiKey: z.string()
    })
  )
});

/**
 * Lookup tenant should be unique.
 */
export type TenantLookup = z.infer<typeof TenantLookupSchema>;

/**
 * Seed data.
 */
export type SeedData = z.infer<typeof SeedDataSchema>;
