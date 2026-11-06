import { t } from '@codeware/shared/util/i18n';
import type {
  FormSubmission,
  Form as FormType
} from '@codeware/shared/util/payload-types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PayloadProvider,
  type PayloadValue,
  usePayload
} from '../../providers/PayloadProvider';

import { FormBlock } from './FormBlock';

const form = {
  id: 1,
  title: 'Contact',
  submitButtonLabel: 'Send',
  confirmationType: 'message',
  fields: [{ blockType: 'text', name: 'name', label: 'Name', required: false }]
} as unknown as FormType;

const Link: React.FC<{ to: string }> = ({ to }) => {
  const { navigate } = usePayload();
  return <button onClick={() => navigate(to)}>go {to}</button>;
};

describe('FormBlock overlay', () => {
  beforeEach(() => {
    window.location.hash = '';
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

  const setup = (
    submitForm = vi.fn(async () => ({
      success: true as const,
      data: {} as FormSubmission
    }))
  ) => {
    const navigate = vi.fn();
    render(
      <PayloadProvider
        value={
          {
            colorScheme: 'light',
            locale: 'en',
            navigate,
            submitForm
          } as unknown as PayloadValue
        }
      >
        <FormBlock
          blockType="form"
          form={form}
          display="overlay"
          anchor="kontakt"
          overlayTitle="Hör av dig"
        />
        <Link to="#kontakt" />
        <Link to="#nowhere" />
        <Link to="/about" />
      </PayloadProvider>
    );
    return { navigate, submitForm };
  };

  it('opens from its anchor and confirms after a submission', async () => {
    const { navigate, submitForm } = setup();

    expect(screen.queryByText('Hör av dig')).toBeNull();

    fireEvent.click(screen.getByText('go #kontakt'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Hör av dig');
    expect(navigate).not.toHaveBeenCalled();

    fireEvent.submit(dialog.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(submitForm).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.queryByText('Hör av dig')).toBeNull());
    expect(await screen.findByText(t('en', 'form.submitSuccess'))).toBeTruthy();
  });

  it('leaves an unknown anchor alone and passes other paths on', () => {
    const { navigate } = setup();

    fireEvent.click(screen.getByText('go #nowhere'));
    expect(navigate).not.toHaveBeenCalled();
    // Left on the hash, so an overlay that registers later can still open
    expect(window.location.hash).toBe('#nowhere');

    fireEvent.click(screen.getByText('go /about'));
    expect(navigate).toHaveBeenCalledWith('/about', undefined);
  });
});
