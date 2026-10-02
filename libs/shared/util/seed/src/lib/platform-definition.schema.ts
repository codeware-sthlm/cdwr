import type {
  PlatformLabel,
  Tenant,
  TenantRole,
  User
} from '@codeware/shared/util/payload-types';
import { z } from 'zod';

import { BUNDLED_STOCK_MEDIA } from './bundled-media';

/**
 * What TypeScript cannot check about the platform definition: that the
 * identity it carries is internally consistent — no two tenants share a slug
 * or an api key, no two users share an email, no two labels share a type and
 * name — and that every reference inside it resolves to something the same
 * definition states. Block-shaped validation has no place here; the platform
 * definition states no content.
 */

/**
 * An enum schema that must list every value of `T`, so a value added to the
 * Payload type fails to compile here until the schema states it.
 */
const enumOf =
  <T extends string>() =>
  <S extends z.ZodType<T>>(
    schema: S & ([T] extends [z.output<S>] ? unknown : never)
  ): S =>
    schema;

const LocaleSchema = enumOf<Tenant['supportedLocales'][number]>()(
  z.enum(['en', 'sv'])
);
const TenantRoleSchema = enumOf<TenantRole>()(
  z.enum(['reader', 'user', 'admin'])
);

const LabelSchema = z.object({
  type: enumOf<PlatformLabel['type']>()(
    z.enum(['place-kind', 'stock-subject'])
  ),
  name: z.string().min(1),
  icon: z.string().min(1),
  description: z.string().optional()
});

const LocalizedTextSchema = z.object({ en: z.string(), sv: z.string() });

const FaqSchema = z.object({
  question: LocalizedTextSchema,
  answer: LocalizedTextSchema
});

const StockMediaSchema = z.object({
  // Unlike site media, a stock image has no `filePath` escape hatch — it is
  // always one of the platform's own bundled files
  filename: z.enum(BUNDLED_STOCK_MEDIA),
  alt: z.string().min(1),
  subject: z.string().optional(),
  credit: z.string().optional(),
  licence: z.string().optional()
});

const TenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  apiKey: z.string().min(1),
  deployment: z.string().optional(),
  description: z.string().min(1),
  locale: LocaleSchema,
  supportedLocales: z.array(LocaleSchema).min(1)
});

const UserSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  email: z.string().min(1),
  role: enumOf<User['role']>()(z.enum(['system-user', 'user'])),
  locale: LocaleSchema,
  tenants: z.array(
    z.object({
      lookupSlug: z.string().min(1),
      role: TenantRoleSchema,
      componentDeveloper: z.boolean().optional()
    })
  )
});

export const PlatformDefinitionSchema = z
  .object({
    labels: z.array(LabelSchema),
    stockMedia: z.array(StockMediaSchema),
    faq: z.array(FaqSchema),
    tenants: z.array(TenantSchema),
    users: z.array(UserSchema)
  })
  .superRefine((definition, ctx) => {
    const problem = (message: string, path: Array<string | number> = []) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

    duplicates(definition.tenants.map(({ slug }) => slug)).forEach((slug) =>
      problem(`Two tenants share the slug '${slug}'`, ['tenants'])
    );
    duplicates(definition.tenants.map(({ apiKey }) => apiKey)).forEach(
      (apiKey) =>
        problem(`Two tenants share the api key '${apiKey}'`, ['tenants'])
    );
    duplicates(definition.users.map(({ email }) => email)).forEach((email) =>
      problem(`Two users share the email '${email}'`, ['users'])
    );
    duplicates(
      definition.labels.map(({ type, name }) => `${type}:${name}`)
    ).forEach((key) =>
      problem(`Two labels share the type and name '${key}'`, ['labels'])
    );
    duplicates(definition.stockMedia.map(({ filename }) => filename)).forEach(
      (filename) =>
        problem(`Two stock media entries share the filename '${filename}'`, [
          'stockMedia'
        ])
    );

    // A membership names a tenant the same way navigation names a page: by
    // something this same definition also states
    const tenantSlugs = new Set(definition.tenants.map(({ slug }) => slug));
    definition.users.forEach((user, userIndex) => {
      user.tenants.forEach(({ lookupSlug }, tenantIndex) => {
        if (!tenantSlugs.has(lookupSlug)) {
          problem(`No tenant '${lookupSlug}' in this definition`, [
            'users',
            userIndex,
            'tenants',
            tenantIndex
          ]);
        }
      });
    });

    // A stock image's subject names a label the apply can hand it off to —
    // unresolved, the image would upload with nothing to file it under
    const stockSubjects = new Set(
      definition.labels
        .filter(({ type }) => type === 'stock-subject')
        .map(({ name }) => name)
    );
    definition.stockMedia.forEach(({ subject }, index) => {
      if (subject && !stockSubjects.has(subject)) {
        problem(`No stock-subject label '${subject}' in this definition`, [
          'stockMedia',
          index,
          'subject'
        ]);
      }
    });
  });

const duplicates = (values: Array<string>): Array<string> => [
  ...new Set(values.filter((value, index) => values.indexOf(value) !== index))
];
