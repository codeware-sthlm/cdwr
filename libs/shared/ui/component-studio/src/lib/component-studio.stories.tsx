import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { StudioBuild } from './build-state';
import type { ImportCatalog } from './catalog';
import type { CheckOutcome } from './check';
import { ComponentStudio, type ComponentStudioProps } from './ComponentStudio';
import type { SyncOutcome } from './last-action';

const SOURCE = `import { useState } from 'react';
import { Button } from '@site/ui';

type Props = {
  label: string;
  step?: number;
};

export default function Counter({ label, step = 1 }: Props) {
  const [count, setCount] = useState(0);

  return (
    <div className="flex items-center gap-3">
      <span>{label}: {count}</span>
      <Button onClick={() => setCount(count + step)}>Add {step}</Button>
    </div>
  );
}
`;

const MESSY = `import {useState} from "react"
export default function Counter({label}:{label:string}){
const [count,setCount]=useState(0)
return <button onClick={()=>setCount(count+1)}>{label}: {count}</button>}
`;

const BROKEN = `import { useState } from 'react';

export default function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0;
  return <button>{label}: {count}</button>;
}
`;

const wait = <T,>(value: T, ms: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const KIT_NAMES = [
  'Accordion',
  'Alert',
  'Badge',
  'Button',
  'Card',
  'Checkbox',
  'Dialog',
  'Input',
  'Select',
  'Tabs',
  ...Array.from({ length: 80 }, (_, index) => `KitPart${index + 1}`)
];

const catalog = {
  reactHooks: [
    'useState',
    'useEffect',
    'useMemo',
    'useCallback',
    'useRef',
    'useId'
  ],
  packages: ['clsx', 'date-fns', 'lucide-react', 'zod'],
  loadKitNames: () => wait(KIT_NAMES, 600)
} as const satisfies ImportCatalog;

const readyBuild: StudioBuild = {
  status: 'ready',
  hash: '3f9c2a71b8d04e56',
  builtAt: '2026-10-02T09:41:00Z',
  diagnostics: []
};

const at = { column: 1 } as const;

const warnings: StudioBuild['diagnostics'] = [
  {
    ...at,
    line: 2,
    column: 10,
    severity: 'warning',
    message: "'Button' is imported from '@site/ui' but never used."
  },
  {
    ...at,
    line: 0,
    severity: 'warning',
    message: 'Input `step` has no default; the form will always supply it.'
  }
];

const failedBuild: StudioBuild = {
  status: 'failed',
  hash: '3f9c2a71b8d04e56',
  builtAt: '2026-10-01T16:02:00Z',
  job: { step: 'bundle', durationMs: 2400 },
  diagnostics: [
    {
      ...at,
      line: 14,
      column: 14,
      severity: 'error',
      message: "Could not resolve './missing'."
    },
    {
      ...at,
      line: 11,
      column: 10,
      severity: 'error',
      message: "'count' is declared but its value is never read."
    },
    {
      ...at,
      line: 2,
      column: 10,
      severity: 'warning',
      message: "'Button' is imported from '@site/ui' but never used."
    },
    {
      ...at,
      line: 0,
      severity: 'error',
      message:
        'Input `step` is declared as text, but the component takes a number.'
    }
  ]
};

const problems: CheckOutcome = {
  status: 'done',
  result: {
    ok: false,
    diagnostics: [
      {
        line: 9,
        column: 38,
        severity: 'error',
        message: "Property 'label' is missing in type '{ step: number }'."
      },
      {
        line: 15,
        column: 14,
        severity: 'warning',
        message: "'Button' has an unused prop 'variant'."
      },
      {
        line: 0,
        column: 1,
        severity: 'error',
        message:
          'Input `step` is declared as text, but the component takes a number.'
      }
    ],
    props: [
      { name: 'label', kind: 'string', optional: false },
      { name: 'step', kind: 'number', optional: true }
    ]
  }
};

const clean: CheckOutcome = {
  status: 'done',
  result: {
    ok: true,
    diagnostics: [],
    props: [
      { name: 'label', kind: 'string', optional: false },
      { name: 'step', kind: 'number', optional: true }
    ]
  }
};

const synced: SyncOutcome = {
  status: 'changed',
  added: ['label', 'step'],
  removed: ['title'],
  updated: [],
  skipped: ['onChange']
};

const INPUTS = [
  { name: 'label', type: 'text', required: true },
  { name: 'step', type: 'number', required: false },
  { name: 'compact', type: 'checkbox', required: false }
] as const;

type Input = { name: string; type: string; required: boolean };

const InputsList = ({ inputs }: { inputs: readonly Input[] }) => (
  // Names in one column, so the badges start on the same line
  <ul className="m-0 grid list-none grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 p-0 text-sm">
    {inputs.map(({ name, type, required }) => (
      <li key={name} className="contents">
        <code>{name}</code>
        <span className="flex items-center gap-2">
          <Badge variant="muted">{type}</Badge>
          {required && <Badge variant="outline">required</Badge>}
        </span>
      </li>
    ))}
  </ul>
);

/** What the sample source takes, as the host would work it out from a check */
const FROM_CODE: readonly Input[] = [
  { name: 'label', type: 'text', required: true },
  { name: 'step', type: 'number', required: false }
];

type Args = Partial<ComponentStudioProps> & {
  initial?: string;
  /** Shows the inputs list in the side panel */
  withPanel?: boolean;
};

/** The host's half: the source lives here, as it would in a form */
const Harness = ({ initial = SOURCE, withPanel, ...props }: Args) => {
  const [value, setValue] = useState(initial);
  const [inputs, setInputs] = useState<readonly Input[]>(INPUTS);

  // The host's sync: the list becomes what the code takes
  const sync = (): Promise<SyncOutcome> => {
    const removed = inputs
      .filter(({ name }) => !FROM_CODE.some((input) => input.name === name))
      .map(({ name }) => name);
    const added = FROM_CODE.filter(
      ({ name }) => !inputs.some((input) => input.name === name)
    ).map(({ name }) => name);
    setInputs(FROM_CODE);
    return wait(
      removed.length + added.length > 0
        ? { status: 'changed', added, removed, updated: [], skipped: [] }
        : { status: 'unchanged', skipped: [] },
      400
    );
  };

  return (
    <ComponentStudio
      colorScheme="light"
      build={readyBuild}
      catalog={catalog}
      onCheck={() => wait(clean, 1000)}
      onSyncInputs={sync}
      sidePanel={withPanel ? <InputsList inputs={inputs} /> : undefined}
      {...props}
      value={value}
      onChange={setValue}
    />
  );
};

const meta = {
  title: 'Shared UI/Component Studio',
  parameters: { layout: 'padded' },
  render: (args: Args) => <Harness {...args} />
} satisfies Meta<Args>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  name: 'Ready build',
  args: { withPanel: true }
};

export const ReadyWithWarnings: Story = {
  name: 'Ready with warnings',
  args: {
    build: { ...readyBuild, diagnostics: warnings },
    withPanel: true
  }
};

export const Failed: Story = {
  name: 'Failed build',
  args: { build: failedBuild, withPanel: true }
};

export const Pending: Story = {
  name: 'Pending build',
  args: {
    build: { status: 'pending', hash: null, builtAt: null, diagnostics: [] }
  }
};

export const Building: Story = {
  name: 'Building',
  args: {
    build: {
      status: 'building',
      hash: '3f9c2a71b8d04e56',
      builtAt: null,
      diagnostics: []
    }
  }
};

export const NeverBuilt: Story = {
  name: 'Not built yet',
  args: { build: null }
};

export const CheckWithProblems: Story = {
  name: 'Check takes a second, finds problems',
  args: {
    onCheck: () => wait(problems, 1000),
    withPanel: true
  }
};

export const CheckUnreachable: Story = {
  name: 'Check cannot reach the build service',
  args: { onCheck: () => wait<CheckOutcome>({ status: 'failed' }, 600) }
};

export const SyncInputs: Story = {
  name: 'Sync inputs from code',
  args: {
    onCheck: () => wait(clean, 800),
    onSyncInputs: () => wait(synced, 400),
    withPanel: true
  }
};

export const SyncUnchanged: Story = {
  name: 'Sync inputs, already in sync',
  args: {
    onSyncInputs: () => ({ status: 'unchanged', skipped: [] }),
    withPanel: true
  }
};

export const FormatMessy: Story = {
  name: 'Format messy source',
  args: { initial: MESSY, withPanel: true }
};

export const FormatSyntaxError: Story = {
  name: 'Format a syntax error',
  args: { initial: BROKEN }
};

export const ReadOnly: Story = {
  name: 'Read-only',
  args: { readOnly: true, withPanel: true }
};

export const PanelClosed: Story = {
  name: 'Side panel closed',
  args: { defaultPanelOpen: false, withPanel: true }
};

export const KitFailsToLoad: Story = {
  name: 'Import picker, kit fails to load',
  args: {
    catalog: {
      ...catalog,
      loadKitNames: () =>
        new Promise<string[]>((_resolve, reject) =>
          setTimeout(() => reject(new Error('offline')), 400)
        )
    }
  }
};

export const Dark: Story = {
  name: 'Dark colour scheme',
  args: { colorScheme: 'dark', build: failedBuild, withPanel: true },
  render: (args: Args) => (
    <div
      className="dark bg-background text-foreground rounded-lg p-4"
      data-theme="dark"
    >
      <Harness {...args} />
    </div>
  )
};
