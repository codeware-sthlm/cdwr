import { Button } from '@codeware/shared/ui/shadcn/components/button';

import { AuthCard } from './auth-card';

export type VerifyResultState = 'confirm' | 'verified' | 'invalid';

export type VerifyResultLabels = {
  confirmTitle: string;
  confirmBody: string;
  confirm: string;
  verifiedTitle: string;
  verifiedBody: string;
  invalidTitle: string;
  invalidBody: string;
  signIn: string;
  newLink: string;
};

export type VerifyResultViewProps = {
  state: VerifyResultState;
  labels: VerifyResultLabels;
  signInHref: string;
  /** Submitted by the confirm button; the link alone never uses the token up */
  confirmAction?: (formData: FormData) => void | Promise<void>;
  /** Where a new confirmation link is asked for */
  newLinkHref: string;
};

/** What the confirmation link led to, and the next step from there */
export function VerifyResultView({
  state,
  labels,
  signInHref,
  confirmAction,
  newLinkHref
}: VerifyResultViewProps) {
  if (state === 'confirm') {
    return (
      <AuthCard title={labels.confirmTitle} description={labels.confirmBody}>
        <form action={confirmAction}>
          <Button type="submit" className="w-full">
            {labels.confirm}
          </Button>
        </form>
      </AuthCard>
    );
  }

  if (state === 'verified') {
    return (
      <AuthCard title={labels.verifiedTitle} description={labels.verifiedBody}>
        <Button asChild className="w-full">
          <a href={signInHref}>{labels.signIn}</a>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={labels.invalidTitle}
      description={labels.invalidBody}
      footer={
        <>
          <a href={signInHref}>{labels.signIn}</a>
          <a href={newLinkHref}>{labels.newLink}</a>
        </>
      }
    />
  );
}
