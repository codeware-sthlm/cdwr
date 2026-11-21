import { describe, expect, it } from 'vitest';

import {
  type ExpectedRecords,
  type ResolverAnswer,
  guessZone,
  judgeRecords,
  normaliseRecords,
  registrarName,
  resolversAgree
} from './resolver-comparison';

/** A resolver's answer with `cname` as the domain's CNAME */
const answer = (
  resolver: string,
  cname: Array<string>,
  error?: string,
  extra: Partial<Pick<ResolverAnswer, 'challenge'>> & {
    a?: Array<string>;
    aaaa?: Array<string>;
  } = {}
): ResolverAnswer => ({
  resolver,
  records: { a: extra.a ?? [], aaaa: extra.aaaa ?? [], cname },
  challenge: extra.challenge ?? [],
  error
});

describe('normaliseRecords', () => {
  it('ignores case, the root dot and order', () => {
    expect(normaliseRecords(['B.fly.dev.', 'A.FLY.DEV'])).toEqual([
      'a.fly.dev',
      'b.fly.dev'
    ]);
  });

  it('collapses a duplicate rather than reporting it as extra state', () => {
    expect(normaliseRecords(['a.fly.dev', 'a.fly.dev.'])).toEqual([
      'a.fly.dev'
    ]);
  });
});

describe('resolversAgree', () => {
  it('agrees when every resolver returns the same answer', () => {
    expect(
      resolversAgree([
        answer('Cloudflare', ['app.fly.dev']),
        answer('Google', ['app.fly.dev']),
        answer('Quad9', ['app.fly.dev'])
      ])
    ).toBe(true);
  });

  it('disagrees when one resolver still has the old target', () => {
    expect(
      resolversAgree([
        answer('Cloudflare', ['new.fly.dev']),
        answer('Google', ['old.fly.dev'])
      ])
    ).toBe(false);
  });

  it('disagrees when a resolver has nothing and another has an answer', () => {
    // The half-propagated case — the one an operator reads as "broken"
    expect(
      resolversAgree([
        answer('Cloudflare', ['app.fly.dev']),
        answer('Google', [])
      ])
    ).toBe(false);
  });

  it('disagrees when only the AAAA records differ', () => {
    expect(
      resolversAgree([
        answer('Cloudflare', [], undefined, { a: ['1.2.3.4'], aaaa: ['::1'] }),
        answer('Google', [], undefined, { a: ['1.2.3.4'] })
      ])
    ).toBe(false);
  });

  it('disagrees when only the challenge record differs', () => {
    expect(
      resolversAgree([
        answer('Cloudflare', ['app.fly.dev'], undefined, {
          challenge: ['x.flydns.net']
        }),
        answer('Google', ['app.fly.dev'])
      ])
    ).toBe(false);
  });

  it('agrees when every resolver has nothing yet', () => {
    expect(
      resolversAgree([answer('Cloudflare', []), answer('Google', [])])
    ).toBe(true);
  });

  it('ignores a resolver that could not be reached', () => {
    // An unreachable resolver says nothing about the domain, so it must not
    // raise a disagreement the domain is not actually having
    expect(
      resolversAgree([
        answer('Cloudflare', ['app.fly.dev']),
        answer('Google', ['app.fly.dev']),
        answer('Quad9', [], 'ETIMEOUT')
      ])
    ).toBe(true);
  });

  it('reports no disagreement when nothing answered at all', () => {
    expect(
      resolversAgree([
        answer('Cloudflare', [], 'ETIMEOUT'),
        answer('Google', [], 'ECONNREFUSED')
      ])
    ).toBe(true);
  });
});

describe('judgeRecords', () => {
  // kajstroberg.se, as it stood: records created at Loopia while one.com
  // still served the domain
  const flyAddresses: ExpectedRecords['addresses'] = [
    { type: 'A', address: '66.241.124.125' },
    { type: 'AAAA', address: '2a09:8280:1::d1:eaa0:0' }
  ];
  const apex: ExpectedRecords = {
    isApex: true,
    cname: 'cdwr-cms-ks-vininfo.fly.dev',
    addresses: flyAddresses,
    challenge: 'kajstroberg.se.pnp2erl.flydns.net'
  };
  const www: ExpectedRecords = {
    ...apex,
    isApex: false,
    challenge: 'www.kajstroberg.se.pnp2erl.flydns.net'
  };

  const comparison = (
    records: { a?: Array<string>; aaaa?: Array<string>; cname?: Array<string> },
    challenge: Array<string> = []
  ) => ({
    answers: [
      answer('Cloudflare', [], 'ETIMEOUT'),
      answer('Google', records.cname ?? [], undefined, {
        a: records.a,
        aaaa: records.aaaa,
        challenge
      })
    ]
  });

  it('names the old host an apex still answers with', () => {
    const judgement = judgeRecords(
      comparison({ a: ['46.30.213.129'], aaaa: ['2a02:2350:5:100::1'] }),
      apex
    );

    expect(judgement.a).toEqual({
      verdict: 'mismatch',
      actual: ['46.30.213.129']
    });
    expect(judgement.aaaa.verdict).toBe('mismatch');
  });

  it('reports a missing AAAA beside a correct A', () => {
    const judgement = judgeRecords(comparison({ a: ['66.241.124.125'] }), apex);

    expect(judgement.a.verdict).toBe('match');
    expect(judgement.aaaa).toEqual({ verdict: 'missing', actual: [] });
  });

  it('matches an IPv6 address however it is spelled', () => {
    const judgement = judgeRecords(
      comparison({
        a: ['66.241.124.125'],
        aaaa: ['2a09:8280:0001:0000:0000:00d1:eaa0:0000']
      }),
      apex
    );

    expect(judgement.aaaa.verdict).toBe('match');
  });

  it('does not match when only some of the app’s addresses answer', () => {
    const judgement = judgeRecords(comparison({ a: ['66.241.124.125'] }), {
      ...apex,
      addresses: [...flyAddresses, { type: 'A', address: '66.241.124.126' }]
    });

    expect(judgement.a).toEqual({
      verdict: 'mismatch',
      actual: ['66.241.124.125']
    });
  });

  it('flags a subdomain whose A points elsewhere, which blocks the CNAME', () => {
    const judgement = judgeRecords(comparison({ a: ['46.30.213.129'] }), www);

    expect(judgement.traffic).toEqual({
      verdict: 'mismatch',
      actual: ['46.30.213.129']
    });
    expect(judgement.byAddress).toBe(false);
    expect(judgement.blockingAddresses).toEqual(['46.30.213.129']);
  });

  it('accepts a subdomain served by address at the app', () => {
    const judgement = judgeRecords(
      comparison({ a: ['66.241.124.125'], aaaa: ['2a09:8280:1::d1:eaa0:0'] }),
      www
    );

    expect(judgement.traffic.verdict).toBe('match');
    expect(judgement.byAddress).toBe(true);
    expect(judgement.blockingAddresses).toEqual([]);
  });

  it('does not accept a subdomain by address while its AAAA is missing', () => {
    const judgement = judgeRecords(comparison({ a: ['66.241.124.125'] }), www);

    expect(judgement.byAddress).toBe(false);
    expect(judgement.traffic.verdict).toBe('mismatch');
  });

  it('does not accept a foreign AAAA beside the app’s A', () => {
    const judgement = judgeRecords(
      comparison({ a: ['66.241.124.125'], aaaa: ['2a02:2350:5:100::1'] }),
      { ...www, addresses: [flyAddresses[0]] }
    );

    expect(judgement.byAddress).toBe(false);
    expect(judgement.blockingAddresses).toEqual(['2a02:2350:5:100::1']);
  });

  it('matches a subdomain CNAME, ignoring the addresses it leads to', () => {
    const judgement = judgeRecords(
      comparison(
        {
          cname: ['cdwr-cms-ks-vininfo.fly.dev'],
          a: ['66.241.124.125']
        },
        ['www.kajstroberg.se.pnp2erl.flydns.net']
      ),
      www
    );

    expect(judgement.traffic.verdict).toBe('match');
    expect(judgement.a.verdict).toBe('unknown');
    expect(judgement.challenge.verdict).toBe('match');
  });

  it('reports a subdomain with nothing at all as missing', () => {
    const judgement = judgeRecords(comparison({}), www);

    expect(judgement.traffic.verdict).toBe('missing');
    expect(judgement.challenge.verdict).toBe('missing');
  });

  it('knows nothing when no resolver answered', () => {
    const judgement = judgeRecords(
      { answers: [answer('Cloudflare', [], 'ETIMEOUT')] },
      apex
    );

    expect(judgement.a.verdict).toBe('unknown');
    expect(judgement.traffic.verdict).toBe('unknown');
  });

  it('cannot judge addresses a row stored before it kept them', () => {
    const judgement = judgeRecords(comparison({ a: ['46.30.213.129'] }), {
      ...www,
      addresses: []
    });

    expect(judgement.traffic.verdict).toBe('unknown');
    expect(judgement.blockingAddresses).toEqual([]);
  });
});

describe('registrarName', () => {
  it('writes the zone itself as @', () => {
    expect(registrarName('kajstroberg.se', 'kajstroberg.se')).toBe('@');
  });

  it('writes a subdomain as its bare label', () => {
    expect(registrarName('www.kajstroberg.se', 'kajstroberg.se')).toBe('www');
  });

  it('keeps every label before the zone', () => {
    expect(
      registrarName('_acme-challenge.www.kajstroberg.se.', 'Kajstroberg.se')
    ).toBe('_acme-challenge.www');
  });

  it('leaves a name outside the zone as it is', () => {
    expect(registrarName('example.com', 'kajstroberg.se')).toBe('example.com');
  });
});

describe('guessZone', () => {
  it('takes an apex as its own zone', () => {
    expect(guessZone('example.co.uk', true)).toBe('example.co.uk');
  });

  it('takes the last two labels of a subdomain', () => {
    expect(guessZone('www.kajstroberg.se', false)).toBe('kajstroberg.se');
  });
});
