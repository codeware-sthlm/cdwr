import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { UIFieldServerComponent } from 'payload';
import React from 'react';

import { isProvisioningEnvironment } from '../../../provisioning/read-infisical-status';

import { InfisicalPanel } from './InfisicalPanel.client';

/**
 * A workspace's Infisical setup, beside its domains.
 *
 * Host mode on a deployed app only, like the endpoint it calls. A local
 * database's keys are in no Infisical environment, and a tenant deployment has
 * no business reading tenant folders.
 */
const InfisicalField: UIFieldServerComponent = ({ i18n }) => {
  const { APP_MODE, DEPLOY_ENV } = getEnv();

  return APP_MODE.type === 'host' && isProvisioningEnvironment(DEPLOY_ENV) ? (
    <InfisicalPanel language={i18n.language} />
  ) : null;
};

export default InfisicalField;
