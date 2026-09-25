import type { FileAreaBlock } from '@codeware/shared/util/payload-types';
import type { FieldHook, TypeWithID, Where } from 'payload';

type TypeWithTenant = TypeWithID & {
  tenant: string;
};

export const composeFilesHook: FieldHook<
  TypeWithTenant, // collection type
  FileAreaBlock['files'], // the virtual compose field type
  FileAreaBlock // block/sibling type
> = async ({ operation, req, data, siblingData: { tags }, value }) => {
  if (operation !== 'read') {
    return value;
  }

  if (!tags?.length) {
    return [];
  }

  // Query on tenant just in case, though the selected tags should be tenant scoped
  const tenantQuery: Where = data?.tenant
    ? { tenant: { equals: data.tenant } }
    : {};

  const res = await req.payload.find({
    collection: 'media',
    select: { tenant: false },
    where: { and: [{ tags: { in: tags } }, tenantQuery] },
    depth: 0,
    pagination: false,
    // Inside the caller's transaction, so media added in it is found
    req
  });

  if (res.totalDocs) {
    value = res.docs.map((media) => ({
      media,
      id: String(media.id)
    }));
  }

  return value;
};
