'use client';

import {
  ToggleGroup,
  ToggleGroupItem
} from '@codeware/shared/ui/shadcn/components/toggle-group';

import type { SiteStatsPeriod } from './types';

export type SiteStatsPeriodToggleProps = {
  period: SiteStatsPeriod;
  onPeriodChange: (period: SiteStatsPeriod) => void;
  labels: {
    /** Accessible name of the toggle */
    period: string;
    week: string;
    month: string;
  };
};

const PERIODS = ['week', 'month'] as const satisfies readonly SiteStatsPeriod[];

/** The 7 or 30 days switch; one option is always active */
export function SiteStatsPeriodToggle({
  period,
  onPeriodChange,
  labels
}: SiteStatsPeriodToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={period}
      onValueChange={(next) => {
        const chosen = PERIODS.find((option) => option === next);
        if (chosen) onPeriodChange(chosen);
      }}
      aria-label={labels.period}
      className="bg-muted self-start rounded-lg p-0.5"
    >
      {PERIODS.map((option) => (
        <ToggleGroupItem
          key={option}
          value={option}
          className="text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground h-7 rounded-md px-3 text-xs hover:bg-transparent data-[state=on]:shadow-sm"
        >
          {labels[option]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
