import type {
  FormSubmission,
  Form as FormType
} from '@codeware/shared/util/payload-types';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type FormSubmitResponse,
  PayloadProvider,
  type PayloadValue
} from '../../providers/PayloadProvider';

import { FormBlock } from './FormBlock';

/**
 * One optional field, so validation passes with nothing typed and a test can
 * submit the form element directly — which is exactly what Enter does.
 */
const form = {
  id: 1,
  title: 'Contact',
  submitButtonLabel: 'Send',
  confirmationType: 'message',
  fields: [{ blockType: 'text', name: 'name', label: 'Name', required: false }]
} as unknown as FormType;

describe('FormBlock', () => {
  beforeEach(() => {
    // The provider brings a toaster along, which asks the browser about the
    // visitor's colour preference. jsdom has no answer to give
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })) as unknown as typeof window.matchMedia;
  });

  it('sends one submission however often Enter is pressed while it is in flight', async () => {
    let answer: (response: FormSubmitResponse) => void = () => undefined;

    // Held open until the test answers, so every press lands mid-flight
    const submitForm = vi.fn(
      () =>
        new Promise<FormSubmitResponse>((resolve) => {
          answer = resolve;
        })
    );

    const { container } = render(
      <PayloadProvider
        value={
          {
            colorScheme: 'light',
            locale: 'en',
            navigate: vi.fn(),
            submitForm
          } as unknown as PayloadValue
        }
      >
        <FormBlock blockType="form" form={form} />
      </PayloadProvider>
    );

    const element = container.querySelector('form') as HTMLFormElement;

    // `handleSubmit` validates asynchronously, so these all reach the callback
    // before a re-render could report the first as loading
    fireEvent.submit(element);
    fireEvent.submit(element);
    fireEvent.submit(element);

    await waitFor(() => expect(submitForm).toHaveBeenCalledTimes(1));
    await new Promise((settle) => setTimeout(settle, 50));
    expect(submitForm).toHaveBeenCalledTimes(1);

    answer({ success: true, data: { id: 1 } as unknown as FormSubmission });

    // Once the first has been answered, the next attempt is a new submission
    await waitFor(() => {
      fireEvent.submit(element);
      expect(submitForm).toHaveBeenCalledTimes(2);
    });
  });
});
