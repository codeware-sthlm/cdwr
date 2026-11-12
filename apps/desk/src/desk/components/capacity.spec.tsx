// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { RunsPayload } from '../../supabase';
import { model } from '../model';
import { type DeskState, createState } from '../state';
import type { QueueView } from '../types';
import { NOW, carries, filled, hostSample, runs, view } from '../view/fixtures';

import { Capacity } from './capacity';
import { FRAME, HEAD, PANEL } from './card-ui';

const GIB = 2 ** 30;

const jobWith = (
  over: Partial<NonNullable<RunsPayload['job']>>,
  limit?: QueueView['limit']
): DeskState => {
  const s = filled();
  const base = runs(limit ? view({ limit }) : view());
  s.data.runs = { ...base, job: base.job && { ...base.job, ...over } };
  return s;
};

const session = (host: string, kind: string, ago: number) =>
  ({
    id: `${host}-${kind}`,
    host,
    kind,
    last_seen: new Date(NOW.getTime() - ago * 6e4).toISOString()
  }) as never;

const mount = (s: DeskState) => {
  const a = {
    onSheet: vi.fn(),
    onView: vi.fn(),
    pause: vi.fn(),
    run: vi.fn()
  };
  const { container } = render(<Capacity m={model(s, NOW)} {...a} />);
  const all = (sel: string) =>
    Array.from(container.querySelectorAll<HTMLElement>(sel));
  const q = <T extends HTMLElement = HTMLElement>(sel: string) =>
    container.querySelector<T>(sel);
  const text = container.textContent ?? '';
  /** The `.cap-v` value of the meter or mini whose label is `label` */
  const value = (label: string) =>
    all('.cap-mh').find((e) => e.firstElementChild?.textContent === label)
      ?.lastElementChild?.textContent;
  return { container, a, all, q, text, value };
};

describe('Capacity', () => {
  it('frames the Limits, Hosts and phone cards as the other cards', () => {
    const c = mount(filled());
    const limits = c.q('article.cap-limits');
    const hosts = c.q('article.cap-hosts');
    const phone = c.q('button.cap-phone');
    expect(carries(limits, PANEL)).toBe(true);
    expect(carries(hosts, PANEL)).toBe(true);
    expect(carries(phone, FRAME)).toBe(true);
    expect(phone?.classList.contains('border-[color:var(--line)]')).toBe(true);
    expect(carries(c.q('article.cap-limits .ct-head'), HEAD)).toBe(true);
    expect(carries(c.q('article.cap-hosts .ct-head'), HEAD)).toBe(true);
    expect(phone?.classList.contains('cursor-pointer')).toBe(true);
  });

  it('shows the PRs in flight against the limit, with the free slots', () => {
    const c = mount(filled());
    expect(c.text).toContain('LIMITS');
    const meter = c.q('[data-w="limit"]');
    expect(meter).not.toBeNull();
    expect(meter?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(meter ? [...meter.classList].slice(0, 3) : []).toEqual([
      'cap-meter',
      'cap-btn',
      'neutral'
    ]);
    expect(c.text).toContain('Agent PRs in flight');
    expect(meter?.querySelector('.cap-v')?.textContent).toBe('2 / 5');
    expect(c.text).toContain('3 slots free · merges free a slot live');
    const fillBar = meter?.querySelector<HTMLElement>('.cap-bar i');
    expect(fillBar?.classList.contains('neutral')).toBe(true);
    // jsdom normalizes the 40.0% React sets
    expect(fillBar?.style.width).toBe('40%');
  });

  it('turns the PRs meter amber one below the limit and says when no slot is free', () => {
    const one = mount(jobWith({}, { used: 4, max: 5 }));
    expect(one.text).toContain('1 slot free · merges free a slot live');
    expect(one.q('[data-w="limit"]')?.classList.contains('wait')).toBe(true);
    const full = mount(jobWith({}, { used: 5, max: 5 }));
    expect(full.text).toContain('no slot free');
    expect(full.text).not.toContain('slots free');
    expect(full.q('[data-w="limit"]')?.classList.contains('wait')).toBe(true);
  });

  it.each([
    [23, '57%', 'ok'],
    [32, '80%', 'wait'],
    [40, '100%', 'bad']
  ])('shows an effort of %d dollars as %s, tone %s', (spent, value, tone) => {
    const c = mount(jobWith({ effort: { spent, cap: 40 } }));
    expect(c.value('Agent effort today')).toBe(value);
    expect(c.q(`div.cap-meter.${tone}`)).not.toBeNull();
    expect(c.text).toContain(
      `$${spent} of the $40 cap · simulated, nothing billed · resets 00:00`
    );
  });

  it('says the effort is not published yet when the job line has none', () => {
    const c = mount(filled());
    expect(c.text).toContain(
      'not published yet: the scheduler sends it after its next deploy'
    );
    expect(c.value('Agent effort today')).toBe('–');
  });

  it('says whether the queue runs or is paused', () => {
    const running = mount(filled());
    expect(running.q('p.cap-queue')?.classList.contains('wait')).toBe(false);
    expect(running.q('p.cap-queue')?.textContent).toBe('Queue running');
    const paused = mount(jobWith({ paused: true }));
    expect(paused.q('p.cap-queue')?.classList.contains('wait')).toBe(true);
    expect(paused.q('p.cap-queue')?.textContent).toBe(
      'Queue paused · cdwr agent resume'
    );
    expect(paused.text).not.toContain('Queue running');
  });

  it('shows dashes while the runs load', () => {
    const c = mount(createState());
    expect(c.value('Agent PRs in flight')).toBe('–');
    expect(c.value('Agent effort today')).toBe('–');
    expect(c.text).not.toContain('slot');
    expect(c.text).not.toContain('Queue running');
    expect(c.text).toContain('no samples yet');
  });

  it('shows the NUC bars as percents, and a hint when memory is the container', () => {
    const c = mount(filled());
    const pct = (label: string) =>
      c
        .all('.cap-row')
        .find(
          (r) => r.querySelector('.cap-k')?.firstChild?.textContent === label
        )
        ?.querySelector('.cap-pct')?.textContent;
    expect(c.text).toContain('HOSTS');
    expect(c.text).toContain('host_metrics · live');
    expect(c.q('.cap-link[data-view="platform"]')).not.toBeNull();
    expect(c.text).toContain('busy · heartbeat 0 s ago');
    expect(pct('CPU')).toBe('25%');
    expect(pct('Memory')).toBe('25%');
    expect(pct('Disk')).toBe('40%');
    expect(c.q('.cap-dot.ok')).not.toBeNull();
    expect(c.q('.cap-hint')).toBeNull();
    const s = filled();
    s.data.hostMetrics = [
      hostSample(0, {
        cgroup_mem_current: 3 * GIB,
        cgroup_mem_max: 4 * GIB
      })
    ];
    const container = mount(s);
    expect(container.q('small.cap-hint')?.textContent).toBe('container');
    const memory = container
      .all('.cap-row')
      .find((r) => r.querySelector('.cap-hint'));
    expect(memory?.querySelector('.cap-pct')?.textContent).toBe('75%');
  });

  it('turns a bar amber over its threshold and caps it at the track', () => {
    const s = filled();
    s.data.hostMetrics = [
      hostSample(0, { mem_available: 0.2 * GIB, load1: 6 })
    ];
    const c = mount(s);
    const widths = c.all('.cap-row i.wait').map((i) => i.style.width);
    expect(widths).toContain('97.5%');
    // Load 6 on 4 cores is 150%: shown as it is, drawn full
    expect(widths).toContain('100%');
    expect(c.all('.cap-pct').map((e) => e.textContent)).toContain('150%');
    expect(c.q('.cap-dot.bad')).not.toBeNull();
    const disk = filled();
    disk.data.hostMetrics = [hostSample(0, { disk_free: 5 * GIB })];
    expect(
      mount(disk)
        .all('.cap-row i.wait')
        .map((i) => i.style.width)
    ).toContain('95%');
  });

  it('says a silent NUC is silent, and no samples at all', () => {
    const stale = filled();
    stale.data.hostMetrics = [hostSample(30)];
    const c = mount(stale);
    expect(c.text).toContain('silent · last sample 30 m ago');
    expect(c.q('.cap-dot.stale')).not.toBeNull();
    const none = filled();
    none.data.hostMetrics = [];
    const empty = mount(none);
    expect(empty.text).toContain('no samples yet');
    expect(empty.q('.cap-rows')).toBeNull();
  });

  it('shows the Mac block only with a Mac host, and marks the current step', () => {
    const none = mount(filled());
    expect(none.q('.cap-strip')).toBeNull();
    expect(none.text).not.toContain('ATTENDED');
    const s = filled({
      state: 'alive',
      detail: 'working',
      ticket: 'COD-1',
      lastSeen: '2026-10-29T11:59:00'
    });
    s.data.sessions = [
      session('mac', 'attended', 1),
      session('nuc', 'implement', 3)
    ];
    const c = mount(s);
    expect(c.all('b.cap-name').map((e) => e.textContent)).toContain('mac');
    expect(c.q('.cap-chip')?.textContent).toBe('ATTENDED');
    expect(c.text).toContain('seen 1 m ago · COD-1');
    expect(c.text).toContain('no host_metrics on this host');
    expect(c.q('.cap-strip')?.getAttribute('role')).toBe('img');
    expect(c.q('.cap-strip')?.getAttribute('aria-label')).toBe(
      'Hand-back to the NUC: attended, one of attended, handing back, handed back, idle'
    );
    expect(c.q('.cap-strip span.on')?.textContent).toBe('attended');
    expect(
      c.all('.cap-strip span').map((e) => e.classList.contains('on'))
    ).toEqual([true, false, false, false]);
    const back = filled();
    back.data.sessions = [session('mac', 'attended', 10)];
    const handing = mount(back);
    expect(handing.text).not.toContain('ATTENDED');
    expect(handing.q('.cap-strip span.on')?.textContent).toBe('handing back');
    expect(
      handing.all('.cap-strip span').map((e) => e.classList.contains('on'))
    ).toEqual([false, true, false, false]);
    expect(handing.text).not.toContain('· COD-1');
  });

  it('draws the CPU day with its stats and peak, but only from two samples', () => {
    const c = mount(filled());
    expect(c.text).toContain('nuc CPU, 24 h · shaded = agent runs');
    expect(c.q('.cap-stats')?.textContent).toBe('in runs avg 25% · peak 25%');
    expect(c.text).not.toContain('idle 25%');
    expect(c.text).toContain('Peak during COD-1 at ');
    expect(c.q('.cap-cpu polyline')).not.toBeNull();
    const one = filled();
    one.data.hostMetrics = [hostSample(0)];
    const few = mount(one);
    expect(few.q('.cap-cpu')).toBeNull();
    expect(few.q('polyline')).toBeNull();
  });

  it('shows the phone card with four meters and a foot line', () => {
    const s = filled();
    s.data.sessions = [
      session('mac', 'attended', 1),
      session('nuc', 'implement', 3)
    ];
    const c = mount(s);
    const phone = c.q('button.cap-phone');
    expect(phone?.getAttribute('data-view')).toBe('platform');
    expect(phone?.getAttribute('aria-label')).toBe('Capacity: tap for hosts');
    expect(c.all('.cap-mini')).toHaveLength(4);
    const mini = (label: string) =>
      c
        .all('.cap-mini .cap-mh')
        .find((e) => e.firstElementChild?.textContent === label)
        ?.lastElementChild?.textContent;
    expect(mini('PRs in flight')).toBe('2/5');
    expect(mini('Effort today')).toBe('–');
    expect(mini('nuc CPU')).toBe('25%');
    expect(mini('nuc memory')).toBe('25%');
    expect(c.q('.cap-foot')?.textContent).toBe(
      'mac attended · nuc busy, heartbeat 0 s — tap for hosts'
    );
    const plain = mount(filled());
    expect(plain.q('.cap-foot')?.textContent).toBe(
      'nuc busy, heartbeat 0 s — tap for hosts'
    );
    expect(plain.text).not.toContain('mac attended');
  });

  describe('with controls', () => {
    const on = (build: (s: DeskState) => void = () => undefined): DeskState => {
      const s = filled();
      s.controls.target = {
        supabaseUrl: 'https://x.supabase.co',
        controlToken: 't'
      };
      build(s);
      return s;
    };
    const paused = (x: DeskState) => {
      const r = x.data.runs;
      if (r?.job) r.job = { ...r.job, paused: true };
    };

    it('offers resume while paused on the limits card', () => {
      const c = mount(on(paused));
      expect(c.text).toContain('Queue paused');
      expect(c.q('[data-cmd="resume"]')).not.toBeNull();
      expect(c.q('[data-cmd="pause"]')).toBeNull();
      expect(c.q('[data-cmd="run"]')).not.toBeNull();
    });

    it('sends pause, or resume while paused, and run', () => {
      const c = mount(on());
      expect(c.q('p.cap-queue')?.textContent).toBe('Queue running Pause');
      fireEvent.click(c.q('[data-cmd="pause"]') as HTMLElement);
      expect(c.a.pause).toHaveBeenCalledWith('pause');
      fireEvent.click(c.q('[data-cmd="run"]') as HTMLElement);
      expect(c.a.run).toHaveBeenCalledTimes(1);
      const p = mount(on(paused));
      fireEvent.click(p.q('[data-cmd="resume"]') as HTMLElement);
      expect(p.a.pause).toHaveBeenCalledWith('resume');
    });
  });

  describe('buttons', () => {
    it('opens the limit sheet from the PRs meter', () => {
      const c = mount(filled());
      fireEvent.click(c.q('[data-w="limit"]') as HTMLElement);
      expect(c.a.onSheet).toHaveBeenCalledWith('limit');
    });

    it('opens the Platform view from the link and the phone card', () => {
      const c = mount(filled());
      fireEvent.click(c.q('.cap-link') as HTMLElement);
      expect(c.a.onView).toHaveBeenLastCalledWith('platform');
      fireEvent.click(c.q('.cap-phone') as HTMLElement);
      expect(c.a.onView).toHaveBeenLastCalledWith('platform');
      expect(c.a.onView).toHaveBeenCalledTimes(2);
    });
  });
});
