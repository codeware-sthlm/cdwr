import { customT } from '@codeware/app-cms/util/i18n';
import {
  type DeploymentNameIssue,
  MAX_DEPLOYMENT_NAME_LENGTH,
  deploymentNameIssue
} from '@codeware/shared/util/pure';
import type { TextField, TextFieldSingleValidation } from 'payload';

const messageKey = {
  characters: 'validation:deploymentCharacters',
  hyphens: 'validation:deploymentHyphens',
  reserved: 'validation:deploymentReserved',
  'too-long': 'validation:deploymentTooLong'
} as const satisfies Record<Exclude<DeploymentNameIssue, 'empty'>, string>;

const validateDeployment: TextFieldSingleValidation = (value, { req }) => {
  // The field is optional: a workspace that is never deployed has no name
  if (!value) {
    return true;
  }

  const issue = deploymentNameIssue(value);

  if (!issue || issue === 'empty') {
    return true;
  }

  return customT(req.t)(messageKey[issue], {
    name: value,
    max: String(MAX_DEPLOYMENT_NAME_LENGTH)
  });
};

/**
 * The name a workspace is deployed under.
 *
 * It is the workspace's folder in Infisical and the ending of its Fly app
 * names, which is also what ties the two together — nothing else records which
 * folder belongs to which workspace, and the slug is not it: the `demo`
 * deployment serves a workspace whose slug is `star-wars`.
 *
 * Writable while empty and fixed once set. Renaming would not move anything; it
 * would leave the old Fly apps and their settings behind under the old name,
 * and deploy a second copy under the new one. Enforced by field access, so it
 * holds for the API as well as the form: an update that tries to change it is
 * accepted with the old value kept.
 */
export const deploymentField: TextField = {
  name: 'deployment',
  type: 'text',
  unique: true,
  label: { en: 'Deployment name', sv: 'Namn för driftsättning' },
  validate: validateDeployment,
  access: {
    update: ({ doc }) => !doc?.deployment
  },
  admin: {
    description: {
      en: 'The name this workspace is deployed under: its folder in Infisical and the end of its Fly app names, so "demo" deploys as "cdwr-cms-demo". Lowercase letters, digits and hyphens. It cannot be changed once saved, because a new name would leave the old apps and settings behind.',
      sv: 'Namnet som arbetsytan driftsätts under: mappnamnet i Infisical och slutet på Fly-apparnas namn, så att "demo" driftsätts som "cdwr-cms-demo". Använd små bokstäver, siffror och bindestreck. Namnet kan inte ändras när det väl har sparats, eftersom ett nytt namn skulle lämna de gamla apparna och inställningarna kvar.'
    }
  }
};
