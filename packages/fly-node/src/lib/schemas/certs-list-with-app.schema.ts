import { withCamelCase } from '@codeware/shared/util/zod';
import { z } from 'zod';

import {
  CertsListFlyResponseElementSchema,
  withClientStatus
} from './certs-list.schema';

/**
 * certs list response extended with application name
 */
export const CertsListWithAppTransformedResponseSchema = z.array(
  withCamelCase(
    withClientStatus(
      CertsListFlyResponseElementSchema.extend({
        app: z.string()
      })
    )
  )
);
