import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  nxEnvFiles,
  readCommittedEnv,
  readEnvFiles,
  taskEnvFiles
} from './committed-env';

describe('committed env', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'committed-env-'));
    mkdirSync(join(dir, 'apps', 'cms'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const write = (file: string, text: string) =>
    writeFileSync(join(dir, file), text);

  describe('nxEnvFiles', () => {
    it.each([
      ['dev', undefined, undefined],
      ['build', 'production', undefined],
      ['serve', 'development', 'dev']
    ])('matches Nx for %s / %s / %s', (target, configuration, atomized) => {
      const nxPaths = createRequire(import.meta.url)(
        join(
          dirname(createRequire(import.meta.url).resolve('nx/package.json')),
          'dist/src/tasks-runner/task-env-paths.js'
        )
      ) as {
        getEnvPathsForTask: (...args: unknown[]) => string[];
      };
      expect(nxEnvFiles('apps/cms', target, configuration, atomized)).toEqual(
        nxPaths.getEnvPathsForTask('apps/cms', target, configuration, atomized)
      );
    });
  });

  describe('taskEnvFiles', () => {
    it('keeps existing files only and splits off the local overrides', () => {
      write('.env', 'A=1\n');
      write('.env.local', 'A=2\n');
      write(join('apps', 'cms', '.env'), 'B=1\n');
      write(join('apps', 'cms', '.local.env'), 'B=2\n');
      write(join('apps', 'cms', '.env.dev.local'), 'B=3\n');
      write(join('apps', 'cms', '.env.dev'), 'B=4\n');

      const files = taskEnvFiles({
        workspaceRoot: dir,
        projectRoot: 'apps/cms',
        target: 'dev'
      });

      expect(files.all).toHaveLength(6);
      expect(files.committed).toEqual([
        join(dir, 'apps/cms/.env.dev'),
        join(dir, 'apps/cms/.env'),
        join(dir, '.env')
      ]);
      expect(files.local).toEqual([
        join(dir, 'apps/cms/.env.dev.local'),
        join(dir, 'apps/cms/.local.env'),
        join(dir, '.env.local')
      ]);
    });

    it('finds nothing when no file exists', () => {
      expect(
        taskEnvFiles({
          workspaceRoot: dir,
          projectRoot: 'apps/cms',
          target: 'dev'
        })
      ).toEqual({ all: [], committed: [], local: [] });
    });
  });

  describe('readCommittedEnv', () => {
    it('lets the first file win, as Nx loads without overriding', () => {
      write('.env', 'A=root\nB=root\n');
      write(join('apps', 'cms', '.env'), 'B=project\n');
      expect(
        readCommittedEnv([join(dir, 'apps/cms/.env'), join(dir, '.env')])
      ).toEqual({ A: 'root', B: 'project' });
    });

    it('parses like dotenv', () => {
      write('.env', 'Q="a b"\nC=x # note\nE=\n');
      expect(readEnvFiles([join(dir, '.env')])).toEqual({
        Q: 'a b',
        C: 'x',
        E: ''
      });
    });

    it('reads nothing from no files', () => {
      expect(readCommittedEnv([])).toEqual({});
    });
  });
});
