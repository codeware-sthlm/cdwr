import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/login';

/**
 * Uploads are capped at 25 MB, and a larger one must be refused whole. Cut off
 * at the limit instead, it would be stored truncated and still report success.
 */
test.describe('Uploads — size limit', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('refuses a file over 25 MB instead of storing it cut off', async ({
    page
  }) => {
    await loginAs(page, 'systemUser');

    const res = await page.request.post('/api/media', {
      multipart: {
        file: {
          name: 'too-large.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.alloc(26 * 1024 * 1024)
        }
      }
    });

    expect(res.status()).toBe(413);
  });
});
