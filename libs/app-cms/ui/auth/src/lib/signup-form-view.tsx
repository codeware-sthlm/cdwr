import { Alert } from '@codeware/shared/ui/shadcn/components/alert';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { FieldGroup } from '@codeware/shared/ui/shadcn/components/field';
import { type FormEvent, type ReactNode, useId } from 'react';

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
  const sections = [
    {
      title: labels.sectionInvite,
      help: labels.sectionInviteHelp,
      body: <InviteFields {...fields} />
    },
    {
      title: labels.sectionYou,
      help: labels.sectionYouHelp,
      body: <YouFields {...fields} />
    },
    {
      title: labels.sectionSite,
      help: labels.sectionSiteHelp,
      body: (
        <SiteFields {...fields} siteUrl={siteUrl} availability={availability} />
      )
    }
  ];

  return (
    <AuthCard
      title={labels.title}
      description={labels.intro}
      footer={footer}
      size="wide"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-8">
        {status === 'refused' && refusal && (
          <Alert variant="destructive">{refusal}</Alert>
        )}

        {sections.map(({ title, help, body }) => (
          <SettingsRow key={title} title={title} help={help}>
            {body}
          </SettingsRow>
        ))}

        <div className="flex flex-col gap-6">
          {humanCheck}
          <Button type="submit" disabled={submitting || !canSubmit}>
            {submitting ? labels.submitting : labels.submit}
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}

/** A section as a settings row: title and help left, fields right */
function SettingsRow({
  title,
  help,
  children
}: {
  title: string;
  help: string;
  children: ReactNode;
}) {
  const id = useId();

  return (
    <section
      aria-labelledby={id}
      className="grid gap-6 border-t pt-8 md:grid-cols-3"
    >
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{help}</p>
      </div>
      <FieldGroup className="md:col-span-2">{children}</FieldGroup>
    </section>
  );
}
