import { Alert } from '@codeware/shared/ui/shadcn/components/alert';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  FieldGroup,
  FieldLegend,
  FieldSet
} from '@codeware/shared/ui/shadcn/components/field';
import type { FormEvent, ReactNode } from 'react';

import { AuthCard } from './auth-card';
import { InviteFields, SiteFields, YouFields } from './signup-fields';
import type { AuthFormStatus } from './types';

export type SignupValues = {
  code: string;
  name: string;
  email: string;
  password: string;
  siteName: string;
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
  sectionInvite: string;
  sectionYou: string;
  sectionSite: string;
  /** One line under each section's title, where the layout has room for it */
  sectionInviteHelp: string;
  sectionYouHelp: string;
  sectionSiteHelp: string;
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

/** What the server said about the current site name, once it was asked */
export type SignupAvailability = 'checking' | 'available' | 'taken';

export type SignupFormViewProps = {
  labels: SignupFormLabels;
  values: SignupValues;
  /** Messages worded next to the field they are about */
  fieldErrors?: Partial<Record<'email' | 'password' | 'siteName', string>>;
  /** The site's address as visitors will reach it, once the value is well-formed */
  siteUrl?: string;
  /** Whether the current site name is free; omitted until it is asked */
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
  const fields = { labels, values, fieldErrors, onChange };

  return (
    <AuthCard title={labels.title} description={labels.intro} footer={footer}>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          {status === 'refused' && refusal && (
            <Alert variant="destructive">{refusal}</Alert>
          )}

          <FieldSet>
            <FieldLegend>{labels.sectionInvite}</FieldLegend>
            <InviteFields {...fields} />
          </FieldSet>

          <FieldSet>
            <FieldLegend>{labels.sectionYou}</FieldLegend>
            <YouFields {...fields} />
          </FieldSet>

          <FieldSet>
            <FieldLegend>{labels.sectionSite}</FieldLegend>
            <SiteFields
              {...fields}
              siteUrl={siteUrl}
              availability={availability}
            />
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
