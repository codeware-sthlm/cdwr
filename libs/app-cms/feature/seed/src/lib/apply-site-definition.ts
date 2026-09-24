import { convertMarkdownToLexical } from '@codeware/app-cms/util/content-templates';
import type { Page, Post, Tenant } from '@codeware/shared/util/payload-types';
import { bundledMediaPath } from '@codeware/shared/util/seed';
import { SiteDefinitionSchema } from '@codeware/shared/util/seed';
import type { BundledMediaFile } from '@codeware/shared/util/seed';
import type { SiteDefinition } from '@codeware/shared/util/seed';
import type { Payload, TypedLocale } from 'payload';

import { type ExtraDocument, findExtraDocuments } from './find-extra-documents';
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
import { resolveRichText } from './resolve-rich-text';

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
  /**
   * What the tenant holds that the definition does not name.
   *
   * Reported, never acted on: applying fills gaps, so this is the only way to
   * see content drifting away from its definition.
   */
  extra: Array<ExtraDocument>;
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
  /**
   * Where bundled media is served from, when it is not on disk.
   *
   * A deployed seed has no repository files, so it passes `SEED_DATA_URL`
   * here and every bundled filename resolves to a URL instead.
   */
  mediaBaseUrl?: string;
};

/**
 * Turns the emails a post names into user ids.
 *
 * Users belong to the workspace rather than to the site, so a definition never
 * states them — these resolve against whoever is already there. An email that
 * matches nobody is reported like any other reference that leads nowhere,
 * rather than quietly publishing a post with no author.
 */
async function resolveAuthors(
  payload: Payload,
  authors: Array<{ lookupEmail: string }> | undefined,
  options: {
    transactionID: string | number | undefined;
    unresolved: Array<UnresolvedReference>;
  }
): Promise<Array<number>> {
  const { transactionID, unresolved } = options;
  const resolved: Array<number> = [];

  for (const { lookupEmail } of authors ?? []) {
    const { docs } = await payload.find({
      collection: 'users',
      where: { email: { equals: lookupEmail } },
      depth: 0,
      limit: 1,
      req: { transactionID }
    });

    const user = docs[0];

    if (!user) {
      unresolved.push({
        blockType: 'post',
        field: 'authors',
        lookup: lookupEmail
      });
      continue;
    }

    resolved.push(user.id);
  }

  return resolved;
}

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
  const { tenantSlug, dryRun = true, locale = 'en', mediaBaseUrl } = options;

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
  const categories = new Map<string, number>();
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

  const transactionID = await payload.db.beginTransaction();

  // Everything here leans on the rollback. Without a transaction a dry run
  // would write for real and still report itself rolled back, which is a worse
  // outcome than refusing to run
  if (transactionID === null || transactionID === undefined) {
    throw new Error(
      'The database adapter started no transaction, so a dry run could not be rolled back. Refusing to apply.'
    );
  }

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
      categories.set(
        category.slug,
        record(
          'categories',
          category.slug,
          await ensureCategory(payload, { ...category, tenant: tenant.id }, ctx)
        )
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
              external: item.external ?? false,
              filename: item.filename,
              filePath:
                item.filePath ??
                bundledMediaPath(
                  item.filename as BundledMediaFile,
                  mediaBaseUrl
                ),
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
      const layout = await Promise.all(
        page.layout.map(async (block) =>
          resolveRichText(
            payload,
            resolveBlockReferences(block, resolver, unresolved)
          )
        )
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
              authors: await resolveAuthors(payload, post.authors, {
                transactionID,
                unresolved
              }),
              categories: (post.categories ?? []).flatMap(({ lookupSlug }) => {
                const id = categories.get(lookupSlug);
                if (id === undefined) {
                  unresolved.push({
                    blockType: 'post',
                    field: 'categories',
                    lookup: lookupSlug
                  });
                  return [];
                }
                return [id];
              }),
              // Markdown, like a page's body. The cast that used to stand
              // here put the raw string where Payload expects Lexical
              content: (await convertMarkdownToLexical(
                payload.config,
                post.content
              )) as unknown as Post['content'],
              // A stated date keeps the listing order stable between applies
              createdAt: post.createdAt ?? new Date().toISOString(),
              heroImage: post.heroImage
                ? (media.get(post.heroImage.lookupFilename) ?? null)
                : undefined,
              slug: post.slug,
              tenant: tenant.id,
              title: post.title,
              visibility: post.visibility
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
      const { general, legal, ...rest } = definition.siteSettings;

      // These name a page the same way everything else does, so they have to
      // be resolved the same way. Spreading them through put the reference
      // object itself into the database
      const page = (ref: { lookupSlug: string } | undefined, field: string) => {
        if (!ref) {
          return undefined;
        }
        const id = pages.get(ref.lookupSlug);
        if (id === undefined) {
          unresolved.push({
            blockType: 'site-settings',
            field,
            lookup: ref.lookupSlug
          });
          return undefined;
        }
        return id;
      };

      record(
        'site-settings',
        tenantSlug,
        await ensureSiteSetting(
          payload,
          {
            ...rest,
            // Always present: `ensureSiteSetting` reads through it when
            // filling in what a document is missing
            general: {
              ...general,
              landingPage: page(general?.landingPage, 'landingPage')
            },
            ...(legal && {
              legal: {
                privacyPage: page(legal.privacyPage, 'privacyPage'),
                termsPage: page(legal.termsPage, 'termsPage')
              }
            }),
            tenant: tenant.id
          } as unknown as Parameters<typeof ensureSiteSetting>[1],
          ctx
        )
      );
    }

    // Read inside the transaction, so documents this run just created are not
    // reported as extra — the definition names them by construction
    const extra = await findExtraDocuments(payload, definition, tenant.id, {
      transactionID
    });

    // A reference that led nowhere is a page shipping without its image. Refuse
    // the whole apply rather than commit a site that is quietly incomplete
    const keep = !dryRun && unresolved.length === 0;

    await (keep
      ? payload.db.commitTransaction(transactionID)
      : payload.db.rollbackTransaction(transactionID));

    return {
      tenant: { slug: tenantSlug, id: tenant.id },
      dryRun: !keep,
      outcomes,
      unresolved,
      extra
    };
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);
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
