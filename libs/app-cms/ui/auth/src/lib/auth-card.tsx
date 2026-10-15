import { CdwrCloud } from '@codeware/shared/ui/primitives';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import type { ReactNode } from 'react';

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
      <div className="flex flex-col items-center gap-2">
        <div className="text-foreground opacity-80">
          <CdwrCloud size={72} />
        </div>
        <span className="text-muted-foreground text-lg font-medium tracking-widest">
          Codeware CMS
        </span>
      </div>
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
