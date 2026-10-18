import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel
} from '@codeware/shared/ui/shadcn/components/field';
import { Input } from '@codeware/shared/ui/shadcn/components/input';

import type { SignupFormViewProps } from './signup-form-view';

type FieldsProps = Pick<
  SignupFormViewProps,
  'labels' | 'values' | 'fieldErrors' | 'onChange'
>;

/** The invite code */
export function InviteFields({ labels, values, onChange }: FieldsProps) {
  return (
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
  );
}

/** The person: name and email share a row from `sm`, the password follows */
export function YouFields({
  labels,
  values,
  fieldErrors = {},
  onChange
}: FieldsProps) {
  return (
    <>
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
        <FieldLabel htmlFor="signup-password">{labels.password}</FieldLabel>
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
    </>
  );
}

/** The site name, with the address that follows from it and whether it is free */
export function SiteFields({
  labels,
  values,
  fieldErrors = {},
  siteUrl,
  availability,
  onChange
}: FieldsProps & Pick<SignupFormViewProps, 'siteUrl' | 'availability'>) {
  const invalid =
    fieldErrors.siteName !== undefined || availability === 'taken';

  return (
    <Field data-invalid={invalid ? true : undefined}>
      <FieldLabel htmlFor="signup-site-name">{labels.siteName}</FieldLabel>
      <Input
        id="signup-site-name"
        value={values.siteName}
        onChange={(event) => onChange('siteName', event.target.value)}
        aria-invalid={invalid}
        required
      />
      <FieldError>{fieldErrors.siteName}</FieldError>
      {siteUrl && (
        <FieldDescription>
          <span className="font-mono break-all">{siteUrl}</span>{' '}
          {labels.addressPreview}
        </FieldDescription>
      )}
      {/* One region that stays mounted, so each state change is announced */}
      <div aria-live="polite">
        {fieldErrors.siteName ? null : availability === 'taken' ? (
          <FieldError>{labels.availabilityTaken}</FieldError>
        ) : availability === 'checking' ? (
          <FieldDescription>{labels.availabilityChecking}</FieldDescription>
        ) : availability === 'available' ? (
          <FieldDescription>{labels.availabilityAvailable}</FieldDescription>
        ) : null}
      </div>
    </Field>
  );
}
