import type { Payload } from 'payload';

type StoredTenant = { id: number; apiKey?: string | null };

/**
 * Reads tenants' API keys for server-side tooling: cdwr scripts and the
 * system-user Infisical status.
 *
 * Payload strips the key from every collection read, so this goes through the
 * database adapter, which skips collection hooks and returns the stored,
 * encrypted value, and decrypts it with the Payload secret. Only call it once
 * the caller is already authorised for those tenants; never return the result
 * to a client.
 */
export const readTenantApiKeys = async (
  payload: Payload,
  ids?: ReadonlyArray<number>
): Promise<Map<number, string>> => {
  const { docs } = await payload.db.find<StoredTenant>({
    collection: 'tenants',
    pagination: false,
    where: ids ? { id: { in: [...ids] } } : {}
  });

  return new Map(
    docs.flatMap(({ id, apiKey }) =>
      apiKey ? [[id, payload.decrypt(apiKey)] as const] : []
    )
  );
};
