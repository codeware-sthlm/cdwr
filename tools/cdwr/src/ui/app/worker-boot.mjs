// Worker threads do not inherit the tsx loader the CLI runs under, so the
// worker registers it itself before loading its TypeScript entry. The
// tsconfig comes from TSX_TSCONFIG_PATH, which the parent's tsx sets.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
