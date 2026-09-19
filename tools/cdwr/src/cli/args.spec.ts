import { z } from 'zod';

import { flagUsage, parseCommandArgs, splitMulti } from './args';
import { UsageError } from './errors';
import { input } from './inputs';

const inputs = {
  environment: input.enum(['preview', 'production'], {
    prompt: 'Which environment?'
  }),
  force: input.boolean({ prompt: 'Force?' }),
  apps: input.multiselect({ prompt: 'Which apps?', choices: () => [] }),
  name: input.string({ prompt: 'Name?', positional: true, schema: z.string() }),
  camelCase: input.string({ prompt: 'Camel?' })
};

describe('parseCommandArgs', () => {
  it('reads flags by input key and leaves the rest undefined', () => {
    const { values, globals } = parseCommandArgs(
      ['--environment', 'preview', '--force'],
      inputs
    );
    expect(values).toEqual({ environment: 'preview', force: true });
    expect(globals.yes).toBe(false);
  });

  it('separates global flags from inputs', () => {
    const { globals, values } = parseCommandArgs(
      ['-y', '--dry-run', '--json'],
      inputs
    );
    expect(globals).toMatchObject({
      yes: true,
      'dry-run': true,
      json: true,
      help: false
    });
    expect(values).toEqual({});
  });

  it('accepts --no- for booleans', () => {
    expect(parseCommandArgs(['--no-force'], inputs).values['force']).toBe(
      false
    );
  });

  it('collects repeated multiselect flags', () => {
    expect(
      parseCommandArgs(['--apps', 'cms', '--apps', 'web'], inputs).values[
        'apps'
      ]
    ).toEqual(['cms', 'web']);
  });

  it('fills positional inputs from bare arguments', () => {
    expect(parseCommandArgs(['demo'], inputs).values['name']).toBe('demo');
  });

  it('kebab-cases camelCase keys', () => {
    expect(
      parseCommandArgs(['--camel-case', 'x'], inputs).values['camelCase']
    ).toBe('x');
    expect(flagUsage('camelCase', inputs.camelCase)).toBe(
      '--camel-case <value>'
    );
  });

  it('rejects unknown flags and stray arguments as usage errors', () => {
    expect(() => parseCommandArgs(['--nope'], inputs)).toThrow(UsageError);
    expect(() => parseCommandArgs(['a', 'b'], inputs)).toThrow(
      /Unexpected argument 'b'/
    );
  });

  it('refuses an input that shadows a global flag', () => {
    expect(() =>
      parseCommandArgs([], { yes: input.boolean({ prompt: '' }) })
    ).toThrow(/collides/);
  });
});

describe('splitMulti', () => {
  it('splits commas and repeats alike', () => {
    expect(splitMulti('a,b, c')).toEqual(['a', 'b', 'c']);
    expect(splitMulti(['a', 'b,c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('flagUsage', () => {
  it('shows enum values and multiselect shape', () => {
    expect(flagUsage('environment', inputs.environment)).toBe(
      '--environment <preview|production>'
    );
    expect(flagUsage('apps', inputs.apps)).toBe('--apps <a,b,...>');
    expect(flagUsage('force', inputs.force)).toBe('--force');
  });
});
