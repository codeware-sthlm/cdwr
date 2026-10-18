import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { QUEUE_FILES } from './agent.logic';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

// The image copies the queue files by name; a file install copies but the image lacks breaks the container
describe('agent-host image', () => {
  const dockerfile = read('../../../../../apps/agent-host/Dockerfile');
  const ignore = read('../../../../../apps/agent-host/Dockerfile.dockerignore');

  it.each(QUEUE_FILES)('copies %s', (file) => {
    expect(dockerfile).toContain(`tools/cdwr/agent-queue/${file}`);
    expect(ignore).toContain(`!/tools/cdwr/agent-queue/${file}`);
  });
});
