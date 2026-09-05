'use client';

import { isValidTokenValue } from '@codeware/shared/theme';
import { ColorField } from '@codeware/shared/ui/color-picker';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { Input } from '@codeware/shared/ui/shadcn/components/input';
import {
  Tabs,
  TabsList,
  TabsTrigger
} from '@codeware/shared/ui/shadcn/components/tabs';
import { type ThemeTokens, resolveToken } from '@codeware/shared/util/color';
import { cn } from '@codeware/shared/util/ui';
import { RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

export type ThemeOverrides = { light: ThemeTokens; dark: ThemeTokens };

/**
 * Record one hand-edit, keeping the override set as small as it can be.
 *
 * An edit back to the generated value is a removal, not a store: leaving it in
 * would silently pin the token, and a later change of brand or base would skip
 * it for no reason the author could see. Clearing the field does the same.
 */
export function applyTokenEdit(
  overrides: ThemeOverrides,
  generated: ThemeOverrides,
  scheme: 'light' | 'dark',
  name: string,
  value: string
): ThemeOverrides {
  const next = { ...overrides[scheme] };

  if (value === '' || value === generated[scheme][name]) {
    delete next[name];
  } else {
    next[name] = value;
  }

  return { ...overrides, [scheme]: next };
}

/** What is wrong with a token, per scheme, keyed by token name. */
export type TokenIssues = {
  light: Record<string, Array<string>>;
  dark: Record<string, Array<string>>;
};

type OverridePanelProps = {
  /** What the recipe produced, before overrides */
  generated: ThemeOverrides;
  overrides: ThemeOverrides;
  /**
   * Failing contrast pairs and dangling aliases, by the token they implicate.
   *
   * The reports above say what is wrong with the theme; without this the author
   * still has to work out which of ninety rows to edit, and a token that fails
   * on the recipe alone carries no other mark at all.
   */
  issues?: TokenIssues;
  onChange: (overrides: ThemeOverrides) => void;
};

/**
 * Edit single tokens the recipe cannot express.
 *
 * The escape hatch, not the main road: four decisions cover a whole theme, and
 * anything set here stops following the recipe, so a later change of brand or
 * base leaves it behind. Overridden rows say so.
 *
 * Only the light scheme lists every token — dark carries just what it changes,
 * and adding a token there that light already covers would be a no-op the
 * cascade throws away.
 */
export function OverridePanel({
  generated,
  overrides,
  issues,
  onChange
}: OverridePanelProps) {
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');
  const [filter, setFilter] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);

  const schemeIssues = issues?.[scheme] ?? {};
  const issueCount = Object.keys(schemeIssues).filter(
    (name) => name in generated[scheme]
  ).length;

  const names = Object.keys(generated[scheme]).filter(
    (name) =>
      name.includes(filter.trim()) && (!onlyIssues || name in schemeIssues)
  );

  const setToken = (name: string, value: string) =>
    onChange(applyTokenEdit(overrides, generated, scheme, name, value));

  // What the browser will see, so a picker opening on `var(--primary)` follows
  // it to a colour. Dark holds only what it changes, so it is read over light —
  // reading the dark map alone would lose every token it inherits.
  const cascaded = useMemo(() => {
    const merged = (of: 'light' | 'dark') => ({
      ...generated[of],
      ...overrides[of]
    });
    const light = merged('light');
    return scheme === 'dark' ? { ...light, ...merged('dark') } : light;
  }, [generated, overrides, scheme]);

  const overriddenCount = Object.keys(overrides[scheme]).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Tabs
        value={scheme}
        onValueChange={(value) => setScheme(value as 'light' | 'dark')}
      >
        <TabsList className="w-full">
          <TabsTrigger value="light" className="flex-1">
            Light
          </TabsTrigger>
          <TabsTrigger value="dark" className="flex-1">
            Dark
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2">
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter tokens"
          className="h-8 text-xs"
        />
        {overriddenCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => onChange({ ...overrides, [scheme]: {} })}
          >
            Reset {overriddenCount}
          </Button>
        )}
      </div>

      {issueCount > 0 && (
        // Marking a row is only half of it — ninety rows is too many to scan
        // for the marks, so the count doubles as the way to see just those
        <Button
          size="sm"
          variant={onlyIssues ? 'default' : 'outline'}
          className="w-full"
          aria-pressed={onlyIssues}
          onClick={() => setOnlyIssues((shown) => !shown)}
        >
          <TriangleAlertIcon className="size-3.5" />
          {onlyIssues ? 'Showing' : 'Show'} {issueCount} with issues
        </Button>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-1 pr-3">
          {names.map((name) => {
            const overridden = name in overrides[scheme];
            const value = overridden
              ? overrides[scheme][name]
              : generated[scheme][name];
            const invalid = overridden && !isValidTokenValue(value);
            const tokenIssues = schemeIssues[name] ?? [];

            return (
              // Name above the value rather than beside it: a token value is
              // long and the name is longer, and side by side they were
              // competing for a width the host shrinks under us
              <div
                key={name}
                data-edited={overridden || undefined}
                className={cn(
                  // Transparent rather than absent, so marking a row does not
                  // shift the ones around it
                  'space-y-1 rounded-md border-l-2 border-transparent px-1.5 py-1.5',
                  tokenIssues.length
                    ? 'border-l-destructive bg-destructive/5'
                    : overridden
                      ? 'border-l-primary bg-primary/5'
                      : 'hover:bg-accent/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <code
                    className={cn(
                      'min-w-0 flex-1 truncate text-xs',
                      overridden
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground'
                    )}
                    title={name}
                  >
                    {name}
                  </code>
                  {tokenIssues.length > 0 && (
                    <span
                      className="bg-destructive/10 text-destructive-subtle flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
                      title={tokenIssues.join('\n')}
                    >
                      <TriangleAlertIcon className="size-3" />
                      {tokenIssues.length > 1 ? tokenIssues.length : 'Issue'}
                    </span>
                  )}
                  {overridden && (
                    <span className="bg-primary/10 text-primary shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium">
                      Edited
                    </span>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 shrink-0"
                    disabled={!overridden}
                    aria-label={`Reset ${name}`}
                    onClick={() => setToken(name, '')}
                  >
                    <RotateCcwIcon className="size-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={value}
                    onChange={(event) => setToken(name, event.target.value)}
                    aria-label={name}
                    aria-invalid={invalid}
                    className={cn(
                      'h-8 min-w-0 flex-1 font-mono text-xs',
                      invalid && 'border-destructive'
                    )}
                  />
                  <ColorField
                    value={value}
                    resolved={resolveToken(cascaded, name) ?? undefined}
                    onChange={(picked) => setToken(name, picked)}
                    label={name}
                    className="shrink-0"
                  />
                </div>
              </div>
            );
          })}

          {names.length === 0 && (
            <p className="text-muted-foreground py-4 text-center text-xs">
              {onlyIssues && !filter.trim()
                ? 'Nothing flagged in this scheme.'
                : `No token matches “${filter}”.`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
