import type { Env } from '../env.schema';

import { payloadRequestOptions } from './payload-request';

const env: Env = {
  PAYLOAD_URL: 'http://cms.test',
  PAYLOAD_API_KEY: 'key',
  SIGNATURE_SECRET: 'secret',
  TENANT_ID: 'moon',
  DEPLOY_ENV: 'preview',
  DEBUG: true
};

describe('payloadRequestOptions', () => {
  it('carries the url, tenant key and signature inputs from the env', () => {
    const options = payloadRequestOptions(env);

    expect(options).toMatchObject({
      apiUrl: 'http://cms.test',
      debug: true,
      locale: 'en',
      tenantApiKey: 'key',
      signatureVertification: {
        deployEnv: 'preview',
        secret: 'secret',
        tenantId: 'moon',
        userAgent: null
      }
    });
  });

  it('takes the locale given', () => {
    expect(payloadRequestOptions(env, 'sv').locale).toBe('sv');
  });

  it('uses a fresh device id per call', () => {
    const a = payloadRequestOptions(env).signatureVertification;
    const b = payloadRequestOptions(env).signatureVertification;

    expect(a?.deviceId).toBeTruthy();
    expect(a?.deviceId).not.toBe(b?.deviceId);
  });
});
