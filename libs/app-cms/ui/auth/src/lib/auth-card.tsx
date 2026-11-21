import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import { cn } from '@codeware/shared/util/ui';
import type { ReactNode } from 'react';

import { AuthBrand } from './auth-brand';

export type AuthCardProps = {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Links under the card, such as "Back to sign in" */
  footer?: ReactNode;
  /** `wide` drops the card for a page-width layout under a larger head */
  size?: 'narrow' | 'wide';
};

/** The single centred card every auth page sits in, under the platform's mark */
export function AuthCard({
  title,
  description,
  children,
  footer,
  size = 'narrow'
}: AuthCardProps) {
  const wide = size === 'wide';

  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col',
        wide ? 'max-w-3xl gap-8' : 'max-w-md gap-6'
      )}
    >
      {wide ? (
        <>
          <header className="flex flex-col items-center gap-4 text-center">
            <AuthBrand />
            <h1 className="text-2xl font-semibold">{title}</h1>
            {description && (
              <p className="text-muted-foreground max-w-prose text-balance">
                {description}
              </p>
            )}
          </header>
          {children}
        </>
      ) : (
        <>
          <AuthBrand />
          <Card>
            <CardHeader className="text-center">
              {/* Each auth page's only heading; `CardTitle` alone is a div */}
              <CardTitle className="text-xl">
                <h1>{title}</h1>
              </CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            {children && <CardContent>{children}</CardContent>}
          </Card>
        </>
      )}
      {footer && (
        <div className="text-muted-foreground [&_a:hover]:text-foreground flex flex-col items-center gap-2 text-center text-sm [&_a]:underline [&_a]:underline-offset-4">
          {footer}
        </div>
      )}
    </div>
  );
}
