import { Alert } from '@codeware/shared/ui/shadcn/components/alert';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from '@codeware/shared/ui/shadcn/components/field';
import { Input } from '@codeware/shared/ui/shadcn/components/input';
import type { FormEvent, ReactNode } from 'react';

import { AuthCard } from './auth-card';
import type { AuthFormStatus } from './types';

export type SignupValues = {
  code: string;
  name: string;
  email: string;
  password: string;
  siteName: string;
  deployment: string;
};

export type SignupField = keyof SignupValues;

export type SignupFormLabels = {
  title: string;
  intro: string;
  code: string;
  name: string;
  email: string;
  password: string;
  passwordHint: string;
  siteName: string;
  deployment: string;
  deploymentHint: string;
  sectionInvite: string;
  sectionYou: string;
  sectionSite: string;
  inviteCodeHelp: string;
  /** The sentence after the site's address */
  addressPreview: string;
  availabilityChecking: string;
  availabilityAvailable: string;
  availabilityTaken: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
};

/** What the server said about the current site address, once it was asked */
export type SignupAvailability = 'checking' | 'available' | 'taken';

export type SignupFormViewProps = {
  labels: SignupFormLabels;
  values: SignupValues;
  /** Messages worded next to the field they are about */
  fieldErrors?: Partial<
    Record<'email' | 'password' | 'siteName' | 'deployment', string>
  >;
  /** The site's address as visitors will reach it, once the value is well-formed */
  siteUrl?: string;
  /** Whether the current site address is free; omitted until it is asked */
  availability?: SignupAvailability;
  status: AuthFormStatus;
  /** The refusal that is not about one field, shown above the form */
  refusal?: string | null;
  /** False while the form cannot be sent, such as an unsolved human check */
  canSubmit?: boolean;
  /** The human check widget */
  humanCheck?: ReactNode;
  /** Links under the form */
  footer?: ReactNode;
  /** Links under the confirmation */
  sentFooter?: ReactNode;
  onChange: (field: SignupField, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** The signup form, which turns an invite code into a pending site */
export function SignupFormView({
  labels,
  values,
  fieldErrors = {},
  siteUrl,
  availability,
  status,
  refusal,
  canSubmit = true,
  humanCheck,
  footer,
  sentFooter,
  onChange,
  onSubmit
}: SignupFormViewProps) {
  if (status === 'sent') {
    return (
      <AuthCard
        title={labels.successTitle}
        description={labels.successBody}
        footer={sentFooter}
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

          <FieldSet>
            <FieldLegend>{labels.sectionInvite}</FieldLegend>
            <Field>
              <FieldLabel htmlFor="signup-code">{labels.code}</FieldLabel>
              <Input
                id="signup-code"
                value={values.code}
                onChange={(event) => onChange('code', event.target.value)}
                autoComplete="off"
                required
              />
              <FieldDescription>{labels.inviteCodeHelp}</FieldDescription>
            </Field>
          </FieldSet>

          <FieldSet>
            <FieldLegend>{labels.sectionYou}</FieldLegend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="signup-name">{labels.name}</FieldLabel>
                <Input
                  id="signup-name"
                  value={values.name}
                  onChange={(event) => onChange('name', event.target.value)}
                  autoComplete="name"
                  required
                />
              </Field>

              <Field data-invalid={fieldErrors.email ? true : undefined}>
                <FieldLabel htmlFor="signup-email">{labels.email}</FieldLabel>
                <Input
                  id="signup-email"
                  type="email"
                  value={values.email}
                  onChange={(event) => onChange('email', event.target.value)}
                  autoComplete="email"
                  aria-invalid={fieldErrors.email !== undefined}
                  required
                />
                <FieldError>{fieldErrors.email}</FieldError>
              </Field>
            </div>

            <Field data-invalid={fieldErrors.password ? true : undefined}>
              <FieldLabel htmlFor="signup-password">
                {labels.password}
              </FieldLabel>
              <Input
                id="signup-password"
                type="password"
                value={values.password}
                onChange={(event) => onChange('password', event.target.value)}
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                aria-invalid={fieldErrors.password !== undefined}
                required
              />
              {fieldErrors.password ? (
                <FieldError>{fieldErrors.password}</FieldError>
              ) : (
                <FieldDescription>{labels.passwordHint}</FieldDescription>
              )}
            </Field>
          </FieldSet>

          <FieldSet>
            <FieldLegend>{labels.sectionSite}</FieldLegend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={fieldErrors.siteName ? true : undefined}>
                <FieldLabel htmlFor="signup-site-name">
                  {labels.siteName}
                </FieldLabel>
                <Input
                  id="signup-site-name"
                  value={values.siteName}
                  onChange={(event) => onChange('siteName', event.target.value)}
                  aria-invalid={fieldErrors.siteName !== undefined}
                  required
                />
                <FieldError>{fieldErrors.siteName}</FieldError>
              </Field>

              <Field
                data-invalid={
                  fieldErrors.deployment || availability === 'taken'
                    ? true
                    : undefined
                }
              >
                <FieldLabel htmlFor="signup-deployment">
                  {labels.deployment}
                </FieldLabel>
                <Input
                  id="signup-deployment"
                  value={values.deployment}
                  onChange={(event) =>
                    onChange('deployment', event.target.value)
                  }
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={
                    fieldErrors.deployment !== undefined ||
                    availability === 'taken'
                  }
                  required
                />
                <FieldError>{fieldErrors.deployment}</FieldError>
              </Field>
            </div>

            <FieldDescription>
              {labels.deploymentHint}
              {siteUrl && (
                <>
                  <br />
                  <span className="font-mono break-all">{siteUrl}</span>{' '}
                  {labels.addressPreview}
                </>
              )}
            </FieldDescription>
            {/* One region that stays mounted, so each state change is announced */}
            <div aria-live="polite">
              {fieldErrors.deployment ? null : availability === 'taken' ? (
                <FieldError>{labels.availabilityTaken}</FieldError>
              ) : availability === 'checking' ? (
                <FieldDescription>
                  {labels.availabilityChecking}
                </FieldDescription>
              ) : availability === 'available' ? (
                <FieldDescription>
                  {labels.availabilityAvailable}
                </FieldDescription>
              ) : null}
            </div>
          </FieldSet>

          {humanCheck}

          <Button type="submit" disabled={submitting || !canSubmit}>
            {submitting ? labels.submitting : labels.submit}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
