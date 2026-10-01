import type { PlatformDefinition } from '@codeware/shared/util/seed';
import { PlatformDefinitionSchema } from '@codeware/shared/util/seed';
import { bundledStockMediaPath } from '@codeware/shared/util/seed/site-definitions';
import type { Payload, TypedLocale } from 'payload';

import type { ApplyOutcome } from './apply-site-definition';
import { ensureFaq } from './local-api/ensure-faq';
import { ensurePlatformLabel } from './local-api/ensure-platform-label';
import { ensurePlatformSettings } from './local-api/ensure-platform-settings';
import { ensureStockMedia } from './local-api/ensure-stock-media';
import { ensureTenant } from './local-api/ensure-tenant';
import { ensureUser } from './local-api/ensure-user';
import type { UnresolvedReference } from './resolve-block-references';

export type PlatformApplyReport = {
  outcomes: Array<ApplyOutcome>;
  /** References that led nowhere. Non-empty means nothing past tenants was committed */
  unresolved: Array<UnresolvedReference>;
  /** Every tenant this run ensured, by slug — what each site definition is applied to next */
  tenants: Map<string, { id: number; locale: TypedLocale }>;
};

export type ApplyPlatformOptions = {
  /** Written for every user this run creates. Environment-specific, never stated by the definition */
  password: string;
  /**
   * Where bundled stock media is served from, when it is not on disk.
   *
   * A deployed seed has no repository files, so it passes `SEED_DATA_URL`
   * here and every stock filename resolves to a URL instead.
   */
  mediaBaseUrl?: string;
};

/**
 * Applies the platform definition: the tenants, their users, the shared
 * label vocabularies, the stock media library and the FAQ — everything no
 * single site owns.
 *
 * Tenants commit in their own transaction, before anything else — Postgres
 * enforces the foreign keys the rest holds against them. Everything after
 * that is one transaction: a membership or a stock subject that resolves to
 * nothing rolls all of it back and is reported, the same way a site
 * definition's apply refuses to commit an incomplete site.
 *
 * There is no dry run — the seed is the only caller, and a dry run across two
 * transactions would need two phases to stay exact. One can be added
 * alongside a CLI command, when there is one.
 *
 * @param payload - Payload instance
 * @param definition - The platform, as data
 * @param options - The password new users are created with, and where
 * bundled stock media is served from when it is not on disk
 * @returns What was created, what already existed, what did not resolve, and
 * the tenant ids a site definition is applied to next
 * @throws If the definition is invalid, or a tenant could not be created
 */
export async function applyPlatformDefinition(
  payload: Payload,
  definition: PlatformDefinition,
  options: ApplyPlatformOptions
): Promise<PlatformApplyReport> {
  const { password, mediaBaseUrl } = options;

  const parsed = PlatformDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    throw new Error(
      'Platform definition is not valid:\n' +
        parsed.error.issues
          .map(
            ({ path, message }) => `  ${path.join('.') || '(root)'}: ${message}`
          )
          .join('\n')
    );
  }

  const outcomes: Array<ApplyOutcome> = [];
  const unresolved: Array<UnresolvedReference> = [];
  const tenants = new Map<string, { id: number; locale: TypedLocale }>();

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
    return typeof result === 'number' ? result : result.id;
  };

  // TENANTS — its own transaction, committed before anything else references
  // them by foreign key
  const tenantTransactionID = await payload.db.beginTransaction();
  if (tenantTransactionID === null || tenantTransactionID === undefined) {
    throw new Error(
      'The database adapter started no transaction. Refusing to apply.'
    );
  }

  try {
    for (const tenant of definition.tenants) {
      const id = record(
        'tenants',
        tenant.slug,
        await ensureTenant(
          payload,
          {
            apiKey: tenant.apiKey,
            deployment: tenant.deployment,
            description: tenant.description,
            name: tenant.name,
            slug: tenant.slug,
            supportedLocales: [...tenant.supportedLocales]
          },
          { locale: tenant.locale, transactionID: tenantTransactionID }
        )
      );
      tenants.set(tenant.slug, { id, locale: tenant.locale });
    }
    await payload.db.commitTransaction(tenantTransactionID);
  } catch (error) {
    await payload.db.rollbackTransaction(tenantTransactionID);
    throw error;
  }

  // USERS, LABELS, PLATFORM SETTINGS, STOCK MEDIA, FAQ — one transaction
  const transactionID = await payload.db.beginTransaction();
  if (transactionID === null || transactionID === undefined) {
    throw new Error(
      'The database adapter started no transaction. Refusing to apply.'
    );
  }

  try {
    for (const user of definition.users) {
      const memberships = user.tenants.flatMap(({ lookupSlug, role }) => {
        const tenant = tenants.get(lookupSlug);
        if (!tenant) {
          unresolved.push({
            blockType: 'user',
            field: 'tenants',
            lookup: lookupSlug
          });
          return [];
        }
        return [{ tenant: tenant.id, role }];
      });

      record(
        'users',
        user.email,
        await ensureUser(
          payload,
          {
            description: user.description,
            email: user.email,
            name: user.name,
            password,
            role: user.role,
            tenants: memberships
          },
          { locale: user.locale, transactionID }
        )
      );
    }

    // Before stock media, which resolves its subject by name
    const labelIds = new Map<string, number>();
    for (const label of definition.labels) {
      const id = record(
        'platform-labels',
        `${label.type}/${label.name}`,
        await ensurePlatformLabel(
          payload,
          {
            type: label.type,
            name: label.name,
            icon: label.icon,
            description: label.description ?? null
          },
          { transactionID }
        )
      );
      labelIds.set(`${label.type}:${label.name}`, id);
    }

    record(
      'platform-settings',
      'platform',
      await ensurePlatformSettings(payload, { transactionID })
    );

    for (const stock of definition.stockMedia) {
      const subject = stock.subject
        ? labelIds.get(`stock-subject:${stock.subject}`)
        : undefined;

      if (stock.subject && subject === undefined) {
        unresolved.push({
          blockType: 'stock-media',
          field: 'subject',
          lookup: stock.subject
        });
        continue;
      }

      record(
        'stock-media',
        stock.filename,
        await ensureStockMedia(
          payload,
          {
            alt: stock.alt,
            credit: stock.credit,
            licence: stock.licence,
            subject,
            filename: stock.filename,
            filePath: bundledStockMediaPath(stock.filename, mediaBaseUrl)
          },
          { transactionID }
        )
      );
    }

    for (const faq of definition.faq) {
      record(
        'faq',
        faq.question.en,
        await ensureFaq(payload, faq, { transactionID })
      );
    }

    const keep = unresolved.length === 0;
    await (keep
      ? payload.db.commitTransaction(transactionID)
      : payload.db.rollbackTransaction(transactionID));

    return { outcomes, unresolved, tenants };
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}
