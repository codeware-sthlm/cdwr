import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync
} from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

import { defineCommand } from '../cli/command';
import { SHELLS, type Shell } from '../cli/completion';
import { CliError } from '../cli/errors';
import { input } from '../cli/inputs';
import { cdwrHome } from '../cli/prefs';

import { shellOf } from './completion';
import { installCompletion } from './completion.install';
import { completionFile } from './completion.logic';

const SHIM = 'tools/cdwr/bin/cdwr.mjs';
const MARK = '# cdwr completion';

const rcFile = (shell: Shell, home: string): string | undefined =>
  shell === 'zsh'
    ? join(home, '.zshrc')
    : shell === 'bash'
      ? join(home, '.bashrc')
      : undefined;

const expand = (path: string): string => path.replace(/^~(?=$|\/)/, homedir());

export default defineCommand({
  summary: 'Put cdwr on PATH and install shell completion',
  description:
    'Symlinks the cdwr shim into a directory on your PATH and wires the completion script into your shell.',
  danger: 'mutate',
  confirm: 'never',
  inputs: {
    dir: input.string({
      prompt: 'Where should the cdwr command live?',
      short: 'D',
      description: 'A directory on PATH',
      default: '~/.local/bin'
    }),
    shell: input.enum(SHELLS, {
      prompt: 'Which shell?',
      description: 'Shell to add completion for',
      short: 's',
      default: () => shellOf(process.env['SHELL'])
    })
  },

  async plan(ctx, { dir, shell }) {
    const binDir = expand(dir);
    const link = join(binDir, 'cdwr');
    const target = join(ctx.root, SHIM);
    const home = cdwrHome(ctx.env);
    const completion = completionFile(shell, {
      cdwrHome: home,
      home: homedir()
    });
    const rc = rcFile(shell, homedir());
    const onPath = (ctx.env['PATH'] ?? '').split(delimiter).includes(binDir);

    let linkState: 'missing' | 'ours' | 'other-link' | 'file' = 'missing';
    let linkedTo: string | undefined;
    if (existsSync(link) || isSymlink(link)) {
      const stat = lstatSync(link);
      linkedTo = stat.isSymbolicLink() ? readlinkSync(link) : undefined;
      linkState =
        linkedTo === undefined
          ? 'file'
          : linkedTo === target
            ? 'ours'
            : 'other-link';
    }
    if (linkState === 'file') {
      throw new CliError(
        `${link} exists and is not a symlink; move it aside first`
      );
    }
    const rcHasSource =
      rc && existsSync(rc) && readFileSync(rc, 'utf8').includes(MARK);

    const steps = [
      linkState === 'ours'
        ? `Keep ${link} (already points here)`
        : `Link ${link} → ${SHIM}`,
      `Write ${shell} completion to ${completion}, kept current from ${ctx.root}`,
      ...(rc && !rcHasSource ? [`Add a source line to ${rc}`] : [])
    ];
    const notes = [
      ...(linkState === 'other-link'
        ? [
            `The link moves from ${linkedTo}; completion follows ${ctx.root} from now on`
          ]
        : []),
      ...(onPath
        ? []
        : [`${binDir} is not on your PATH yet; the summary says what to add`])
    ];
    return {
      steps,
      notes,
      data: {
        link,
        target,
        linkState,
        completionFile: completion,
        cdwrHome: home,
        rc,
        rcHasSource: Boolean(rcHasSource),
        shell,
        binDir,
        onPath
      }
    };
  },

  async apply(ctx, data) {
    mkdirSync(join(data.link, '..'), { recursive: true });
    if (data.linkState === 'other-link') unlinkSync(data.link);
    if (data.linkState !== 'ours') symlinkSync(data.target, data.link);

    await installCompletion({
      shell: data.shell,
      file: data.completionFile,
      root: ctx.root,
      cdwrHome: data.cdwrHome
    });

    const next: string[] = [];
    if (data.rc && !data.rcHasSource) {
      appendFileSync(data.rc, `\n${MARK}\nsource "${data.completionFile}"\n`);
      next.push(`Open a new shell, or run: source "${data.rc}"`);
    }
    if (!data.onPath) {
      next.push(
        `Add to ${data.rc ?? 'your shell config'}: export PATH="${data.binDir}:$PATH"`
      );
    }
    ctx.ui.success(`cdwr → ${data.link}`);
    return {
      summary: 'cdwr is set up',
      next,
      json: { link: data.link, completion: data.completionFile }
    };
  }
});

const isSymlink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};
