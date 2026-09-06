import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { Card, CardContent } from '@codeware/shared/ui/shadcn/components/card';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export type RestartCardProps = {
  /** Fly apps with at least one active certificate */
  apps: Array<string>;
  hint: string;
  restartLabel: string;
  /** The app currently restarting, which is the one that spins */
  runningApp?: string | null;
  disabled?: boolean;
  onRestart: (app: string) => void;
};

/**
 * Restart the apps behind the validated domains.
 *
 * Grouped by app rather than one button per domain row — several domains can
 * share an app, and two buttons for the same restart would read as two
 * different actions.
 */
export function RestartCard({
  apps,
  hint,
  restartLabel,
  runningApp,
  disabled = false,
  onRestart
}: RestartCardProps) {
  if (!apps.length) {
    return null;
  }

  return (
    <Card variant="bordered" className="gap-0 py-0">
      <CardContent className="flex flex-col gap-2.5 px-4 py-3.5">
        <p className="text-muted-foreground">{hint}</p>
        {apps.map((app) => (
          <div
            key={app}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="font-medium">{app}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onRestart(app)}
            >
              <ArrowPathIcon
                className={
                  runningApp === app ? 'size-4 animate-spin' : 'size-4'
                }
              />
              {restartLabel}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
