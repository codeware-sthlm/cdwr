'use client';

import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Form,
  FormField,
  FormItem,
  FormMessage
} from '@codeware/shared/ui/shadcn/components/form';
import { t } from '@codeware/shared/util/i18n';
import type { Tour } from '@codeware/shared/util/payload-types';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Checkbox } from '../form-items/Checkbox';
import { Input } from '../form-items/Input';
import { useHumanCheck } from '../human-check/use-human-check';
import { ColSpan } from '../layout/ColSpan';
import { Grid } from '../layout/Grid';
import { usePayload } from '../providers/PayloadProvider';

import { LegalPageDialog } from './LegalPageDialog';

/** Largest party a single signup may claim, before a guide gets involved */
const MAX_PEOPLE = 20;

type Values = {
  name: string;
  email: string;
  phone: string;
  people: number;
  acceptedTerms: boolean;
};

export type TourSignupFormProps = {
  tour: Tour;
  /**
   * Called once a signup is accepted, before any confirmation is shown.
   * Lets a host close the surface the form sits in (a sheet, a dialog).
   */
  onSuccess?: () => void;
};

/**
 * The platform's own signup form for a tour.
 *
 * Typed on purpose, and not built in the form builder: `people` is what
 * capacity is counted in, so it cannot be a field an editor is free to rename,
 * retype or delete.
 *
 * The form only ever *asks* for a place. Whether the customer gets one or
 * joins the waiting list is decided server-side while the tour row is locked,
 * so two people racing for the last seat get one honest answer each — which is
 * why the confirmation is read from the response rather than predicted here.
 */
export function TourSignupForm({ tour, onSuccess }: TourSignupFormProps) {
  const { locale, signupPolicy, submitTourSignup } = usePayload();
  const [isLoading, setIsLoading] = useState(false);
  const humanCheck = useHumanCheck();

  const form = useForm<Values>({
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      people: 1,
      acceptedTerms: false
    }
  });

  // Terms are only presented when the workspace has a page to point at, so
  // there is nothing to accept — and nothing to require — without one
  const termsUrl = signupPolicy?.termsUrl ?? null;
  const privacyUrl = signupPolicy?.privacyUrl ?? null;
  const retentionDays = signupPolicy?.retentionDays ?? null;

  // Seats left do not mean a place is on offer: once anyone is waiting, the
  // queue is served in order and this form joins it
  const full = Boolean(tour.signupsFull) || Boolean(tour.signupsQueueOnly);
  const seatsLeft = tour.seatsLeft ?? null;

  const onSubmit = useCallback(
    (values: Values) => {
      const invokeSubmit = async () => {
        setIsLoading(true);

        const response = await submitTourSignup({
          tour: tour.id,
          name: values.name,
          email: values.email,
          phone: values.phone || undefined,
          people: Number(values.people),
          acceptedTerms: termsUrl ? values.acceptedTerms : undefined,
          humanCheck: humanCheck.proof()
        });

        setIsLoading(false);

        if (!response.success) {
          // A refusal carries a reason worth reading — the tour closed while
          // the form was open, say. Only an unexplained failure is worth
          // answering with "try again", which is what the generic line says.
          toast.error(response.data.error || t(locale, 'tourSignup.failed'));
          return;
        }

        const { data } = response;

        form.reset();
        onSuccess?.();

        // The server decides; a customer who asked for a seat may well have
        // been queued behind someone who submitted a moment earlier
        toast.success(
          t(
            locale,
            data.status === 'waiting'
              ? 'tourSignup.successWaiting'
              : 'tourSignup.successBooked'
          )
        );
      };

      void invokeSubmit();
    },
    [form, humanCheck, locale, onSuccess, submitTourSignup, termsUrl, tour.id]
  );

  if (tour.signupsClosed) {
    return (
      <p className="text-muted-foreground text-sm">
        {t(locale, 'tourSignup.signupsClosed')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {full
        ? // Stated prominently by whatever hosts the form — a sheet header, a
          // page heading — so repeating it here would only stutter
          null
        : seatsLeft !== null && (
            <p className="text-muted-foreground text-sm">
              {t(locale, 'tourSignup.seatsLeft', { count: String(seatsLeft) })}
            </p>
          )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Grid columns={6} className="gap-x-4 gap-y-4">
            <ColSpan>
              <FormField
                control={form.control}
                name="name"
                rules={{ required: t(locale, 'tourSignup.required') }}
                render={({ field }) => (
                  <FormItem>
                    <Input
                      {...field}
                      type="text"
                      label={t(locale, 'tourSignup.name')}
                      placeholder={null}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ColSpan>

            <ColSpan columns={3}>
              <FormField
                control={form.control}
                name="email"
                rules={{ required: t(locale, 'tourSignup.required') }}
                render={({ field }) => (
                  <FormItem>
                    <Input
                      {...field}
                      type="email"
                      label={t(locale, 'tourSignup.email')}
                      placeholder={null}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ColSpan>

            <ColSpan columns={3}>
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <Input
                      {...field}
                      type="tel"
                      label={t(locale, 'tourSignup.phone')}
                      placeholder={null}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ColSpan>

            <ColSpan columns={3}>
              <FormField
                control={form.control}
                name="people"
                rules={{
                  required: t(locale, 'tourSignup.required'),
                  min: {
                    value: 1,
                    message: t(locale, 'tourSignup.tooManyPeople', {
                      max: String(MAX_PEOPLE)
                    })
                  },
                  max: {
                    value: MAX_PEOPLE,
                    message: t(locale, 'tourSignup.tooManyPeople', {
                      max: String(MAX_PEOPLE)
                    })
                  }
                }}
                render={({ field }) => (
                  <FormItem>
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      max={MAX_PEOPLE}
                      label={t(locale, 'tourSignup.people')}
                      placeholder={null}
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t(locale, 'tourSignup.peopleHelp')}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </ColSpan>

            {termsUrl && (
              <ColSpan>
                <FormField
                  control={form.control}
                  name="acceptedTerms"
                  rules={{
                    required: t(locale, 'tourSignup.acceptTermsRequired')
                  }}
                  render={({ field }) => (
                    <FormItem>
                      <Checkbox
                        {...field}
                        label={t(locale, 'tourSignup.acceptTerms')}
                      />
                      <LegalPageDialog
                        url={termsUrl}
                        label={t(locale, 'tourSignup.termsLink')}
                        className="text-core-link cursor-pointer text-sm underline"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </ColSpan>
            )}

            <ColSpan>{humanCheck.fields}</ColSpan>

            <ColSpan>
              <Button
                type="submit"
                disabled={isLoading || !humanCheck.solved}
                className="w-full"
              >
                {isLoading
                  ? t(locale, 'tourSignup.submitting')
                  : full
                    ? t(locale, 'tourSignup.joinWaitingList')
                    : t(locale, 'tourSignup.submit')}
              </Button>
            </ColSpan>
          </Grid>
        </form>
      </Form>

      {/* Said at the moment the details are handed over, not buried in a page
          the customer has to go looking for */}
      <p className="text-muted-foreground text-xs">
        {t(locale, 'tourSignup.dataNotice')}
        {retentionDays
          ? ` ${t(locale, 'tourSignup.dataNoticeRetention', {
              days: String(retentionDays)
            })}`
          : ''}
        {privacyUrl && (
          <>
            {' '}
            <LegalPageDialog
              url={privacyUrl}
              label={t(locale, 'tourSignup.privacyLink')}
              className="text-core-link cursor-pointer underline"
            />
          </>
        )}
      </p>
    </div>
  );
}
