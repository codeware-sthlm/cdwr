import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

import { CodeNames } from './code-names';
import {
  INFISICAL_STATES,
  type InfisicalRowState,
  type InfisicalStatusItem,
  type ProvisioningEnvironment
} from './infisical-status';

export type InfisicalStatusRowProps = {
  item: InfisicalStatusItem;
  labels: {
    states: Record<InfisicalRowState, string>;
    environments: Record<ProvisioningEnvironment, string>;
    /** Pre-formatted with the keys, e.g. "Optional settings: RESTRICTED_FONTS" */
    optionalKeys: (keys: string) => string;
  };
};

const BADGES = {
  ok: { variant: 'success', Icon: CheckCircleIcon },
  warning: { variant: 'warning', Icon: ExclamationTriangleIcon },
  error: { variant: 'destructive', Icon: XCircleIcon },
  neutral: { variant: 'muted', Icon: MinusCircleIcon }
} as const;

/**
 * One app folder, or one environment with nothing per app, in the sheet.
 *
 * Read-only: the facts come from one read of Infisical, and the panel that
 * opened the sheet is where it is read again.
 */
export function InfisicalStatusRow({ item, labels }: InfisicalStatusRowProps) {
  const tone =
    INFISICAL_STATES.find(({ state }) => state === item.state)?.tone ??
    'neutral';
  const { variant, Icon } = BADGES[tone];
  const environment = labels.environments[item.environment];

  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.app ? `${environment} · ${item.app}` : environment}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          <CodeNames
            text={[
              item.flyApp,
              item.optionalKeys.length
                ? labels.optionalKeys(item.optionalKeys.join(', '))
                : null
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        </p>
      </div>
      <Badge variant={variant} className="shrink-0">
        <Icon />
        {labels.states[item.state]}
      </Badge>
    </div>
  );
}
