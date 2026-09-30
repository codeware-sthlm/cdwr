import { createPayloadTargets } from './create-payload-targets';

describe('createPayloadTargets', () => {
  const base = {
    projectName: 'my-app',
    projectRoot: 'apps/my-app',
    configFile: 'src/payload.config.ts'
  };

  describe('gen target', () => {
    it('should only run generate:types when graphQL is disabled', () => {
      const { gen } = createPayloadTargets({
        ...base,
        isGraphQLDisabled: true
      });
      expect(gen.options['commands']).toEqual(['npx payload generate:types']);
    });

    it('should run generate:types and generate:schema when graphQL is enabled', () => {
      const { gen } = createPayloadTargets({
        ...base,
        isGraphQLDisabled: false
      });
      expect(gen.options['commands']).toEqual([
        'npx payload generate:types',
        'npx payload-graphql generate:schema'
      ]);
    });

    it('should include graphQL schema command when isGraphQLDisabled is not specified', () => {
      const { gen } = createPayloadTargets(base);
      expect(gen.options['commands']).toEqual([
        'npx payload generate:types',
        'npx payload-graphql generate:schema'
      ]);
    });

    it('should set PAYLOAD_CONFIG_PATH env var', () => {
      const { gen } = createPayloadTargets(base);
      expect(gen.options['env']['PAYLOAD_CONFIG_PATH']).toBe(
        'src/payload.config.ts'
      );
    });

    it('should run in the project root', () => {
      const { gen } = createPayloadTargets(base);
      expect(gen.options['cwd']).toBe('apps/my-app');
    });

    it('should use the config file as input', () => {
      const { gen } = createPayloadTargets(base);
      expect(gen.inputs).toContain('{projectRoot}/src/payload.config.ts');
    });

    it('should run commands sequentially', () => {
      const { gen } = createPayloadTargets(base);
      expect(gen.options['parallel']).toBe(false);
    });
  });

  describe('payload target', () => {
    it('should forward all args', () => {
      const { payload } = createPayloadTargets(base);
      expect(payload.options['forwardAllArgs']).toBe(true);
    });

    it('should set PAYLOAD_CONFIG_PATH env var', () => {
      const { payload } = createPayloadTargets(base);
      expect(payload.options['env']['PAYLOAD_CONFIG_PATH']).toBe(
        'src/payload.config.ts'
      );
    });
  });

  describe('dx targets', () => {
    it('should scope mongodb container name to the project', () => {
      const targets = createPayloadTargets(base);
      expect(targets['dx:mongodb'].command).toContain('mongodb-my-app');
    });

    it('should scope postgres container name to the project', () => {
      const targets = createPayloadTargets(base);
      expect(targets['dx:postgres'].command).toContain('postgres-my-app');
    });

    it('should reference the project docker-compose.yml in dx:start', () => {
      const targets = createPayloadTargets(base);
      expect(targets['dx:start'].command).toContain(
        'apps/my-app/docker-compose.yml'
      );
    });

    it('should reference the project docker-compose.yml in dx:stop', () => {
      const targets = createPayloadTargets(base);
      expect(targets['dx:stop'].command).toContain(
        'apps/my-app/docker-compose.yml'
      );
    });

    it('should read the postgres env files from the project root, .env first', () => {
      const command = createPayloadTargets(base)['dx:postgres'].command;
      expect(command).toContain('apps/my-app/.env apps/my-app/.env.local');
    });
  });

  describe('all 7 targets are present', () => {
    it('should return gen, payload, payload-graphql, dx:mongodb, dx:postgres, dx:start, dx:stop', () => {
      const targets = createPayloadTargets(base);
      expect(Object.keys(targets).sort()).toEqual([
        'dx:mongodb',
        'dx:postgres',
        'dx:start',
        'dx:stop',
        'gen',
        'payload',
        'payload-graphql'
      ]);
    });
  });
});
