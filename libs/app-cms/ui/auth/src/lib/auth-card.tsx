import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import type { ReactNode } from 'react';

import { AuthBrand } from './auth-brand';

export type AuthCardProps = {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Links under the card, such as "Back to sign in" */
  footer?: ReactNode;
};

/** The single centred card every auth page sits in, under the platform's mark */
export function AuthCard({
  title,
  description,
  children,
  footer
}: AuthCardProps) {
  return (
    <div className="flex w-full flex-col gap-6">
      <AuthBrand />
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        {children && <CardContent>{children}</CardContent>}
      </Card>
      {footer && (
        <div className="text-muted-foreground [&_a:hover]:text-foreground flex flex-col items-center gap-2 text-center text-sm [&_a]:underline [&_a]:underline-offset-4">
          {footer}
        </div>
      )}
    </div>
  );
}
