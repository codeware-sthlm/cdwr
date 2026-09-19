import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { stamp } from '../../services/backups';
import { readSecret } from '../../services/infisical';
import {
  type Prediction,
  createPrediction,
  downloadOutput,
  pollPrediction
} from '../../services/replicate';

import { CUSTOM_MODEL, MODELS, SHOTS, STYLE } from './showcase-manifest';

/** Folder tag: the model's own name, without its owner */
export const tierOf = (model: string): string =>
  model.split('/').at(-1) ?? model;

const MODEL_PATTERN = /^[\w.-]+\/[\w.-]+(:[\w]+)?$/;

export default defineCommand({
  summary: 'Generate showcase imagery with Replicate',
  description:
    'Draws the shots in the showcase manifest through a Replicate model and writes them to disk.',
  danger: 'spends-money',
  needs: ['infisical'],
  inputs: {
    shots: input.multiselect<string>({
      prompt: 'Which shots? Each one costs money.',
      min: 1,
      initial: SHOTS.map((shot) => shot.name),
      choices: () =>
        SHOTS.map((shot) => ({
          value: shot.name,
          label: shot.name,
          hint: shot.usedBy
        }))
    }),
    model: input.select<string>({
      prompt: 'Which tier?',
      initial: MODELS[0]?.id,
      choices: () =>
        MODELS.map(({ id, label, hint }) => ({ value: id, label, hint }))
    }),
    customModel: input.optional(
      input.string({
        prompt: 'Model reference',
        placeholder: 'owner/name or owner/name:version',
        schema: z
          .string()
          .regex(MODEL_PATTERN, 'Expected owner/name, optionally with :version')
      }),
      (r) => r['model'] === CUSTOM_MODEL
    )
  },

  async plan(ctx, { shots: names, model, customModel }) {
    const shots = SHOTS.filter((shot) => names.includes(shot.name));
    const resolvedModel = model === CUSTOM_MODEL ? customModel : model;
    if (!resolvedModel) {
      throw new Error('--custom-model is required when --model is custom');
    }
    const dir = join(
      ctx.root,
      '.showcase-images',
      `${stamp()}-${tierOf(resolvedModel)}`
    );

    return {
      steps: shots.map(
        (shot) =>
          `Generate ${shot.name} (${shot.aspectRatio}) with ${resolvedModel}`
      ),
      notes: [
        `${shots.length} image${shots.length === 1 ? '' : 's'} from ${resolvedModel}. Every other command here only touches infrastructure you already pay for; this one bills per image.`
      ],
      data: { shots, model: resolvedModel, dir }
    };
  },

  async apply(ctx, { shots, model, dir }) {
    const token = await readSecret(
      'development',
      '/integrations',
      'REPLICATE_API_TOKEN'
    );
    mkdirSync(dir, { recursive: true });

    const files: string[] = [];
    const failures: string[] = [];

    for (const shot of shots) {
      try {
        const file = await ctx.ui.task(
          shot.name,
          async () => {
            const started = await createPrediction(token, model, shot, STYLE);
            const finished: Prediction = await pollPrediction(
              token,
              started.id,
              started
            );
            if (finished.status !== 'succeeded') {
              throw new Error(
                `'${shot.name}' ${finished.status}: ${finished.error ?? 'no reason given'}`
              );
            }
            const image = await downloadOutput(finished);
            const target = join(dir, `${shot.name}.jpg`);
            writeFileSync(target, image);
            return target;
          },
          (target) => `${shot.name} -> ${relative(ctx.root, target)}`
        );
        files.push(file);
      } catch {
        failures.push(shot.name);
      }
    }

    if (failures.length)
      ctx.ui.warn(`Did not generate: ${failures.join(', ')}`);

    const where = relative(ctx.root, dir);
    return {
      summary: files.length
        ? `Generated ${files.length} of ${shots.length} image(s) in ${where}`
        : `Generated 0 of ${shots.length} image(s)`,
      // Uploading is deliberately not part of this: the gallery's examples end
      // up in Chromatic snapshots, so replacing one is a deliberate visual
      // review, not something this command should do for you.
      next: files.length
        ? [
            'Look at them, then upload the keepers to the showcase bucket yourself.'
          ]
        : undefined,
      partial: failures.length > 0,
      json: files.map((f) => relative(ctx.root, f))
    };
  }
});
