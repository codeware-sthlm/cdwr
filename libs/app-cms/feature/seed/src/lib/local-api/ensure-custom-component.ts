import { getId } from '@codeware/app-cms/util/misc';
import type { CustomComponent } from '@codeware/shared/util/payload-types';
import type { Payload } from 'payload';

export type CustomComponentData = Pick<
  CustomComponent,
  'name' | 'source' | 'propsSchema' | 'tenant'
> & {
  /** The lookup key per tenant */
  slug: string;
};

/**
 * Ensure a custom component exists for the tenant.
 *
 * Writes what an editor writes and never `build`: saving queues the build, and
 * the queue runs it.
 *
 * @returns The created component, or the id when the tenant already has the slug
 */
export async function ensureCustomComponent(
  payload: Payload,
  data: CustomComponentData,
  options: {
    transactionID: string | number | undefined;
    /** Written on create only; an existing document is never claimed */
    managedBy?: string;
  }
): Promise<CustomComponent | number> {
  const { transactionID, managedBy } = options;
  const { name, slug, source, propsSchema, tenant } = data;

  const existing = await payload.find({
    collection: 'custom-components',
    where: {
      and: [
        { slug: { equals: slug } },
        tenant ? { tenant: { in: [getId(tenant)] } } : {}
      ]
    },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (existing.totalDocs) {
    return existing.docs[0].id;
  }

  return payload.create({
    collection: 'custom-components',
    // Pending is what a new component is; saving it queues the build
    data: {
      ...(managedBy ? { managedBy } : {}),
      name,
      slug,
      source,
      propsSchema,
      tenant,
      build: { status: 'pending' }
    },
    context: { seedAction: true },
    req: { transactionID }
  });
}
