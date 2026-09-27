'use client';

import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import { Input } from '@codeware/shared/ui/shadcn/components/input';
import { Separator } from '@codeware/shared/ui/shadcn/components/separator';
import { cn } from '@codeware/shared/util/ui';

type ThemePreviewProps = {
  /** Id the scoped stylesheet targets */
  id: string;
  /** Adds the class the `dark:` variant keys off, so components invert too */
  dark?: boolean;
  className?: string;
};

/** The chart tokens have no renderer yet, so the swatches stand in for one. */
const CHART_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5'
];

/**
 * A page under the draft tokens.
 *
 * Deliberately not the real block renderer: those need a CMS document and a
 * provider, and the tokens are what is being judged, not the content. What this
 * does carry is every surface the tokens actually reach — the navbar and
 * headline off `--core-*`, prose and links, the shadcn control set, cards and
 * their hover state, tables, and the chart series — so a token that goes wrong
 * shows up here rather than after saving.
 *
 * Components are rendered at their default size on purpose: the small variants
 * round with `rounded-[min(var(--radius-md),10px)]`, which caps the radius and
 * hides most of what that control does.
 *
 * The `dark` class goes on the container rather than `<html>`, which is what
 * lets both schemes render side by side on one page.
 */
export function ThemePreview({ id, dark, className }: ThemePreviewProps) {
  return (
    <div
      id={id}
      className={cn(
        // `font-sans` restates the body face here, where this pane's own
        // tokens apply; inherited, it would be the page's
        'bg-core-background-body text-core-text overflow-hidden rounded-lg border font-sans',
        dark && 'dark',
        className
      )}
    >
      <div className="border-core-navbar-border bg-core-navbar flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-core-header text-sm font-semibold">Acme</span>
        <nav className="flex items-center gap-4 text-sm">
          <span className="text-core-nav-link-active font-medium">Home</span>
          <span className="text-core-nav-link">Articles</span>
          <span className="border-core-action-btn-border bg-core-action-btn-background text-core-action-btn-foreground rounded-full border px-2 py-1 text-xs">
            Aa
          </span>
        </nav>
      </div>

      {/* The content column sits inside the body surface, as RenderLayout does,
          so a layered theme reads as framed rather than uniform */}
      <div className="bg-core-background-content border-core-content-border mx-4 my-4 space-y-5 rounded-lg border px-5 py-6">
        <div>
          <h1 className="text-core-headline text-2xl font-bold tracking-tight">
            The quick brown fox
          </h1>
          <p className="text-core-text mt-2 text-sm leading-relaxed">
            Body copy sits on the content surface, with{' '}
            <span className="text-core-link underline">a link</span> and{' '}
            <span className="text-muted-foreground">secondary text</span>{' '}
            alongside it.
          </p>
          <blockquote className="border-border text-muted-foreground mt-3 border-l-2 pl-3 text-sm italic">
            Pull quotes and callouts take the prose tokens.
          </blockquote>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="ghost">Ghost</Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Error</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Focus me to see the ring" className="max-w-xs" />
          <Input placeholder="Disabled" disabled className="max-w-[10rem]" />
        </div>

        <Separator />

        <div className="grid gap-3 sm:grid-cols-2">
          {/* `--core-link`, not `--ring`: the ring is the focus affordance, and
              every interactive border the renderer actually draws — pill lists,
              tour places, card blocks — hovers to the link colour. Previewing a
              token nothing uses this way makes the preview a poor promise. */}
          <Card className="hover:border-core-link hover:bg-accent/40 cursor-pointer transition-colors">
            <CardHeader>
              <CardTitle className="text-base">Hover me</CardTitle>
              <CardDescription>
                Border and surface shift on hover.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              Cards, popovers and dropdowns share these tokens.
            </CardContent>
          </Card>

          <div className="bg-muted text-muted-foreground rounded-lg p-4 text-sm">
            <p className="text-foreground font-medium">Muted panel</p>
            <p className="mt-1">
              The pair most likely to fail contrast — muted text on a muted
              surface.
            </p>
            <p className="text-destructive-subtle mt-2">
              Something went wrong.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          {['Overview', 'Settings', 'Members'].map((row, index) => (
            <div
              key={row}
              className={cn(
                'hover:bg-accent hover:text-accent-foreground flex items-center justify-between px-3 py-2 text-sm transition-colors',
                index > 0 && 'border-t'
              )}
            >
              <span>{row}</span>
              <span className="text-muted-foreground text-xs">Updated</span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs">Chart series</p>
          <div className="flex gap-1.5">
            {CHART_TOKENS.map((token) => (
              <div
                key={token}
                title={token}
                className="h-8 flex-1 rounded-md"
                style={{ background: `var(${token})` }}
              />
            ))}
          </div>
        </div>

        <pre className="bg-secondary text-foreground overflow-x-auto rounded-lg border p-3 font-mono text-xs">
          {'const theme = buildThemeTokens(recipe);'}
        </pre>
      </div>

      <footer className="border-core-content-border text-muted-foreground border-t px-5 py-4 text-xs">
        Footer sits on the body surface, like the margins around the content.
      </footer>
    </div>
  );
}
