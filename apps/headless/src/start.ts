import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware
} from '@sentry/tanstackstart-react';
import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

import { securityMiddleware } from './server/request-middleware';

// Setting `requestMiddleware` replaces Start's default, which is this one
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn'
});

// Sentry's go first, so they also see what the others throw
export const startInstance = createStart(() => ({
  requestMiddleware: [
    sentryGlobalRequestMiddleware,
    csrfMiddleware,
    securityMiddleware
  ],
  functionMiddleware: [sentryGlobalFunctionMiddleware]
}));
