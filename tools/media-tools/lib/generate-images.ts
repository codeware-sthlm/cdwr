import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  outro,
  select,
  spinner,
  text
} from '@clack/prompts';
import { withInfisical } from '@codeware/shared/feature/infisical';
import * as dotenv from 'dotenv';

import {
  CUSTOM_MODEL,
  MODELS,
  SHOTS,
  STYLE,
  type ShowcaseShot
} from './showcase-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../infisical/.env.infisical') });

/** Where generated files land, out of the repo and ignored by git. */
const OUTPUT_DIR = path.join(__dirname, '../../../.showcase-images');

/**
 * One folder per run, stamped and tagged with the tier.
 *
 * Runs never overwrite each other, so a set can be compared against the one
 * before it rather than replacing it — which is the whole point of drafting on
 * the cheap tier and then spending on the good one. The tier is in the name
 * because that is the comparison usually being made.
 */
function runDirectory(model: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tier = model.split('/').at(-1) ?? model;

  return path.join(OUTPUT_DIR, `${stamp}-${tier}`);
}

const SECRET_KEY = 'REPLICATE_API_TOKEN';

/** Not `/apps/cms`: this is an integration credential, not a CMS app secret. */
const SECRET_PATH = '/integrations';
const SECRET_ENV = 'development';

/**
 * Read the Replicate token from Infisical.
 *
 * Not from `~/.replicate-token`, and emphatically not from
 * `apps/cms/.env.local` — that file is tracked and locally modified, so a
 * secret placed there is one broad `git add` away from a commit.
 */
async function fetchToken(): Promise<string> {
  const secrets = await withInfisical({
    environment: SECRET_ENV,
    filter: { path: SECRET_PATH }
  });

  if (!secrets) {
    throw new Error('Could not connect to Infisical.');
  }

  const token = secrets.find((s) => s.secretKey === SECRET_KEY)?.secretValue;

  if (!token) {
    throw new Error(
      `No '${SECRET_KEY}' in Infisical at ${SECRET_PATH} (${SECRET_ENV}). ` +
        `Add it there, or point SECRET_PATH/SECRET_KEY at where it lives.`
    );
  }

  return token;
}

type Prediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: Array<string> | string;
  error?: string;
};

const REPLICATE = 'https://api.replicate.com/v1';

/**
 * Ask Replicate for one image and wait for it.
 *
 * Polled rather than streamed: this runs a handful of times by hand, and a
 * poll loop is easier to reason about than a websocket when it goes wrong.
 */
async function generate(
  shot: ShowcaseShot,
  model: string,
  token: string
): Promise<Uint8Array> {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    // Ask the API to hold the request open briefly, so a fast model often
    // answers without any polling at all
    Prefer: 'wait=60'
  };

  const [owner, rest] = model.split('/');
  const [name, version] = rest.split(':');
  const endpoint = version
    ? `${REPLICATE}/predictions`
    : `${REPLICATE}/models/${owner}/${name}/predictions`;

  const started = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...(version ? { version } : {}),
      input: {
        prompt: `${STYLE} ${shot.prompt}`,
        aspect_ratio: shot.aspectRatio,
        output_format: 'jpg'
      }
    })
  });

  if (!started.ok) {
    throw new Error(
      `Replicate refused '${shot.name}': ${started.status} ${await started.text()}`
    );
  }

  let prediction = (await started.json()) as Prediction;

  while (
    prediction.status === 'starting' ||
    prediction.status === 'processing'
  ) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const polled = await fetch(`${REPLICATE}/predictions/${prediction.id}`, {
      headers
    });
    prediction = (await polled.json()) as Prediction;
  }

  if (prediction.status !== 'succeeded') {
    throw new Error(
      `'${shot.name}' ${prediction.status}: ${prediction.error ?? 'no reason given'}`
    );
  }

  const url = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;

  if (!url) {
    throw new Error(`'${shot.name}' succeeded but returned no image.`);
  }

  const image = await fetch(url);

  if (!image.ok) {
    throw new Error(`Could not download '${shot.name}': ${image.status}`);
  }

  return new Uint8Array(await image.arrayBuffer());
}

/**
 * Generate the showcase imagery, to disk only.
 *
 * Uploading is deliberately not part of this. The gallery's examples are
 * rendered into Chromatic snapshots, so an image that changes on every run
 * would diff every story that shows one, with no code change to explain it.
 * Generate, look at what came back, then upload the ones worth keeping under
 * names the code already expects.
 */
async function main(): Promise<void> {
  intro('Generate showcase imagery');

  const selected = await multiselect<string>({
    message: 'Which shots? Each one costs money.',
    options: SHOTS.map((shot) => ({
      value: shot.name,
      label: shot.name,
      hint: shot.usedBy
    })),
    initialValues: SHOTS.map((shot) => shot.name),
    required: true
  });

  if (isCancel(selected)) {
    cancel('Nothing generated.');
    return;
  }

  const shots = SHOTS.filter((shot) => selected.includes(shot.name));

  // Defaulted to the draft tier: the cheap step is the one worth making easy
  const choice = await select<string>({
    message: 'Which tier?',
    options: MODELS.map(({ id, label, hint }) => ({ value: id, label, hint })),
    initialValue: MODELS[0].id
  });

  if (isCancel(choice)) {
    cancel('Nothing generated.');
    return;
  }

  let model = choice;

  if (choice === CUSTOM_MODEL) {
    const typed = await text({
      message: 'Model reference',
      placeholder: 'owner/name or owner/name:version',
      validate: (value) =>
        /^[\w.-]+\/[\w.-]+(:[\w]+)?$/.test(value.trim())
          ? undefined
          : 'Expected owner/name, optionally with :version'
    });

    if (isCancel(typed)) {
      cancel('Nothing generated.');
      return;
    }

    model = typed.trim();
  }

  log.info(
    `${shots.length} image${shots.length === 1 ? '' : 's'} from ${model}.\n` +
      `Every other tool here only touches infrastructure you already pay for.\n` +
      `This one bills per image, so the count above is what you are spending.`
  );

  const go = await confirm({ message: 'Generate them?', initialValue: false });

  if (isCancel(go) || !go) {
    cancel('Nothing generated.');
    return;
  }

  const token = await fetchToken();
  const runDir = runDirectory(model);
  mkdirSync(runDir, { recursive: true });

  const failures: Array<string> = [];
  const progress = spinner();

  for (const [index, shot] of shots.entries()) {
    progress.start(`${shot.name} (${index + 1}/${shots.length})`);

    try {
      const image = await generate(shot, model, token);
      const file = path.join(runDir, `${shot.name}.jpg`);
      writeFileSync(file, image);
      progress.stop(`${shot.name} → ${path.relative(process.cwd(), file)}`);
    } catch (error) {
      progress.stop(`${shot.name} failed`);
      log.error(error instanceof Error ? error.message : String(error));
      failures.push(shot.name);
    }
  }

  if (failures.length) {
    log.warn(`Did not generate: ${failures.join(', ')}`);
  }

  outro(
    `In ${path.relative(process.cwd(), runDir)}. ` +
      `Look at them, then upload the keepers to the showcase bucket yourself — ` +
      `these end up in Chromatic snapshots, so replacing one is a visual review.`
  );
}

// Export for use as a library
export { main as generateShowcaseImages };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
