// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ControlView } from '../model';

import { CmdButton, ControlStatus, Stepper } from './controls';

const idle: ControlView = { state: 'idle' };
const pending: ControlView = { state: 'pending', kind: 'run' };
const sending: ControlView = { state: 'sending' };
const refused: ControlView = { state: 'refused', kind: 'run', note: 'x' };

describe('ControlStatus', () => {
  it('says nothing when idle', () => {
    const { container } = render(<ControlStatus view={idle} />);
    expect(container.innerHTML).toBe('');
  });

  it.each([
    [sending, 'sending…', 'sending'],
    [pending, 'pending…', 'pending'],
    [refused, 'x', 'refused']
  ] as const)('says %j', (view, text, state) => {
    const { container } = render(<ControlStatus view={view} />);
    const el = container.querySelector('small');
    expect(el?.textContent).toBe(text);
    expect(el?.getAttribute('role')).toBe('status');
    expect(el?.classList.contains('ctl-status')).toBe(true);
    expect(el?.classList.contains(state)).toBe(true);
  });
});

describe('CmdButton', () => {
  const button = (view: ControlView, onClick = vi.fn()) => {
    const { container } = render(
      <CmdButton cmd="run" label="Run now" view={view} onClick={onClick} />
    );
    return container.querySelector('button') as HTMLButtonElement;
  };

  it('shows its label and command', () => {
    const b = button(idle);
    expect(b.textContent).toBe('Run now');
    expect(b.getAttribute('data-cmd')).toBe('run');
    expect(b.disabled).toBe(false);
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    fireEvent.click(button(idle, onClick));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each([pending, sending])('is disabled while %j', (view) => {
    const onClick = vi.fn();
    const b = button(view, onClick);
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stays enabled after a refusal', () => {
    expect(button(refused).disabled).toBe(false);
  });
});

describe('Stepper', () => {
  const range = { min: 1, max: 20, step: 1 };
  const setup = (
    over: Partial<Parameters<typeof Stepper>[0]> = {},
    handlers = { onStep: vi.fn(), onApply: vi.fn() }
  ) => {
    const { container } = render(
      <Stepper
        control="limit"
        range={range}
        current={5}
        draft={5}
        view={idle}
        fmt={(n) => `#${n}`}
        {...handlers}
        {...over}
      />
    );
    const q = (sel: string) =>
      container.querySelector(sel) as HTMLButtonElement;
    return {
      container,
      handlers,
      minus: q('[aria-label="Decrease"]'),
      plus: q('[aria-label="Increase"]'),
      apply: q('.ctl-apply'),
      draft: q('.ctl-draft')
    };
  };

  it('shows the formatted draft, or a dash without one', () => {
    expect(setup().draft.textContent).toBe('#5');
    expect(setup({ draft: null }).draft.textContent).toBe('–');
  });

  it('carries its control in the data attributes', () => {
    const s = setup({ control: 'cap', range: { min: 0, max: 500, step: 5 } });
    expect(s.minus.getAttribute('data-step')).toBe('cap:-5');
    expect(s.plus.getAttribute('data-step')).toBe('cap:5');
    expect(s.apply.getAttribute('data-apply')).toBe('cap');
  });

  it('disables − at the minimum and + at the maximum', () => {
    const low = setup({ draft: 1, current: 1 });
    expect(low.minus.disabled).toBe(true);
    expect(low.plus.disabled).toBe(false);
    const high = setup({ draft: 20, current: 20 });
    expect(high.minus.disabled).toBe(false);
    expect(high.plus.disabled).toBe(true);
    expect(setup().minus.disabled).toBe(false);
  });

  it('disables Apply without a draft or when it equals the current value', () => {
    expect(setup({ draft: null }).apply.disabled).toBe(true);
    expect(setup({ draft: 5, current: 5 }).apply.disabled).toBe(true);
    expect(setup({ draft: 7, current: 5 }).apply.disabled).toBe(false);
  });

  it.each([pending, sending])('disables everything while %j', (view) => {
    const s = setup({ draft: 7, view });
    expect(s.minus.disabled).toBe(true);
    expect(s.plus.disabled).toBe(true);
    expect(s.apply.disabled).toBe(true);
  });

  it('calls onStep with the step, and onApply', () => {
    const s = setup({ draft: 7 });
    fireEvent.click(s.minus);
    expect(s.handlers.onStep).toHaveBeenLastCalledWith(-1);
    fireEvent.click(s.plus);
    expect(s.handlers.onStep).toHaveBeenLastCalledWith(1);
    fireEvent.click(s.apply);
    expect(s.handlers.onApply).toHaveBeenCalledTimes(1);
  });

  it('shows the status of its control', () => {
    expect(setup().container.querySelector('.ctl-status')).toBeNull();
    const s = setup({ view: refused });
    expect(s.container.querySelector('.ctl-status.refused')?.textContent).toBe(
      'x'
    );
    expect(setup({ view: pending }).container.textContent).toContain(
      'pending…'
    );
  });
});
