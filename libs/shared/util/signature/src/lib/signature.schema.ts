import { createLowercaseSchema } from '@codeware/shared/util/zod';
import { z } from 'zod';

export const SignatureSchema = z.object({
  'X-Device-Id': z
    .string()
    .uuid({ message: `Must be a valid UUID` })
    .describe(`Device identifier that won't change`),
  'X-Request-Id': z
    .string()
    .uuid({ message: `Must be a valid UUID` })
    .describe(
      `Request identifier unique for each request to prevent replay attacks`
    ),
  'X-Signature': z
    .string({
      message: `Must be a 64 character hexadecimal string`
    })
    .regex(/^[0-9a-fA-F]+$/)
    .length(64)
    .describe(`The actual signature to be verified by the server`),
  'X-Timestamp': z
    .string()
    .regex(/^\d{13}$/, 'Must be a 13-digit timestamp string')
    .describe(`The timestamp of the request to set a TTL on the signature`),
  'X-User-Agent': z
    .string()
    .describe(
      `Client user agent details to make it possible to identify request patterns`
    )
});

export const SignatureLowercaseSchema = createLowercaseSchema(SignatureSchema);

/**
 * The signature headers in their canonical form
 * that are used when generating the request headers.
 */
export type Signature = z.infer<typeof SignatureSchema>;

/**
 * The signature headers in their lowercase form
 * that are used when parsing the request headers.
 */
export type SignatureLowercase = z.infer<typeof SignatureLowercaseSchema>;
