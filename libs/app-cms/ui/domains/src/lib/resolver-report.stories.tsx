import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ResolverReport } from './resolver-report';

const meta = {
  title: 'App CMS/Domains/ResolverReport'
} satisfies Meta;

export default meta;

const labels = {
  heading: 'What the public resolvers see',
  agreeLede:
    'Every resolver agrees. If the domain still will not load for you, the stale answer is on your own side — your router, your ISP or this machine, not the record.',
  disagreeLede:
    'The resolvers do not agree yet, which is what a record still spreading looks like. Give it time rather than changing anything.',
  noAnswer: 'no record yet',
  unreachable: 'could not be reached'
};

const negativeCacheNote =
  'This zone tells resolvers to remember a “does not exist” answer for up to 3600 seconds, so a record created recently can stay invisible that long.';

const none = { a: [], aaaa: [], cname: [] };
const flyApp = { a: [], aaaa: [], cname: ['cdwr-cms-demo.fly.dev'] };

export const Cases: StoryObj = {
  render: () => (
    <div className="flex w-full max-w-160 flex-col gap-4">
      {/* The incident this whole feature came from: everyone agrees, and the
          browser still says NXDOMAIN */}
      <ResolverReport
        agree
        answers={[
          { resolver: 'Cloudflare', records: flyApp, challenge: [] },
          { resolver: 'Google', records: flyApp, challenge: [] },
          { resolver: 'Quad9', records: flyApp, challenge: [] }
        ]}
        negativeCacheNote={negativeCacheNote}
        labels={labels}
      />
      {/* Genuinely mid-propagation */}
      <ResolverReport
        agree={false}
        answers={[
          { resolver: 'Cloudflare', records: flyApp, challenge: [] },
          { resolver: 'Google', records: none, challenge: [] },
          {
            resolver: 'Quad9',
            records: { a: [], aaaa: [], cname: ['old-target.fly.dev'] },
            challenge: []
          }
        ]}
        negativeCacheNote={negativeCacheNote}
        labels={labels}
      />
      {/* One resolver down, which must not read as the domain disagreeing */}
      <ResolverReport
        agree
        answers={[
          { resolver: 'Cloudflare', records: flyApp, challenge: [] },
          { resolver: 'Google', records: flyApp, challenge: [] },
          {
            resolver: 'Quad9',
            records: none,
            challenge: [],
            error: 'ETIMEOUT'
          }
        ]}
        negativeCacheNote={null}
        labels={labels}
      />
    </div>
  )
};

const kajstrobergRecords = {
  a: ['46.30.213.129'],
  aaaa: ['2a02:2350:5:100::1'],
  cname: []
};

/**
 * An apex served elsewhere: every resolver agrees, and what they agree on is
 * another host's addresses. The name servers and the stray `*` record say why.
 */
export const Kajstroberg: StoryObj = {
  render: () => (
    <div className="flex w-full max-w-160 flex-col gap-4">
      <ResolverReport
        agree
        answers={[
          {
            resolver: 'Cloudflare',
            records: kajstrobergRecords,
            challenge: []
          },
          { resolver: 'Google', records: kajstrobergRecords, challenge: [] },
          { resolver: 'Quad9', records: kajstrobergRecords, challenge: [] }
        ]}
        nameServersNote="DNS for kajstroberg.se is served by ns01.one.com, ns02.one.com."
        wildcardNote="A * record answers 46.30.213.129, 2a02:2350:5:100::1."
        negativeCacheNote={negativeCacheNote}
        labels={labels}
      />
    </div>
  )
};

export const PayloadAdminLight = a11yStory(Cases, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Cases, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Cases, 'frost', 'light');
export const FrostDark = a11yStory(Cases, 'frost', 'dark');
