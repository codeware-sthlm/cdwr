import { createCsrfMiddleware, createStart } from '@tanstack/react-start';

import { securityMiddleware } from './server/request-middleware';

// Setting `requestMiddleware` replaces Start's default, which is this one
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn'
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, securityMiddleware]
}));
