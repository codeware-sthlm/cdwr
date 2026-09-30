import type { TargetConfiguration } from '@nx/devkit';
import type { RunCommandsOptions } from 'nx/src/executors/run-commands/run-commands.impl';

import type { PayloadTarget } from './definitions';

/**
 * Create Payload targets for a project
 *
 * @param args - arguments
 * @returns The payload targets
 */
export function createPayloadTargets(args: {
  isGraphQLDisabled?: boolean;
  projectName: string;
  projectRoot: string;
  configFile: string;
}): Record<PayloadTarget, TargetConfiguration> {
  const { isGraphQLDisabled, projectName, projectRoot, configFile } = args;

  const dxPrefix = 'Developer experience (DX)';

  return {
    gen: {
      metadata: {
        description:
          'Generate types and GraphQL schema (if enabled) from the Payload configuration',
        technologies: ['node']
      },
      executor: 'nx:run-commands',
      inputs: [`{projectRoot}/${configFile}`],
      options: {
        commands: isGraphQLDisabled
          ? ['npx payload generate:types']
          : [
              'npx payload generate:types',
              'npx payload-graphql generate:schema'
            ],
        cwd: projectRoot,
        env: { PAYLOAD_CONFIG_PATH: configFile },
        parallel: false
      } satisfies Partial<RunCommandsOptions>
    },
    payload: {
      metadata: {
        description: 'Run a native Payload command',
        technologies: ['node']
      },
      executor: 'nx:run-commands',
      options: {
        command: 'npx payload',
        forwardAllArgs: true,
        cwd: projectRoot,
        env: { PAYLOAD_CONFIG_PATH: configFile }
      } satisfies Partial<RunCommandsOptions>
    },
    'payload-graphql': {
      metadata: {
        description: 'Run a native Payload GraphQL command',
        technologies: ['node']
      },
      executor: 'nx:run-commands',
      options: {
        command: 'npx payload-graphql',
        forwardAllArgs: true,
        cwd: projectRoot,
        env: { PAYLOAD_CONFIG_PATH: configFile }
      } satisfies Partial<RunCommandsOptions>
    },
    'dx:mongodb': {
      metadata: {
        description: `${dxPrefix} - Start a Mongo database in Docker container`,
        technologies: ['docker']
      },
      command: `(docker ps -q -f name=^mongodb-${projectName}$ | grep -q . || docker run --name mongodb-${projectName} --rm -d -p 27017:27017 mongo) && until docker exec mongodb-${projectName} mongosh --quiet --eval "db.runCommand({ ping: 1 })" > /dev/null 2>&1; do sleep 1; done`
    },
    'dx:postgres': {
      metadata: {
        description: `${dxPrefix} - Start a Postgres database in Docker container`,
        technologies: ['docker']
      },
      // Next's layering: shared values in `.env`, personal ones in `.env.local`,
      // each read when it exists and the later winning. Without the password
      // the container exits at once, and `--rm` takes its log with it
      command: `(docker ps -q -f name=^postgres-${projectName}$ | grep -q . || docker run --name postgres-${projectName} --rm -d $(for f in ${projectRoot}/.env ${projectRoot}/.env.local; do [ -f "$f" ] && printf -- '--env-file %s ' "$f"; done) -p 5432:5432 postgres) && until docker exec postgres-${projectName} pg_isready -q; do sleep 1; done`
    },
    'dx:start': {
      metadata: {
        description: `${dxPrefix} - Start Payload admin application and Mongo and Postgres databases in Docker containers`,
        technologies: ['docker']
      },
      command: `docker compose -f ${projectRoot}/docker-compose.yml up -d`
    },
    'dx:stop': {
      metadata: {
        description: `${dxPrefix} - Stop all Docker containers started by 'dx:start' target`,
        technologies: ['docker']
      },
      command: `docker compose -f ${projectRoot}/docker-compose.yml down`
    }
  };
}
