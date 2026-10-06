import { convertMarkdownToLexical } from '@codeware/app-cms/util/content-templates';
import {
  type ManagedCollectionSlug,
  managedCollectionSlugs
} from '@codeware/app-cms/util/definitions';
import type {
  Page,
  Post,
  ReusableContent,
  Tenant
} from '@codeware/shared/util/payload-types';
import { SiteDefinitionSchema } from '@codeware/shared/util/seed';
import type {
  BundledMediaFile,
  NavigationLinkDefinition
} from '@codeware/shared/util/seed';
import type { SiteDefinition } from '@codeware/shared/util/seed';
import { bundledMediaPath } from '@codeware/shared/util/seed/site-definitions';
import type { Payload, TypedLocale } from 'payload';

import { defaultSiteSettings } from './default-site-settings';
import { type ExtraDocument, findExtraDocuments } from './find-extra-documents';
import { ensureCategory } from './local-api/ensure-category';
import { ensureCustomComponent } from './local-api/ensure-custom-component';
import { ensureCustomTheme } from './local-api/ensure-custom-theme';
import { ensureForm } from './local-api/ensure-form';
import { ensureMedia } from './local-api/ensure-media';
import { ensureNavigation } from './local-api/ensure-navigation';
import type { NavigationItemData } from './local-api/ensure-navigation';
import { ensurePage } from './local-api/ensure-page';
import { ensurePlace } from './local-api/ensure-place';
import { ensurePost } from './local-api/ensure-post';
import { ensureReusableContent } from './local-api/ensure-reusable-content';
import { ensureSiteSetting } from './local-api/ensure-site-setting';
import { ensureTag } from './local-api/ensure-tag';
import { ensureTour } from './local-api/ensure-tour';
import {
  FRESH_POLICY,
  type RemovedDocument,
  droppedReusedDocuments,
  refuseFormsWithSubmissions,
  removeRecreatedDocuments
} from './remove-managed-documents';
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
  /** Whether this run removed the definition's documents before applying */
  fresh: boolean;
  /**
   * What a fresh run removed first. Every entry was created by this
   * definition; nothing without its `managedBy` is ever here. Empty unless
   * `fresh`.
   */
  removed: Array<RemovedDocument>;
  /**
   * Documents a fresh run found and could not replace: named by the
   * definition but not created by it. Empty unless `fresh`.
   */
  kept: Array<ApplyOutcome>;
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
  /**
   * Remove what this definition created before applying it, so the tenant
   * ends up matching the definition rather than only gaining what it lacks.
   *
   * Replaces a live site's documents, so outside development the caller
   * confirms it as destructive. Removal is by `managedBy` alone: an editor's
   * document is never touched, and one the definition names but did not
   * create is left and found as `existed`.
   */
  fresh?: boolean;
  /**
   * Refuse a fresh apply that would recreate a form with submissions, which
   * would lose their form. Set where submissions are real visitor data.
   */
  protectFormSubmissions?: boolean;
};

/**
 * The locale a workspace writes in.
 *
 * Kept on its site settings rather than the tenant, so a workspace with none
 * yet falls back to English — which is what a fresh apply does before the seed
 * creates them.
 */
async function tenantLocale(
  payload: Payload,
  tenant: Pick<Tenant, 'id' | 'supportedLocales'>,
  transactionID: string | number | undefined
): Promise<TypedLocale> {
  const { docs } = await payload.find({
    collection: 'site-settings',
    where: { tenant: { in: [tenant.id] } },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  return workspaceLocale(
    docs[0]?.general?.defaultLocale,
    tenant.supportedLocales
  );
}

/**
 * The locale a workspace's content is written in, when the caller names none.
 *
 * Its settings say so once they exist. A new workspace has no settings row
 * yet, and English is only right when the workspace supports it — a
 * Swedish-only one would get its content and its default locale written under
 * a language it does not offer.
 */
export function workspaceLocale(
  settingsLocale: string | null | undefined,
  supportedLocales: ReadonlyArray<string> | null | undefined
): TypedLocale {
  return (settingsLocale ?? supportedLocales?.[0] ?? 'en') as TypedLocale;
}

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
  const {
    tenantSlug,
    dryRun = true,
    locale,
    mediaBaseUrl,
    fresh = false,
    protectFormSubmissions = false
  } = options;

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
  const places = new Map<string, number>();
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

  // The workspace's own locale unless the caller insists. Defaulting to
  // English wrote a Swedish workspace's localized fields under a locale its
  // site never reads — and `cdwr tenant apply-site` passes none
  const ctx = {
    locale: locale ?? (await tenantLocale(payload, tenant, transactionID)),
    transactionID
  };

  // The six collections a definition owns documents in get its name on
  // create. Navigation and site settings are one per tenant and never extra,
  // so they take the plain context
  const owned = { ...ctx, managedBy: definition.name };

  const removed: Array<RemovedDocument> = [];
  let handover: LandingHandover | undefined;
  // Media the definition dropped. Deleting media deletes its file outside the
  // transaction, so this waits until the transaction has committed
  let droppedMedia: Array<RemovedDocument> = [];

  try {
    // Before anything is ensured, so what follows creates the definition's
    // documents again rather than finding the old ones. Inside the `try`, so a
    // removal that fails is rolled back with everything else
    if (fresh) {
      if (protectFormSubmissions) {
        await refuseFormsWithSubmissions(payload, definition, tenant.id, {
          transactionID
        });
      }
      handover = await setAsideLandingPage(payload, definition, tenant.id, ctx);
      // Read before anything changes: what this definition created and no
      // longer names, in the collections it reuses rather than recreates
      const dropped = droppedReusedDocuments(
        await findExtraDocuments(payload, definition, tenant.id, {
          transactionID
        })
      );

      removed.push(
        ...(await removeRecreatedDocuments(payload, definition, tenant.id, {
          transactionID,
          exceptPages: handover ? [handover.id] : []
        }))
      );

      // Only media holds a file, so the rest go inside the transaction
      for (const document of dropped.filter((d) => d.collection !== 'media')) {
        await payload.delete({
          collection: document.collection,
          id: document.id,
          req: { transactionID }
        });
        removed.push(document);
      }
      droppedMedia = dropped.filter((d) => d.collection === 'media');
    }

    for (const tag of definition.tags ?? []) {
      tags.set(
        tag.slug,
        record(
          'tags',
          tag.slug,
          await ensureTag(payload, { ...tag, tenant: tenant.id }, owned)
        )
      );
    }

    for (const category of definition.categories ?? []) {
      categories.set(
        category.slug,
        record(
          'categories',
          category.slug,
          await ensureCategory(
            payload,
            { ...category, tenant: tenant.id },
            owned
          )
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
            owned
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
          await ensureForm(payload, { ...form, tenant: tenant.id }, owned)
        )
      );
    }

    // Before site settings, which name them among the themes it offers
    const customThemes = new Map<string, number>();
    for (const theme of definition.customThemes ?? []) {
      customThemes.set(
        theme.slug,
        record(
          'custom-themes',
          theme.slug,
          await ensureCustomTheme(
            payload,
            { ...theme, tenant: tenant.id },
            owned
          )
        )
      );
    }

    // Before reusable content and pages, whose layouts may place one. Left to
    // the build queue afterwards: this writes the source and nothing of `build`
    const customComponents = new Map<string, number>();
    for (const component of definition.customComponents ?? []) {
      customComponents.set(
        component.slug,
        record(
          'custom-components',
          component.slug,
          await ensureCustomComponent(
            payload,
            { ...component, tenant: tenant.id },
            owned
          )
        )
      );
    }

    // Filled below, before pages — a page's `reusable-content` block looks a
    // title up here the same way it looks a form or a tag up in its own map
    const reusableContent = new Map<string, number>();

    const resolver = {
      media: (filename: string) => media.get(filename),
      tag: (slug: string) => tags.get(slug),
      form: (title: string) => forms.get(title),
      customComponent: (slug: string) => customComponents.get(slug),
      reusableContent: (title: string) => reusableContent.get(title)
    };

    // After media, forms and custom themes, which its own layout may point
    // at, and before pages, which may place one. Its own layout can never
    // hold a `reusable-content` block — the collection refuses it — so
    // `resolver.reusableContent` above is never actually reached here
    for (const item of definition.reusableContent ?? []) {
      const layout = await Promise.all(
        item.layout.map(async (block) =>
          resolveRichText(
            payload,
            resolveBlockReferences(block, resolver, unresolved)
          )
        )
      );

      reusableContent.set(
        item.title,
        record(
          'reusable-content',
          item.title,
          await ensureReusableContent(
            payload,
            {
              layout: layout as unknown as ReusableContent['layout'],
              tenant: tenant.id,
              title: item.title
            },
            owned
          )
        )
      );
    }

    // Before tours, whose itinerary points at them
    for (const place of definition.places ?? []) {
      const { docs: labelDocs } = await payload.find({
        collection: 'platform-labels',
        where: {
          and: [
            { type: { equals: 'place-kind' } },
            { name: { equals: place.kind } }
          ]
        },
        depth: 0,
        limit: 1,
        req: { transactionID }
      });
      const kind = labelDocs[0]?.id;

      if (kind === undefined) {
        unresolved.push({
          blockType: 'place',
          field: 'kind',
          lookup: place.kind
        });
        continue;
      }

      places.set(
        place.name,
        record(
          'places',
          place.name,
          await ensurePlace(
            payload,
            {
              kind,
              name: place.name,
              note: place.note,
              url: place.url,
              tenant: tenant.id
            },
            owned
          )
        )
      );
    }

    // After places, whose ids its itinerary points at
    for (const tour of definition.tours ?? []) {
      const { docs: stockDocs } = await payload.find({
        collection: 'stock-media',
        where: { filename: { equals: tour.heroImage.lookupFilename } },
        depth: 0,
        limit: 1,
        req: { transactionID }
      });
      const heroImageId = stockDocs[0]?.id;

      if (heroImageId === undefined) {
        unresolved.push({
          blockType: 'tour',
          field: 'heroImage',
          lookup: tour.heroImage.lookupFilename
        });
        continue;
      }

      const itinerary = (tour.itinerary ?? []).map(
        ({ places: dayPlaces, ...day }) => ({
          ...day,
          places: (dayPlaces ?? []).flatMap(({ lookupName }) => {
            const id = places.get(lookupName);
            if (id === undefined) {
              unresolved.push({
                blockType: 'tour',
                field: 'itinerary.places',
                lookup: lookupName
              });
              return [];
            }
            return [id];
          })
        })
      );

      record(
        'tours',
        tour.slug,
        await ensureTour(
          payload,
          {
            bookingDeadline: tour.bookingDeadline,
            content: await convertMarkdownToLexical(
              payload.config,
              tour.content
            ),
            currency: tour.currency,
            departureDate: tour.departureDate,
            departureNote: tour.departureNote,
            destination: tour.destination,
            duration: tour.duration,
            heroImage: {
              relationTo: 'stock-media' as const,
              value: heroImageId
            },
            included: (tour.included ?? []).map((item) => ({ item })),
            intent: tour.intent,
            itinerary,
            notIncluded: (tour.notIncluded ?? []).map((item) => ({ item })),
            price: tour.price,
            slug: tour.slug,
            summary: tour.summary,
            tenant: tenant.id,
            title: tour.title
          },
          owned
        )
      );
    }

    for (const page of definition.pages) {
      const layout = await Promise.all(
        page.layout.map(async (block) =>
          resolveRichText(
            payload,
            resolveBlockReferences(block, resolver, unresolved)
          )
        )
      );

      const content = {
        header: page.header,
        // Payload validates the blocks on the way in, inside this
        // transaction — which is what makes a dry run exact
        layout: layout as unknown as Page['layout'],
        name: page.name,
        visibility: page.visibility ?? 'public'
      };

      // The landing page a fresh apply kept, having nothing to hand over to.
      // What it points at was recreated with the rest, so it takes the
      // definition's content again instead of keeping ids that are now gone
      if (handover && !handover.replaced && page.slug === handover.slug) {
        await payload.update({
          collection: 'pages',
          id: handover.id,
          data: content,
          locale: ctx.locale,
          req: { transactionID }
        });
        pages.set(page.slug, record('pages', page.slug, handover.id));
        continue;
      }

      pages.set(
        page.slug,
        record(
          'pages',
          page.slug,
          await ensurePage(
            payload,
            { ...content, slug: page.slug, tenant: tenant.id },
            owned
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
            owned
          )
        )
      );
    }

    if (definition.navigation?.length) {
      // A link that points nowhere is reported and left out. `at` says where
      // in the definition it was, for a child of a group
      const resolveLink = (
        { reference, label }: NavigationLinkDefinition,
        at = ''
      ) => {
        const known = reference.relationTo === 'pages' ? pages : posts;
        const value = known.get(reference.lookupSlug);

        if (value === undefined) {
          unresolved.push({
            blockType: 'navigation',
            field: `${reference.relationTo}${at}`,
            lookup: reference.lookupSlug
          });
          return undefined;
        }

        return {
          reference: { relationTo: reference.relationTo, value },
          labelSource: label ? ('custom' as const) : ('document' as const),
          customLabel: label ?? null
        };
      };

      const items = definition.navigation.flatMap(
        (item, index): Array<NavigationItemData> => {
          if ('children' in item) {
            const children = item.children.flatMap((child, childIndex) => {
              const link = resolveLink(
                child,
                ` (item ${index + 1}, child ${childIndex + 1})`
              );
              return link ? [link] : [];
            });
            // A group with nothing to open to is dropped, as a dangling link is
            return children.length ? [{ label: item.label, children }] : [];
          }

          const link = resolveLink(item);
          return link ? [{ ...link, appearance: item.appearance }] : [];
        }
      );

      // Fresh: the definition's label and appearance win for an item it names,
      // the same way its stated site settings do
      const { navigation } = await ensureNavigation(
        payload,
        { items, tenant: tenant.id },
        { ...ctx, definitionWins: fresh }
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
              // Not null in the database and without a default, so a workspace
              // that has no settings row yet cannot get one without this.
              // `ctx.locale` is the tenant's own: its settings, else the
              // first locale it supports
              defaultLocale: general?.defaultLocale ?? ctx.locale,
              landingPage: page(general?.landingPage, 'landingPage'),
              // Named by slug in the definition, stored by id
              ...(general?.customThemes && {
                customThemes: general.customThemes.flatMap(({ lookupSlug }) => {
                  const id = customThemes.get(lookupSlug);
                  if (id === undefined) {
                    unresolved.push({
                      blockType: 'site-settings',
                      field: 'customThemes',
                      lookup: lookupSlug
                    });
                    return [];
                  }
                  return [id];
                })
              })
            },
            ...(legal && {
              legal: {
                privacyPage: page(legal.privacyPage, 'privacyPage'),
                termsPage: page(legal.termsPage, 'termsPage')
              }
            }),
            tenant: tenant.id
          } as unknown as Parameters<typeof ensureSiteSetting>[1],
          { ...ctx, definitionWins: fresh }
        )
      );
    } else {
      // No stated settings: a new workspace still needs a working app, so it
      // gets the platform's defaults. An existing one keeps what it has.
      const { totalDocs: existingSettings } = await payload.count({
        collection: 'site-settings',
        where: { tenant: { equals: tenant.id } },
        req: { transactionID }
      });
      const landingPage = pages.get('home');

      if (!existingSettings) {
        if (landingPage === undefined) {
          unresolved.push({
            blockType: 'site-settings',
            field: 'general.landingPage',
            lookup: 'home'
          });
        } else {
          record(
            'site-settings',
            tenantSlug,
            await ensureSiteSetting(
              payload,
              defaultSiteSettings(
                { ...tenant, slug: tenantSlug },
                { landingPage, locale: ctx.locale }
              ),
              ctx
            )
          );
        }
      }
    }

    // The settings now point at the new landing page, so the old one can go
    if (handover?.replaced) {
      await payload.delete({
        collection: 'pages',
        id: handover.id,
        req: { transactionID }
      });
      removed.push({
        collection: 'pages',
        identifier: handover.slug,
        id: handover.id
      });
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

    // Only now: the rows are committed, so a file removed here can never be
    // the file of a row a rollback brings back. A dry run removes nothing and
    // reports what it would remove
    for (const media of droppedMedia) {
      if (!keep) {
        removed.push(media);
        continue;
      }
      try {
        await payload.delete({ collection: 'media', id: media.id });
        removed.push(media);
      } catch (error) {
        // The apply itself has committed; a file that would not go is left
        // and said so, rather than failing a write that already happened
        payload.logger.warn(
          `Fresh apply left media '${media.identifier}' in place: ${String(error)}`
        );
      }
    }

    return {
      tenant: { slug: tenantSlug, id: tenant.id },
      dryRun: !keep,
      outcomes,
      unresolved,
      extra,
      fresh,
      removed,
      // Only the collections an apply owns: navigation and site settings are
      // one per tenant, always found, and never removed
      // Only recreated collections: a reused one is expected to be found, and
      // navigation and site settings are one per tenant and never removed
      kept: fresh
        ? outcomes.filter(
            ({ action, collection }) =>
              action === 'existed' &&
              (managedCollectionSlugs as ReadonlyArray<string>).includes(
                collection
              ) &&
              FRESH_POLICY[collection as ManagedCollectionSlug] === 'recreate'
          )
        : []
    };
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}

/** The landing page a fresh apply cannot delete up front. */
type LandingHandover = {
  id: number;
  /** Its slug before it was set aside, for the report */
  slug: string;
  /** Whether a new landing page takes over, so the old one is removed at the end */
  replaced: boolean;
};

/**
 * Keep the tenant's landing page out of a fresh apply's up-front removal.
 *
 * The settings require a landing page — the column is not null, and its
 * foreign key sets null on delete — so the page cannot be deleted while it is
 * the landing page. When the definition names a landing page of its own, the
 * old one is renamed out of the way, the apply creates the new one and points
 * the settings at it, and the old one is removed last. When the definition
 * names none, there is nothing to hand over to, so the page is simply kept.
 *
 * Only a page this definition created is touched; any other landing page is
 * not the apply's to remove.
 */
async function setAsideLandingPage(
  payload: Payload,
  definition: SiteDefinition,
  tenantId: number,
  {
    locale,
    transactionID
  }: { locale: TypedLocale; transactionID: string | number | undefined }
): Promise<LandingHandover | undefined> {
  const { docs } = await payload.find({
    collection: 'site-settings',
    where: { tenant: { equals: tenantId } },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });
  const landing = docs[0]?.general?.landingPage;
  if (typeof landing !== 'number') {
    return undefined;
  }

  const page = await payload.findByID({
    collection: 'pages',
    id: landing,
    depth: 0,
    disableErrors: true,
    req: { transactionID }
  });
  if (!page || page.managedBy !== definition.name) {
    return undefined;
  }

  const replaced = Boolean(definition.siteSettings?.general?.landingPage);
  if (replaced) {
    // Frees the slug for the page the apply is about to create
    await payload.update({
      collection: 'pages',
      id: page.id,
      data: { slug: `${page.slug}--replaced-by-fresh-apply` },
      // The page's own language: in any other its required fields are empty,
      // and a Swedish workspace's landing page failed validation in English
      locale,
      req: { transactionID }
    });
  }

  return { id: page.id, slug: page.slug as string, replaced };
}

/** The tenant a definition is applied to. It is never created here. */
async function findTenant(
  payload: Payload,
  slug: string
): Promise<Pick<Tenant, 'id' | 'supportedLocales' | 'name' | 'description'>> {
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
