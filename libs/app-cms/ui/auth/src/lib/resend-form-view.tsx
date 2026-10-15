import { Alert } from '@codeware/shared/ui/shadcn/components/alert';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Field,
  FieldGroup,
  FieldLabel
} from '@codeware/shared/ui/shadcn/components/field';
import { Input } from '@codeware/shared/ui/shadcn/components/input';
import type { FormEvent, ReactNode } from 'react';

import { AuthCard } from './auth-card';
import type { AuthFormStatus } from './types';

export type ResendFormLabels = {
  title: string;
  intro: string;
  email: string;
  submit: string;
  submitting: string;
  done: string;
};

export type ResendFormViewProps = {
  labels: ResendFormLabels;
  email: string;
  status: AuthFormStatus;
  /** Why the request was refused, shown above the form */
  refusal?: string | null;
  /** False while the form cannot be sent, such as an unsolved human check */
  canSubmit?: boolean;
  /** The human check widget */
  humanCheck?: ReactNode;
  /** Links under the card */
  footer?: ReactNode;
  onChange: (email: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** Asks for the confirmation mail again */
export function ResendFormView({
  labels,
  email,
  status,
  refusal,
  canSubmit = true,
  humanCheck,
  footer,
  onChange,
  onSubmit
}: ResendFormViewProps) {
  if (status === 'sent') {
    return (
      <AuthCard
        title={labels.title}
        description={labels.done}
        footer={footer}
      />
    );
  }

  const submitting = status === 'submitting';

  return (
    <AuthCard title={labels.title} description={labels.intro} footer={footer}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          {status === 'refused' && refusal && (
            <Alert variant="destructive">{refusal}</Alert>
          )}

          <Field>
            <FieldLabel htmlFor="resend-email">{labels.email}</FieldLabel>
            <Input
              id="resend-email"
              type="email"
              value={email}
              onChange={(event) => onChange(event.target.value)}
              autoComplete="email"
              required
            />
          </Field>

          {humanCheck}

          <Button type="submit" disabled={submitting || !canSubmit}>
            {submitting ? labels.submitting : labels.submit}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
