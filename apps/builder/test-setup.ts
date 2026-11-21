// `@tailwindcss/node` registers a module hook as it loads, and Jest from 30.5
// replaces `module.register` and `module.registerHooks` with functions that
// throw. Blanking them makes Tailwind skip its hook, as it did before: the
// hook only busts its own ESM cache, which a test doesn't need. Assigned, not
// deleted, since Jest's module class would then inherit Node's real ones.
const nodeModule = require('module');

nodeModule.register = undefined;
nodeModule.registerHooks = undefined;
