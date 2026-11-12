// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { issue } from '../render/fixtures';

import {
  CpuChart,
  ShippedChart,
  SpendChart,
  barPath,
  frame,
  segments,
  shippedMax,
  shippedTicks,
  spendMax,
  tipLeft
} from './charts';

const days = Array.from({ length: 30 }, (_, n) => ({
  key: `2026-10-${String(n + 1).padStart(2, '0')}`,
  items: n === 5 ? [issue('COD-1'), issue('COD-2')] : []
}));

const spend = (planning: number, orchestrating = 0, implementing = 0) =>
  days.map((d) => ({
    key: d.key,
    planning,
    orchestrating,
    implementing,
    total: planning + orchestrating + implementing
  }));

describe('chart geometry', () => {
  it('keeps a minimum width and splits it into a band per day', () => {
    expect(frame(30, 0, 200, 2).W).toBe(240);
    const f = frame(10, 442, 200, 4);
    expect(f.W).toBe(442);
    expect(f.plotH).toBe(172);
    expect(f.bottom).toBe(180);
    expect(f.band).toBe(40);
    expect(f.bw).toBe(16);
    expect(f.y(0)).toBe(180);
    expect(f.y(4)).toBe(8);
    expect(f.y(2)).toBe(94);
  });

  it('rounds a bar top no more than the bar allows', () => {
    expect(barPath(10, 16, 100, 180)).toBe(
      'M10,180 V104 Q10,100 14,100 H22 Q26,100 26,104 V180 Z'
    );
    // Two px tall: the corner is two px
    expect(barPath(10, 16, 178, 180)).toBe(
      'M10,180 V180 Q10,178 12,178 H24 Q26,178 26,180 V180 Z'
    );
  });

  it('scales the closed chart to at least two, with a middle line on whole tickets', () => {
    expect(shippedMax(days)).toBe(2);
    expect(shippedTicks(2)).toEqual([0, 1, 2]);
    expect(shippedTicks(3)).toEqual([0, 3]);
    expect(spendMax(spend(1))).toBe(10);
  });

  it('stacks the spend by role with a gap and rounds only the top segment', () => {
    const f = frame(30, 600, 200, 10);
    const [d] = spend(5, 0, 2.5);
    const s = segments(d, f, 10);
    expect(s.map((x) => x.role)).toEqual(['planning', 'implementing']);
    expect(s[0]).toEqual({
      role: 'planning',
      top: 94,
      bottom: 180,
      last: false
    });
    expect(s[1]).toEqual({
      role: 'implementing',
      top: 51,
      bottom: 92,
      last: true
    });
  });

  it('keeps the tooltip clear of the edges and scales a narrow box', () => {
    const f = frame(30, 600, 200, 2);
    expect(tipLeft(f, 0, 600, 60)).toBe(60);
    expect(tipLeft(f, 29, 600, 60)).toBe(540);
    expect(tipLeft(f, 15, 600, 60)).toBeCloseTo(38 + 18.6 * 15.5);
    // Narrower than the minimum: the plot is drawn at 240 and scaled down
    const narrow = frame(30, 120, 200, 2);
    expect(tipLeft(narrow, 15, 120, 10)).toBeCloseTo(
      ((38 + (198 / 30) * 15.5) * 120) / 240
    );
  });
});

describe('ShippedChart', () => {
  it('draws a hit area per day and a tooltip that names the tickets', () => {
    const { container } = render(<ShippedChart days={days} height={200} />);
    expect(container.querySelectorAll('rect.hit')).toHaveLength(30);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(
      '0 0 240 200'
    );
    expect(container.querySelectorAll('path.barm')).toHaveLength(1);
    expect(container.querySelector('.tip')).toBeNull();
    const hit = container.querySelector('rect.hit[data-day="5"]');
    if (!hit) throw new Error('no hit area for day 5');
    fireEvent.mouseEnter(hit);
    expect(container.querySelector('.tip')?.textContent).toContain(
      'COD-1, COD-2'
    );
    expect(container.querySelector('.tip b')?.textContent).toBe('2');
    expect(container.querySelector('rect.hl.on')).not.toBeNull();
    const chart = container.querySelector('.chart');
    if (!chart) throw new Error('no chart');
    fireEvent.mouseLeave(chart);
    expect(container.querySelector('.tip')).toBeNull();
    expect(container.querySelector('rect.hl.on')).toBeNull();
  });

  it('labels every seventh day, ending on the last', () => {
    const { container } = render(<ShippedChart days={days} height={200} />);
    const labels = Array.from(
      container.querySelectorAll('text.ax[text-anchor="middle"]')
    );
    expect(labels).toHaveLength(5);
  });
});

describe('SpendChart', () => {
  it('keeps a minimum width and lists each role in the tooltip', () => {
    const { container } = render(<SpendChart days={spend(1)} height={200} />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(
      '0 0 240 200'
    );
    const hit = container.querySelector('rect.hit[data-day="0"]');
    if (!hit) throw new Error('no hit area for day 0');
    fireEvent.mouseEnter(hit);
    const tip = container.querySelector('.tip')?.textContent;
    expect(tip).toContain('planning $1.00');
    expect(tip).toContain('implementing $0.00');
  });
});

describe('CpuChart', () => {
  const day = {
    from: 0,
    to: 1000,
    points: [
      { at: 0, cpu: 0.1 },
      { at: 500, cpu: 0.9 },
      { at: 1000, cpu: 0.2 }
    ],
    bands: [
      { start: 400, end: 600, ticket: 'COD-1' },
      { start: 800, end: 900, ticket: null }
    ],
    idle: 0.15,
    inRuns: 0.9,
    peak: { at: 500, cpu: 0.9, ticket: 'COD-1' }
  };

  it('draws a band per run, the line and a circle at the peak', () => {
    const { container } = render(<CpuChart day={day} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 600 56');
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('none');
    expect(svg?.getAttribute('aria-label')).toContain('peak 90%');
    const bands = container.querySelectorAll('rect.cpu-band');
    expect(bands).toHaveLength(2);
    expect(bands[0].getAttribute('x')).toBe('240.0');
    expect(bands[0].getAttribute('width')).toBe('120.0');
    const line = container.querySelector('polyline.cpu-line');
    expect(line?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(line?.getAttribute('points')).toBe('0.0,48.8 300.0,7.2 600.0,43.6');
    const peak = container.querySelector('circle.cpu-peak');
    expect(peak?.getAttribute('cx')).toBe('300.0');
    expect(peak?.getAttribute('cy')).toBe('7.2');
  });

  it('keeps a load above one on the top of the chart', () => {
    const { container } = render(
      <CpuChart
        day={{
          ...day,
          points: [
            { at: 0, cpu: 3 },
            { at: 1000, cpu: 0 }
          ],
          peak: { at: 0, cpu: 3, ticket: null }
        }}
      />
    );
    expect(
      container.querySelector('polyline.cpu-line')?.getAttribute('points')
    ).toBe('0.0,2.0 600.0,54.0');
  });

  it('draws nothing under two samples', () => {
    expect(
      render(<CpuChart day={{ ...day, points: [] }} />).container.innerHTML
    ).toBe('');
    expect(
      render(<CpuChart day={{ ...day, points: [day.points[0]] }} />).container
        .innerHTML
    ).toBe('');
  });
});
