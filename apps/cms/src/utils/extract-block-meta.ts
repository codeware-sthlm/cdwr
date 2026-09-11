/**
 * Evaluate the registered blocks and print their shape as JSON.
 *
 * Run by the `block-meta-sync` generator through `tsx`, not imported by it.
 * Nx loads a generator without the workspace's path aliases, so an
 * `@codeware/app-cms/ui/blocks` import from inside one does not resolve — and
 * a generator may not reach into an app by relative path either. It lives here
 * because this is the app that registers the blocks, alongside the other
 * scripts that run outside the server.
 *
 * Evaluated rather than parsed. Half the fields on a block come from a helper
 * — `linkGroupField()`, `sectionHeaderFields()` — so reading the source text
 * would see a function call where the admin shows six fields.
 */
import * as blocks from '@codeware/app-cms/ui/blocks';

import pages from '../collections/pages/pages.collection';
import reusableContent from '../collections/reusable-content/reusable-content.collection';

/**
 * Every surface that offers blocks and names them readably.
 *
 * The two collections name theirs on a layout field. The `content` block does
 * the same on the nested field inside each of its columns, which is how an
 * editor reaches a code sample or an image from inside prose — leaving it out
 * reported `code` as available on pages without saying that you get there
 * through a content block.
 *
 * `posts` and `tours` stay absent: they gate their blocks inside a Lexical
 * editor config, which is opaque from here and not worth guessing at.
 */
const hosts = {
  pages,
  'reusable-content': reusableContent,
  content: blocks.contentBlock
};

type Host = keyof typeof hosts;

/** A label as Payload holds it: absent, one string, or one per locale. */
type PayloadLabel = false | string | Record<string, string> | undefined;

type AnyField = {
  name?: string;
  type: string;
  required?: boolean;
  localized?: boolean;
  label?: PayloadLabel;
  admin?: { description?: PayloadLabel; condition?: unknown };
  fields?: Array<AnyField>;
  tabs?: Array<{ fields: Array<AnyField> }>;
  blockReferences?: Array<string>;
};

type PayloadBlock = {
  slug: string;
  labels?: { singular?: PayloadLabel; plural?: PayloadLabel };
  fields: Array<AnyField>;
};

/**
 * Containers an editor never sees as a field.
 *
 * A `row` or a `collapsible` is layout in the admin, not something to fill in,
 * so its children are lifted rather than nested — otherwise the gallery
 * describes the admin's markup instead of the block's shape.
 */
const presentational = new Set(['row', 'collapsible', 'tabs', 'ui']);

/**
 * A label as the gallery needs it: what the definition says, per locale.
 *
 * Reducing it to English here is what left a Swedish site reading its own
 * field table in English. A definition that gives one string for every locale
 * becomes `{ en }`, so the renderer has a single shape to select from.
 */
function label(value: PayloadLabel): Record<string, string> | null {
  if (!value) return null;
  if (typeof value === 'string') return { en: value };

  const written = Object.entries(value).filter(([, text]) => text);
  return written.length ? Object.fromEntries(written) : null;
}

/**
 * Describe the fields of one block, all the way down.
 *
 * It stopped one level deep to keep the table short, which left a group inside
 * an array — `hero.actions.link`, `card.cards.brand` — stated by name with
 * nothing under it. A named container an editor cannot see into says less than
 * the fields it holds.
 */
function describeFields(
  fields: Array<AnyField>
): Array<Record<string, unknown>> {
  return fields.flatMap((field) => {
    if (presentational.has(field.type) || !field.name) {
      const children = field.tabs
        ? field.tabs.flatMap((tab) => tab.fields)
        : (field.fields ?? []);
      return describeFields(children);
    }

    const described: Record<string, unknown> = {
      name: field.name,
      type: field.type
    };

    if (field.required) described['required'] = true;
    // Payload shows it only when a sibling says so, so `required` alone would
    // star both halves of a link group where an editor fills in one
    if (field.admin?.condition) described['conditional'] = true;
    if (field.localized) described['localized'] = true;

    const fieldLabel = label(field.label);
    if (fieldLabel) described['label'] = fieldLabel;

    const description = label(field.admin?.description);
    if (description) described['description'] = description;

    if (field.blockReferences?.length) {
      described['blocks'] = [...field.blockReferences].sort();
    }

    if (field.fields?.length) {
      const children = describeFields(field.fields);
      if (children.length) described['fields'] = children;
    }

    return [described];
  });
}

/** Walk a collection's fields, including the ones inside tabs and groups. */
function walk(fields: Array<AnyField>, visit: (field: AnyField) => void): void {
  for (const field of fields) {
    visit(field);
    if (field.fields) walk(field.fields, visit);
    if (field.tabs) for (const tab of field.tabs) walk(tab.fields, visit);
  }
}

/**
 * Which blocks a host collection offers, read from its layout field.
 *
 * @throws If the collection names none, which means the shape moved and every
 *   block would otherwise be reported as unavailable — a silent wrong answer
 *   is worse than a failed sync.
 */
function offeredBy(host: Host): Array<string> {
  const offered = new Set<string>();

  walk((hosts[host] as { fields: Array<AnyField> }).fields, (field) => {
    for (const slug of field.blockReferences ?? []) offered.add(slug);
  });

  if (offered.size === 0) {
    throw new Error(
      `No blocks found on '${host}'. Its layout field no longer declares ` +
        `blockReferences, so block availability cannot be derived.`
    );
  }

  return [...offered];
}

const availability = (Object.keys(hosts) as Array<Host>).map(
  (host) => [host, offeredBy(host)] as const
);

const meta = Object.fromEntries(
  Object.values(blocks as unknown as Record<string, PayloadBlock>)
    .filter((block) => block?.slug)
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((block) => [
      block.slug,
      {
        slug: block.slug,
        label: label(block.labels?.singular) ?? { en: block.slug },
        availableIn: availability
          .filter(([, slugs]) => slugs.includes(block.slug))
          .map(([host]) => host),
        fields: describeFields(block.fields)
      }
    ])
);

process.stdout.write(JSON.stringify({ hosts: Object.keys(hosts), meta }));
