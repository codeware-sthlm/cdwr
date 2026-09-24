# Site definitions

A site definition states one website as data: its pages, their blocks, the
navigation, the settings. It carries **no identity** — no tenant, no API key, no
ids. The same definition can fill any tenant's workspace, and which tenant is
decided when it is applied.

That separation is the whole idea. `cdwr-io.ts` describes the cdwr.io site; it
does not describe cdwr.io's database row.

## Write one

A definition is a TypeScript module exporting a `SiteDefinition` as its default.
Only `name` and `pages` are required.

```ts
import type { SiteDefinition } from '@codeware/shared/util/seed';

export const acme: SiteDefinition = {
  name: 'acme.com',
  description: 'What this definition is for, in a sentence',

  pages: [
    {
      name: 'Home',
      slug: 'home',
      layout: [{ blockType: 'hero', heading: 'Welcome' }]
    }
  ]
};

export default acme;
```

The other keys — `tags`, `categories`, `media`, `forms`, `posts`, `navigation`,
`siteSettings` — are optional and follow the same shape as the collections they
fill.

The block types come straight from Payload's generated types, so an editor
completes them and a wrong field is a compile error rather than a surprise at
apply time.

## Point at something

Ids do not exist until the apply creates the documents, so a definition names
what it points at the way a person would:

| Reference        | Written as                     | Finds                |
| ---------------- | ------------------------------ | -------------------- |
| Media            | `{ lookupFilename: 'a.png' }`  | a media file         |
| Tag              | `{ lookupSlug: 'news' }`       | a tag                |
| Form             | `{ lookupTitle: 'Contact' }`   | a form               |
| Reusable content | `{ lookupSlug: 'footer-cta' }` | reusable content     |
| Author           | `{ lookupEmail: 'a@b.se' }`    | a user of the tenant |

A reference that resolves to nothing is **reported, not silently dropped** — it
comes back in the report's `unresolved` list, and the apply refuses to commit.

## Body text is markdown

Payload stores rich text as Lexical, which nobody writes by hand. A definition
states markdown instead and the apply converts it, the same way it resolves any
other reference:

```ts
{ blockType: 'content', columns: [{ size: 'full', richText: { markdown: '## Hello' } }] }
{ blockType: 'form', form: { lookupTitle: 'Contact' }, enableIntro: true,
  introContent: { markdown: 'Leave your email.' } }
```

Those are the only two places rich text exists. A post's `content` is a plain
markdown string, because the field is called content and nothing else could be
meant by it.

## Two fields that are easy to miss

**`media.external`** is access control, not a flag. A browser fetching a file
area download carries no api key, so media that is not `external: true` is
simply unreachable — and nothing says so at the time.

**`tag.brand`** carries the colour and icon its pill is drawn with. Omit it and
the tag still works, looking like nothing in particular.

## Apply it

```sh
cdwr tenant apply-site
```

It asks for the environment, the tenant and the definition — the definitions in
this directory are offered by name — or take them as flags:

```sh
cdwr tenant apply-site \
  --env=development \
  --tenant=moon \
  --definition=libs/shared/util/seed/src/lib/site-definitions/cdwr-io.ts \
  --dry-run
```

The flag takes any path, so a definition kept outside this directory still
applies; only the prompt is limited to the ones here.

The tenant must already exist — this fills a workspace, it does not create one:

```sh
cdwr tenant create --env=development --name='Acme'
```

That makes the row, derives its slug and mints its API key, and stops there.
`cdwr tenant provision` is a later step, and a different one: it sets up an
existing workspace's Infisical folders and deploys it.

## What the report means

```text
Plan
   1. forms: 1 already there
   2. pages: 1 to create, 1 already there
   3. navigation: 1 already there
   4. site-settings: 1 already there
```

Each document is either `created` or `existed`. The plan is produced by
**actually applying the definition and rolling the transaction back**, so it is
what the write did rather than a guess — every field has already been through
Payload's validation by the time you read it.

`--dry-run` stops there. Without it, the same work runs again and commits.

## See what has drifted

An apply only fills gaps, so it says nothing about content the definition does
not mention. `diff-site` is the other half, and it writes nothing at all:

```sh
cdwr tenant diff-site --env=development --tenant=moon --definition=…
```

```text
drift    collection  document           meaning
missing  pages       blocks             named by the definition, not in the tenant
extra    pages       christmas-offer    in the tenant, not named by the definition

1 missing, 24 extra, 4 in both
```

`extra` is a statement, not a proposal — nothing deletes it. It exists because
content drifting away from its definition should be visible rather than
discovered later.

The same list rides along in the apply report as `extra`, so a plan shows it too.

**Field-level drift is not detected.** A page that exists counts as present
however far its contents have wandered, so this answers "is it there", not "is
it the same". Nor does it look at navigation or site settings, which are one
document per tenant. Transcribing a site into a definition therefore needs the
fields read by hand — a clean diff is necessary, not sufficient.

## Three things it will not do

**It never updates.** There is no `updated` outcome: a document that is already
there is left exactly as it is. Editing a definition and re-applying it will not
change pages that exist — it only fills in what is missing. To change an existing
page, edit it in the admin, or remove it first.

**It never deletes.** A definition says what should exist, not that nothing else
may. A page it stops mentioning stays where it is.

**It never seeds or migrates.** The script forces `SEED_SOURCE=off` and
`DISABLE_DB_PUSH=true`, so applying a definition cannot rewrite the schema of
the database it is pointed at.

## Adding a block type

Payload's layout blocks split in two, and a new one has to be classified in
[`site-definition.ts`](./src/lib/site-definition.ts):

- **Points at another document** → add it to `ReferencingBlock`, and teach
  `resolveBlockReferences` how to resolve it
- **Does not** → add its `blockType` to `PlainBlockType`; the definition type
  picks it up from the generated types automatically

Forgetting is a compile error, not a runtime surprise: `AssertEveryBlockClassified`
fails the build and names the block.
