import type { TenantRole } from '@codeware/shared/util/payload-types';
import type { TenantLookup } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

import type { TenantDataLookup } from '../seed-types';

type MapKey = { apiKey: string; slug: string };
type TenantDataWithID = TenantDataLookup & { id: number };
type TenantDataWithIDRole = TenantDataWithID & { role: TenantRole };

/**
 * A store of the ids created during one seed run.
 *
 * Created per run rather than shared at module level: the maps only mean
 * anything within the run that filled them, and a second run in the same
 * process would otherwise resolve references against the first one's ids. That
 * never mattered while seeding happened once at boot, and it matters as soon as
 * anything calls this on demand.
 *
 * Only what the seed itself creates is here. A tenant's content comes from its
 * site definition, whose apply tracks its own ids.
 *
 * @returns Somewhere to record ids, and the lookups that read them back
 */
export function createSeedStore() {
  const mapper = {
    // Map to place id (unique per tenant)
    place: new Map<string, number>(),

    // Map filename to stock media id (shared across tenants)
    stockMedia: new Map<string, number>(),

    // Map api key to tenant id and seed data (unique across tenants)
    tenant: new Map<string, TenantDataWithID>()
  };

  /** Records an id under the key the lookups will ask for. */
  const put = {
    /**
     * Store place to map.
     *
     * @param place - The place to store.
     * @param placeId - The id of the place.
     */
    place: (place: MapKey, placeId: number) => {
      mapper.place.set(JSON.stringify(place), placeId);
    },

    /**
     * Store stock media filename to map.
     *
     * @param filename - The filename of the stock image.
     * @param stockMediaId - The id of the stock image.
     */
    stockMedia: (filename: string, stockMediaId: number) => {
      mapper.stockMedia.set(filename, stockMediaId);
    },

    /**
     * Store tenant api key and tenant data in map.
     *
     * @param apiKey - The api key of the tenant.
     * @param tenant - The tenant data including id.
     */
    tenant: (apiKey: string, tenant: TenantDataWithID) => {
      mapper.tenant.set(apiKey, tenant);
    }
  };

  /**
   * Lookup place id's.
   *
   * @param payload - The payload instance.
   * @param places - The places to lookup.
   */
  function lookupPlace(payload: Payload, places: Array<MapKey>): Array<number> {
    return places.reduce((acc, place) => {
      const placeId = mapper.place.get(JSON.stringify(place));
      if (!placeId) {
        payload.logger.error(
          `Skip: Place '${place.slug}' for tenant '${place.apiKey}' not found`
        );
        return acc;
      }
      acc.push(placeId);
      return acc;
    }, [] as Array<number>);
  }

  /**
   * Lookup a stock media id by filename.
   *
   * @param payload - The payload instance.
   * @param filename - The filename to lookup.
   */
  function lookupStockMedia(
    payload: Payload,
    filename: string
  ): number | undefined {
    const stockMediaId = mapper.stockMedia.get(filename);
    if (!stockMediaId) {
      payload.logger.error(`Skip: Stock image '${filename}' not found`);
    }
    return stockMediaId;
  }

  /**
   * Lookup tenant and role by api key.
   *
   * @param payload - The payload instance.
   * @param tenants - The tenant api keys to lookup.
   * @returns Tenant entities with tenant id and role.
   */
  function lookupTenant(
    payload: Payload,
    tenants: Array<TenantLookup>
  ): Array<TenantDataWithIDRole>;
  function lookupTenant(
    payload: Payload,
    tenants: Array<Pick<TenantLookup, 'lookupApiKey'>>
  ): Array<TenantDataWithID>;
  function lookupTenant(
    payload: Payload,
    tenants: Array<TenantLookup | Pick<TenantLookup, 'lookupApiKey'>>
  ) {
    return tenants.reduce(
      (acc, tenantLookup) => {
        const tenant = mapper.tenant.get(tenantLookup.lookupApiKey);
        if (!tenant) {
          payload.logger.error(
            `Skip: Tenant '${tenantLookup.lookupApiKey}' not found`
          );
          return acc;
        }
        // If the tenant lookup includes a role, use it
        if ('role' in tenantLookup && tenantLookup.role) {
          acc.push({ ...tenant, role: tenantLookup.role });
        } else {
          acc.push(tenant);
        }
        return acc;
      },
      [] as Array<TenantDataWithID | TenantDataWithIDRole>
    );
  }

  return {
    ...put,
    lookupPlace,
    lookupStockMedia,
    lookupTenant
  };
}

/** What one run's ids are recorded in and read back from. */
export type SeedStore = ReturnType<typeof createSeedStore>;
