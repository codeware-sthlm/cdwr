import { z } from 'zod';

import { BUNDLED_MEDIA } from './bundled-media';

/**
 * What TypeScript cannot check about a definition.
 *
 * The block shapes are already checked by the compiler against Payload's own
 * generated types, and re-describing twenty blocks here would duplicate them
 * and then drift. This validates the two things the compiler has no opinion on:
 * that a definition carries **no identity**, and that every reference in it
 * **resolves** to something the same definition states.
 *
 * Block internals are not validated here. The apply runs inside a transaction
 * and rolls back, so Payload itself judges every field — a stricter check than
 * a second copy of the schema would be, and one that cannot drift.
 */

/** Keys that would carry a tenant's identity, or a secret, into a definition. */
const FORBIDDEN_KEYS = [
  'apiKey',
  'lookupApiKey',
  'tenant',
  'tenants',
  'password',
  'users'
];

/** Everything a definition may state at the top level. */
const KNOWN_KEYS = [
  'name',
  'description',
  'tags',
  'categories',
  'media',
  'forms',
  'pages',
  'posts',
  'navigation',
  'siteSettings'
];

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const Slug = z.string().regex(slugPattern, 'Expected a lowercase-dashed slug');

const SlugRefSchema = z.object({ lookupSlug: Slug });

/** A block, judged only on being a block. Payload judges the rest. */
const BlockSchema = z.object({ blockType: z.string().min(1) }).passthrough();

const NamedSlug = z.object({ name: z.string().min(1), slug: Slug });

export const SiteDefinitionSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(NamedSlug).optional(),
    categories: z.array(NamedSlug).optional(),
    media: z
      .array(
        z
          .object({
            filename: z.string().min(1),
            alt: z.string(),
            filePath: z.string().min(1).optional(),
            tags: z.array(SlugRefSchema).optional()
          })
          // One or the other, never neither: a media entry that names no source
          // uploads nothing and leaves every block pointing at it empty
          // Without a path the file has to be one that ships with the seed,
          // or nothing is uploaded and every block pointing at it renders empty
          .refine(
            ({ filename, filePath }) =>
              !!filePath ||
              (BUNDLED_MEDIA as ReadonlyArray<string>).includes(filename),
            {
              message:
                'needs a filePath, or a filename that ships with the seed'
            }
          )
      )
      .optional(),
    forms: z
      .array(z.object({ title: z.string().min(1) }).passthrough())
      .optional(),
    pages: z.array(
      z
        .object({
          name: z.string().min(1),
          slug: Slug,
          layout: z.array(BlockSchema)
        })
        .passthrough()
    ),
    posts: z
      .array(
        z
          .object({
            title: z.string().min(1),
            slug: Slug,
            content: z.string()
          })
          .passthrough()
      )
      .optional(),
    navigation: z
      .array(
        z.object({
          reference: z.object({
            relationTo: z.enum(['pages', 'posts']),
            lookupSlug: Slug
          }),
          label: z.string().optional()
        })
      )
      .optional(),
    siteSettings: z.record(z.unknown()).optional()
  })
  // Unknown keys are kept rather than stripped, so the identity guard below can
  // see them. Stripping first would let a top-level `apiKey` pass by vanishing
  .passthrough()
  .superRefine((definition, ctx) => {
    const problem = (message: string, path: Array<string | number> = []) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

    // A definition lives in version control and may be generated. Neither is a
    // place for a tenant's api key
    for (const [path, key] of forbiddenKeysIn(definition)) {
      problem(
        `'${key}' does not belong in a site definition — a definition carries no identity, and the tenant is named when it is applied`,
        path
      );
    }

    // Kept keys are not accepted keys: a typo should be told about, not stored
    for (const key of Object.keys(definition)) {
      if (!KNOWN_KEYS.includes(key) && !FORBIDDEN_KEYS.includes(key)) {
        problem(`'${key}' is not part of a site definition`, [key]);
      }
    }

    duplicates(definition.pages.map(({ slug }) => slug)).forEach((slug) =>
      problem(`Two pages share the slug '${slug}'`, ['pages'])
    );
    duplicates((definition.posts ?? []).map(({ slug }) => slug)).forEach(
      (slug) => problem(`Two posts share the slug '${slug}'`, ['posts'])
    );
    duplicates(
      (definition.media ?? []).map(({ filename }) => filename)
    ).forEach((filename) =>
      problem(`Two media entries share the filename '${filename}'`, ['media'])
    );

    // Every reference has to land on something this definition also states, or
    // the apply resolves it to nothing and drops it silently — which is how a
    // page ships without its image
    const pageSlugs = new Set(definition.pages.map(({ slug }) => slug));
    const postSlugs = new Set((definition.posts ?? []).map(({ slug }) => slug));
    const filenames = new Set(
      (definition.media ?? []).map(({ filename }) => filename)
    );
    const tagSlugs = new Set((definition.tags ?? []).map(({ slug }) => slug));
    const categorySlugs = new Set(
      (definition.categories ?? []).map(({ slug }) => slug)
    );
    const formTitles = new Set(
      (definition.forms ?? []).map(({ title }) => title)
    );

    (definition.navigation ?? []).forEach(({ reference }, index) => {
      const known = reference.relationTo === 'pages' ? pageSlugs : postSlugs;
      if (!known.has(reference.lookupSlug)) {
        problem(
          `Navigation points at ${reference.relationTo} '${reference.lookupSlug}', which this definition does not state`,
          ['navigation', index]
        );
      }
    });

    for (const [path, ref] of referencesIn(definition)) {
      const filename = ref['lookupFilename'];
      if (filename !== undefined && !filenames.has(filename)) {
        problem(`No media named '${filename}' in this definition`, path);
      }

      const title = ref['lookupTitle'];
      if (title !== undefined && !formTitles.has(title)) {
        problem(`No form named '${title}' in this definition`, path);
      }

      // `lookupSlug` is worn by tags, categories and reusable content alike, so
      // the field it sits on is what says which. Reusable content is the one a
      // definition cannot state — it resolves against the tenant, so it is left
      // to the apply to report
      const slug = ref['lookupSlug'];
      const field = path[path.length - 1];
      if (slug !== undefined) {
        if (field === 'tags' && !tagSlugs.has(slug)) {
          problem(`No tag '${slug}' in this definition`, path);
        }
        if (field === 'categories' && !categorySlugs.has(slug)) {
          problem(`No category '${slug}' in this definition`, path);
        }
      }
    }

    // A link that points at a document by id carries exactly the identity a
    // definition is not allowed to carry — and the id may not even be this
    // tenant's. Nothing resolves these, so they would reach the database as-is
    for (const path of documentIdLinksIn(definition)) {
      problem(
        "A link cannot point at a document by id. Use type: 'custom' with a url, or state the page and link to its slug",
        path
      );
    }

    (definition.media ?? []).forEach((item, index) => {
      (item.tags ?? []).forEach(({ lookupSlug }, tagIndex) => {
        if (!tagSlugs.has(lookupSlug)) {
          problem(`No tag '${lookupSlug}' in this definition`, [
            'media',
            index,
            'tags',
            tagIndex
          ]);
        }
      });
    });
  });

export type ValidatedSiteDefinition = z.infer<typeof SiteDefinitionSchema>;

const duplicates = (values: Array<string>): Array<string> => [
  ...new Set(values.filter((value, index) => values.indexOf(value) !== index))
];

/** Walks the definition for keys that would carry identity into it. */
function* forbiddenKeysIn(
  value: unknown,
  path: Array<string | number> = []
): Generator<[Array<string | number>, string]> {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* forbiddenKeysIn(item, [...path, index]);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      yield [[...path, key], key];
    }
    yield* forbiddenKeysIn(child, [...path, key]);
  }
}

/**
 * Walks for a link stated as `{ relationTo, value }` — Payload's shape for
 * pointing at a document by id.
 *
 * Navigation's own references carry `relationTo` with a `lookupSlug` instead,
 * so both keys are required before anything is reported.
 */
function* documentIdLinksIn(
  value: unknown,
  path: Array<string | number> = []
): Generator<Array<string | number>> {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* documentIdLinksIn(item, [...path, index]);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  if ('relationTo' in value && 'value' in value) {
    yield path;
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    yield* documentIdLinksIn(child, [...path, key]);
  }
}

/** Walks the definition for `lookup*` reference objects. */
function* referencesIn(
  value: unknown,
  path: Array<string | number> = []
): Generator<[Array<string | number>, Record<string, string>]> {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* referencesIn(item, [...path, index]);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0].startsWith('lookup')) {
    yield [path, value as Record<string, string>];
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    yield* referencesIn(child, [...path, key]);
  }
}
