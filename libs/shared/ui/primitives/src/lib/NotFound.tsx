import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { t } from '@codeware/shared/util/i18n';

/**
 * The site's pages in orbit around its home, one slot empty and that page
 * drifting away. Theme variables only, so it recolours with any tenant's
 * theme, and decorative: the heading says what it means.
 */
const lostPageSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-106 0 580 260" fill="none" aria-hidden="true"><defs><radialGradient id="not-found-glow"><stop offset="0" stop-color="var(--brand-400)" stop-opacity="0.35"/><stop offset="1" stop-color="var(--brand-400)" stop-opacity="0"/></radialGradient></defs><ellipse cx="412" cy="62" rx="62" ry="56" fill="url(#not-found-glow)"/><ellipse cx="184" cy="142" rx="146" ry="84" stroke="var(--muted-foreground)" stroke-width="2" opacity="0.3"/><circle cx="184" cy="142" r="30" fill="var(--card)" stroke="var(--border)" stroke-width="1.5"/><circle cx="184" cy="142" r="23" fill="var(--muted)"/><g transform="translate(172 130)" stroke="var(--muted-foreground)" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10 L12 3 L21 10 V20 A1 1 0 0 1 20 21 H4 A1 1 0 0 1 3 20 Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 21 V13 H15 V21"/></g><g transform="translate(46.8 170.7)"><rect x="-31" y="-24" width="62" height="48" rx="8" fill="var(--card)" stroke="var(--border)" stroke-width="1.5"/><path d="M-31 -16 a8 8 0 0 1 8 -8 h46 a8 8 0 0 1 8 8 v5.76 h-62 z" fill="var(--muted-foreground)" opacity="0.35"/><rect x="-21.08" y="-3.84" width="31" height="6.24" rx="3.12" fill="var(--foreground)" opacity="0.35"/><rect x="-21.08" y="7.68" width="40.92" height="4.8" rx="2.4" fill="var(--muted-foreground)" opacity="0.45"/></g><g transform="translate(134.1 63.1)"><rect x="-31" y="-24" width="62" height="48" rx="8" fill="var(--card)" stroke="var(--border)" stroke-width="1.5"/><path d="M-31 -16 a8 8 0 0 1 8 -8 h46 a8 8 0 0 1 8 8 v5.76 h-62 z" fill="var(--muted-foreground)" opacity="0.35"/><rect x="-21.08" y="-3.84" width="31" height="6.24" rx="3.12" fill="var(--foreground)" opacity="0.35"/><rect x="-21.08" y="7.68" width="40.92" height="4.8" rx="2.4" fill="var(--muted-foreground)" opacity="0.45"/></g><g transform="translate(171.3 225.7)"><rect x="-31" y="-24" width="62" height="48" rx="8" fill="var(--card)" stroke="var(--border)" stroke-width="1.5"/><path d="M-31 -16 a8 8 0 0 1 8 -8 h46 a8 8 0 0 1 8 8 v5.76 h-62 z" fill="var(--muted-foreground)" opacity="0.35"/><rect x="-21.08" y="-3.84" width="31" height="6.24" rx="3.12" fill="var(--foreground)" opacity="0.35"/><rect x="-21.08" y="7.68" width="40.92" height="4.8" rx="2.4" fill="var(--muted-foreground)" opacity="0.45"/></g><rect x="294.0" y="96.3" width="62" height="48" rx="8" fill="var(--background)" stroke="var(--muted-foreground)" stroke-width="2" opacity="0.5"/><circle cx="364.4" cy="106.4" r="2.0" fill="var(--brand-500)" opacity="0.26"/><circle cx="371.0" cy="96.1" r="2.4" fill="var(--brand-500)" opacity="0.37"/><circle cx="377.2" cy="87.9" r="2.9" fill="var(--brand-500)" opacity="0.49"/><circle cx="383.0" cy="81.7" r="3.3" fill="var(--brand-500)" opacity="0.60"/><circle cx="388.4" cy="77.6" r="3.7" fill="var(--brand-500)" opacity="0.72"/><g transform="translate(420 52) rotate(22)"><rect x="-31" y="-24" width="62" height="48" rx="8" fill="var(--card)" stroke="var(--border)" stroke-width="1.5"/><path d="M-31 -16 a8 8 0 0 1 8 -8 h46 a8 8 0 0 1 8 8 v5.76 h-62 z" fill="var(--brand-500)"/><rect x="-21.08" y="-3.84" width="31" height="6.24" rx="3.12" fill="var(--foreground)" opacity="0.8"/><rect x="-21.08" y="7.68" width="40.92" height="4.8" rx="2.4" fill="var(--muted-foreground)" opacity="0.45"/></g></svg>';

type NotFoundProps = {
  /**
   * Callback function when the "Go back home" button is clicked.
   * Implement this based on your framework's navigation.
   */
  onGoHome?: () => void;

  /**
   * The current locale used for translating UI strings.
   * Defaults to 'en' if not provided.
   *
   * @example 'en', 'sv'
   */
  locale?: string;
};

/**
 * Reusable 404 Not Found page component.
 *
 * A centered error page with a drawing of a lost page, a large "404"
 * heading and a button to return home.
 * Framework-agnostic and can be used anywhere in the monorepo.
 *
 * @example
 * ```tsx
 * // Next.js
 * import { NotFound } from '@codeware/shared/ui/primitives';
 * export default function NotFoundPage() {
 *   const router = useRouter();
 *   return <NotFound onGoHome={() => router.push('/')} />;
 * }
 *
 * // Remix
 * import { NotFound } from '@codeware/shared/ui/primitives';
 * export default function NotFoundRoute() {
 *   const navigate = useNavigate();
 *   return <NotFound onGoHome={() => navigate('/')} />;
 * }
 * ```
 */
export function NotFound({ onGoHome, locale = 'en' }: NotFoundProps) {
  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
      <div className="text-center">
        <div
          className="mx-auto mb-4 w-full max-w-sm [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: lostPageSvg }}
        />
        <div className="mb-8">
          <h1 className="text-foreground/10 mb-2 text-9xl font-bold tracking-tight">
            404
          </h1>
          <div className="relative -mt-20">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t(locale, 'notFound.title')}
            </h2>
            <p className="text-muted-foreground mt-4 text-lg">
              {t(locale, 'notFound.description')}
            </p>
          </div>
        </div>
        {onGoHome && (
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={onGoHome} size="lg">
              {t(locale, 'notFound.goHome')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
