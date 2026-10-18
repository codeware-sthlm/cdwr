import { Alert } from '@codeware/shared/ui/shadcn/components/alert';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { FieldGroup } from '@codeware/shared/ui/shadcn/components/field';
import { type ReactNode, useId } from 'react';

import { AuthBrand } from './auth-brand';
import { InviteFields, SiteFields, YouFields } from './signup-fields';
import type { SignupFormViewProps } from './signup-form-view';

type Section = { title: string; help: string; fields: ReactNode };

/** The head both variants share: brand, title and a lede with room around it */
function Head({ title, lede }: { title: string; lede: string }) {
  return (
    <header className="flex flex-col items-center gap-4 text-center">
      <AuthBrand />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground max-w-prose text-balance">{lede}</p>
    </header>
  );
}

/** What both variants put around their sections */
function Shell({
  props,
  children
}: {
  props: SignupFormViewProps;
  children: ReactNode;
}) {
  const {
    labels,
    status,
    refusal,
    canSubmit = true,
    humanCheck,
    footer
  } = props;
  const submitting = status === 'submitting';

  return (
    <div className="flex w-full flex-col gap-8">
      <Head title={labels.title} lede={labels.intro} />
      <form onSubmit={props.onSubmit} className="flex flex-col gap-8">
        {status === 'refused' && refusal && (
          <Alert variant="destructive">{refusal}</Alert>
        )}
        {children}
        <div className="flex flex-col gap-6">
          {humanCheck}
          <Button type="submit" disabled={submitting || !canSubmit}>
            {submitting ? labels.submitting : labels.submit}
          </Button>
        </div>
      </form>
      {footer && (
        <div className="text-muted-foreground [&_a:hover]:text-foreground flex flex-col items-center gap-2 text-center text-sm [&_a]:underline [&_a]:underline-offset-4">
          {footer}
        </div>
      )}
    </div>
  );
}

const sectionsOf = (props: SignupFormViewProps): Section[] => {
  const { labels, siteUrl, availability } = props;
  return [
    {
      title: labels.sectionInvite,
      help: labels.sectionInviteHelp,
      fields: <InviteFields {...props} />
    },
    {
      title: labels.sectionYou,
      help: labels.sectionYouHelp,
      fields: <YouFields {...props} />
    },
    {
      title: labels.sectionSite,
      help: labels.sectionSiteHelp,
      fields: (
        <SiteFields {...props} siteUrl={siteUrl} availability={availability} />
      )
    }
  ];
};

function SettingsRow({ title, help, fields }: Section) {
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
      <FieldGroup className="md:col-span-2">{fields}</FieldGroup>
    </section>
  );
}

/** A: each section a settings row, title and description left, fields right */
export function SignupFormVariantA(props: SignupFormViewProps) {
  return (
    <Shell props={props}>
      {sectionsOf(props).map((section) => (
        <SettingsRow key={section.title} {...section} />
      ))}
    </Shell>
  );
}

function Panel({ title, help, fields }: Section) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="bg-card rounded-xl border">
      <div className="flex flex-col gap-0.5 border-b px-5 py-3">
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">{help}</p>
      </div>
      <FieldGroup className="p-5">{fields}</FieldGroup>
    </section>
  );
}

/** B: each section a bordered panel with a heading bar */
export function SignupFormVariantB(props: SignupFormViewProps) {
  return (
    <Shell props={props}>
      <div className="flex flex-col gap-6">
        {sectionsOf(props).map((section) => (
          <Panel key={section.title} {...section} />
        ))}
      </div>
    </Shell>
  );
}
