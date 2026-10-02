import { Skeleton } from '@codeware/shared/ui/shadcn/components/skeleton';
import { type BeforeMount, Editor, type OnMount } from '@monaco-editor/react';

import { INDENT, configureTypescript, editorHeight, modelUri } from './monaco';

type Props = {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  colorScheme: 'light' | 'dark';
  /** Names the editor's model; two editors on one page need two */
  modelPath: string;
  onMount: OnMount;
};

const MONACO_THEMES = {
  light: 'vs',
  dark: 'vs-dark'
} as const satisfies Record<Props['colorScheme'], string>;

/** Monaco, as a controlled TSX editor that grows with its source. */
export const SourceEditor = ({
  value,
  onChange,
  readOnly,
  colorScheme,
  modelPath,
  onMount
}: Props) => {
  const height = editorHeight(value.split('\n').length);
  const beforeMount: BeforeMount = configureTypescript;

  return (
    <Editor
      height={height}
      path={modelUri(modelPath)}
      defaultLanguage="typescript"
      value={value}
      theme={MONACO_THEMES[colorScheme]}
      loading={<Skeleton className="w-full rounded-none" style={{ height }} />}
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(next) => onChange(next ?? '')}
      options={{
        ...INDENT,
        detectIndentation: false,
        readOnly,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        fontSize: 13,
        padding: { top: 8, bottom: 8 },
        // The studio's own Format is Prettier's; Monaco's would disagree with it
        formatOnPaste: false,
        formatOnType: false
      }}
    />
  );
};
