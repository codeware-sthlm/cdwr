/**
 * The few parts of Payload's lexical package this file uses. The modules are
 * loaded without their own types: those pull in Next's globals, which make
 * `NODE_ENV` required on every `ProcessEnv` in this project.
 */
interface Lexical {
  $convertFromMarkdownString: (markdown: string, transformers: unknown) => void;
  defaultEditorFeatures: Array<{ key: string }>;
  HeadingFeature: (args: { enabledHeadingSizes: string[] }) => unknown;
  getEnabledNodes: (args: { editorConfig: EditorConfig }) => unknown;
  sanitizeServerEditorConfig: (
    editorConfig: { features: unknown },
    config: unknown
  ) => Promise<EditorConfig>;
}
interface EditorConfig {
  features: { markdownTransformers: unknown };
}
interface Headless {
  createHeadlessEditor: (args: { nodes: unknown }) => {
    update: (fn: () => void, options: { discrete: boolean }) => void;
    getEditorState: () => { toJSON: () => Record<string, unknown> };
  };
}
interface Payload {
  sanitizeConfig: (config: Record<string, unknown>) => Promise<unknown>;
}

const load = <T>(specifier: string): Promise<T> => import(specifier);

/**
 * Markdown as the Lexical JSON a post's `content` takes, converted here rather
 * than in the cms: the features need a sanitized Payload config, but nothing
 * in it touches a database, so a config with no collections and no db adapter
 * is enough.
 */
export async function markdownToLexical(
  markdown: string
): Promise<Record<string, unknown>> {
  const [lexical, { createHeadlessEditor }, { sanitizeConfig }] =
    await Promise.all([
      load<Lexical>('@payloadcms/richtext-lexical'),
      load<Headless>('@payloadcms/richtext-lexical/lexical/headless'),
      load<Payload>('payload')
    ]);
  const config = await sanitizeConfig({
    collections: [],
    secret: 'cdwr-devlog'
  });
  // Mirrors the cms's content field, libs/app-cms/ui/fields/src/lib/default-lexical.ts
  const features = [
    ...lexical.defaultEditorFeatures.filter(
      ({ key }) => key !== 'relationship' && key !== 'upload'
    ),
    lexical.HeadingFeature({
      enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4', 'h5']
    })
  ];
  const editorConfig = await lexical.sanitizeServerEditorConfig(
    { features },
    config
  );
  const editor = createHeadlessEditor({
    nodes: lexical.getEnabledNodes({ editorConfig })
  });
  editor.update(
    () =>
      lexical.$convertFromMarkdownString(
        markdown,
        editorConfig.features.markdownTransformers
      ),
    { discrete: true }
  );
  return editor.getEditorState().toJSON();
}
