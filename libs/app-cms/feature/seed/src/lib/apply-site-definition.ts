import type { Page, Post, Tenant } from '@codeware/shared/util/payload-types';
import { SiteDefinitionSchema } from '@codeware/shared/util/seed';
import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload, TypedLocale } from 'payload';

import { ensureCategory } from './local-api/ensure-category';
import { ensureForm } from './local-api/ensure-form';
import { ensureMedia } from './local-api/ensure-media';
import { ensureNavigation } from './local-api/ensure-navigation';
import { ensurePage } from './local-api/ensure-page';
import { ensurePost } from './local-api/ensure-post';
import { ensureSiteSetting } from './local-api/ensure-site-setting';
import { ensureTag } from './local-api/ensure-tag';
import {
  type UnresolvedReference,
  resolveBlockReferences
} from './resolve-block-references';

/** What became of one document. */
export type ApplyOutcome = {
  collection: string;
  /** The slug, filename or title the definition named it by */
  identifier: string;
  action: 'created' | 'existed';
};

export type ApplyReport = {
  tenant: { slug: string; id: number };
  /** True when the transaction was rolled back instead of committed */
  dryRun: boolean;
  outcomes: Array<ApplyOutcome>;
  /** References that led nowhere. Non-empty means nothing was committed */
  unresolved: Array<UnresolvedReference>;
};

export type ApplyOptions = {
  /** The tenant to apply to. It must already exist */
  tenantSlug: string;
  /**
   * Roll the transaction back instead of committing it.
   *
   * This is what makes a dry run exact rather than a guess: Payload validates
   * every field, relationship and required value on the way in, and then none
   * of it is kept. Defaults to true, so forgetting the flag changes nothing.
   */
  dryRun?: boolean;
  locale?: TypedLocale;
};

/**
 * Applies a site definition to a tenant that already exists.
 *
 * Deliberately not `seed()`. Seeding is bulk, unattended and creates its own
 * tenants from fixtures that carry api keys; this is a reviewed write to one
 * real workspace from a definition that carries no identity at all.
 *
 * Nothing is deleted. A definition states what should exist, not that nothing
 * else may — so a page it stops mentioning stays, and taking content down
 * remains a deliberate act.
 *
 * @param payload - Payload instance
 * @param definition - The site, as data
 * @param options - Which tenant, and whether to keep the result
 * @returns What was created, what already existed, and what did not resolve
 * @throws If the definition is invalid or the tenant does not exist
 */
export async function applySiteDefinition(
  payload: Payload,
  definition: SiteDefinition,
  options: ApplyOptions
): Promise<ApplyReport> {
  const { tenantSlug, dryRun = true, locale = 'en' } = options;

  const parsed = SiteDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    throw new Error(
      `Site definition '${definition?.name ?? '(unnamed)'}' is not valid:\n` +
        parsed.error.issues
          .map(
            ({ path, message }) => `  ${path.join('.') || '(root)'}: ${message}`
          )
          .join('\n')
    );
  }

  const tenant = await findTenant(payload, tenantSlug);

  const outcomes: Array<ApplyOutcome> = [];
  const unresolved: Array<UnresolvedReference> = [];

  // Ids of what this run created, so later documents can point at them. Local
  // rather than the seed's store, which keys everything by a tenant api key —
  // the one thing a definition never carries
  const tags = new Map<string, number>();
  const media = new Map<string, number>();
  const forms = new Map<string, number>();
  const pages = new Map<string, number>();
  const posts = new Map<string, number>();

  const idOf = (result: { id: number } | number) =>
    typeof result === 'number' ? result : result.id;

  const record = (
    collection: string,
    identifier: string,
    result: { id: number } | number
  ) => {
    outcomes.push({
      collection,
      identifier,
      // Every ensure helper returns the document when it created one, and a
      // bare id when it found one already there
      action: typeof result === 'number' ? 'existed' : 'created'
    });
    return idOf(result);
  };

  const transactionID = (await payload.db.beginTransaction()) ?? undefined;
  const ctx = { locale, transactionID };

  try {
    for (const tag of definition.tags ?? []) {
      tags.set(
        tag.slug,
        record(
          'tags',
          tag.slug,
          await ensureTag(payload, { ...tag, tenant: tenant.id }, ctx)
        )
      );
    }

    for (const category of definition.categories ?? []) {
      record(
        'categories',
        category.slug,
        await ensureCategory(payload, { ...category, tenant: tenant.id }, ctx)
      );
    }

    for (const item of definition.media ?? []) {
      media.set(
        item.filename,
        record(
          'media',
          item.filename,
          await ensureMedia(
            payload,
            {
              alt: item.alt,
              external: false,
              filename: item.filename,
              filePath: item.filePath,
              tags: (item.tags ?? []).flatMap(({ lookupSlug }) => {
                const id = tags.get(lookupSlug);
                if (id === undefined) {
                  unresolved.push({
                    blockType: 'media',
                    field: 'tags',
                    lookup: lookupSlug
                  });
                  return [];
                }
                return [id];
              }),
              tenant: tenant.id
            },
            ctx
          )
        )
      );
    }

    for (const form of definition.forms ?? []) {
      forms.set(
        form.title,
        record(
          'forms',
          form.title,
          await ensureForm(payload, { ...form, tenant: tenant.id }, ctx)
        )
      );
    }

    const resolver = {
      media: (filename: string) => media.get(filename),
      tag: (slug: string) => tags.get(slug),
      form: (title: string) => forms.get(title),
      // Not stated by a definition yet; reported rather than silently dropped
      reusableContent: () => undefined
    };

    for (const page of definition.pages) {
      const layout = page.layout.map((block) =>
        resolveBlockReferences(block, resolver, unresolved)
      );

      pages.set(
        page.slug,
        record(
          'pages',
          page.slug,
          await ensurePage(
            payload,
            {
              header: page.header,
              // Payload validates the blocks on the way in, inside this
              // transaction — which is what makes a dry run exact
              layout: layout as unknown as Page['layout'],
              name: page.name,
              slug: page.slug,
              tenant: tenant.id,
              visibility: page.visibility ?? 'public'
            },
            ctx
          )
        )
      );
    }

    for (const post of definition.posts ?? []) {
      posts.set(
        post.slug,
        record(
          'posts',
          post.slug,
          await ensurePost(
            payload,
            {
              authors: [],
              categories: [],
              content: post.content as unknown as Post['content'],
              createdAt: new Date().toISOString(),
              slug: post.slug,
              tenant: tenant.id,
              title: post.title
            },
            ctx
          )
        )
      );
    }

    if (definition.navigation?.length) {
      const items = definition.navigation.flatMap(({ reference, label }) => {
        const known = reference.relationTo === 'pages' ? pages : posts;
        const value = known.get(reference.lookupSlug);

        if (value === undefined) {
          unresolved.push({
            blockType: 'navigation',
            field: reference.relationTo,
            lookup: reference.lookupSlug
          });
          return [];
        }

        return [
          {
            reference: { relationTo: reference.relationTo, value },
            labelSource: label ? ('custom' as const) : ('document' as const),
            customLabel: label ?? null
          }
        ];
      });

      const { navigation } = await ensureNavigation(
        payload,
        { items, tenant: tenant.id },
        ctx
      );
      record('navigation', tenantSlug, navigation);
    }

    if (definition.siteSettings) {
      record(
        'site-settings',
        tenantSlug,
        await ensureSiteSetting(
          payload,
          {
            ...definition.siteSettings,
            tenant: tenant.id
          } as unknown as Parameters<typeof ensureSiteSetting>[1],
          ctx
        )
      );
    }

    // A reference that led nowhere is a page shipping without its image. Refuse
    // the whole apply rather than commit a site that is quietly incomplete
    const keep = !dryRun && unresolved.length === 0;

    if (transactionID) {
      await (keep
        ? payload.db.commitTransaction(transactionID)
        : payload.db.rollbackTransaction(transactionID));
    }

    return {
      tenant: { slug: tenantSlug, id: tenant.id },
      dryRun: !keep,
      outcomes,
      unresolved
    };
  } catch (error) {
    if (transactionID) {
      await payload.db.rollbackTransaction(transactionID);
    }
    throw error;
  }
}

/** The tenant a definition is applied to. It is never created here. */
async function findTenant(
  payload: Payload,
  slug: string
): Promise<Pick<Tenant, 'id'>> {
  const { docs } = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 2
  });

  if (docs.length === 0) {
    throw new Error(
      `No tenant with slug '${slug}'. A definition is applied to a workspace that already exists — create it first.`
    );
  }
  if (docs.length > 1) {
    throw new Error(`More than one tenant has the slug '${slug}'`);
  }

  return docs[0];
}
