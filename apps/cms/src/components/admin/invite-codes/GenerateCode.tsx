import type { UIFieldServerComponent } from 'payload';
import React from 'react';

import { GenerateCode } from './GenerateCode.client';

/** Button that generates an invite code into the create form */
const GenerateCodeField: UIFieldServerComponent = () => <GenerateCode />;

export default GenerateCodeField;
