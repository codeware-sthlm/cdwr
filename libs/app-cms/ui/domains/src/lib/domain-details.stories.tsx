import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { DomainDetails, type DomainDetailsProps } from './domain-details';

const meta = {
  title: 'App CMS/Domains/DomainDetails'
} satisfies Meta;

export default meta;

const labels: DomainDetailsProps['labels'] = {
  issuesHeading:
    'Fly’s own diagnosis from its last check — it doesn’t have to match the records suggested below:',
  issuesActiveHeading:
    'The certificate is issued, and Fly’s last check still had this to say about the domain:',
  compareResolvers: 'Compare resolvers',
  resolversHeading: 'What the public resolvers see',
  resolversAgree:
    'Every resolver agrees. If the domain still will not load for you, the stale answer is on your own side — your router, your ISP or this machine, not the record.',
  resolversDisagree:
    'The resolvers do not agree yet, which is what a record still spreading looks like. Give it time rather than changing anything.',
  resolversNoAnswer: 'no record yet',
  resolversUnreachable: 'could not be reached',
  issuedHeading: 'Certificates issued for this domain:',
  issuedBy: 'Issued by',
  optionalHeading: 'Optional records',
  challengeHelp:
    'Lets Fly issue the certificate before the domain points here. Only worth adding then; the records on the card are what make the domain answer.',
  ownershipHelp:
    'Only needed if the app has no IPv6 address, or if traffic reaches it through a CDN or proxy.',
  instructionsLede: 'Create this record where the domain’s DNS is managed:',
  copyRecord: 'Copy the DNS target',
  moreInfo: 'More about this'
};

const base = {
  labels,
  onCompare: fn()
} satisfies Partial<DomainDetailsProps>;

const kajstrobergRecords = {
  a: ['46.30.213.129'],
  aaaa: ['2a02:2350:5:100::1'],
  cname: []
};

const kajstrobergReport = {
  agree: true,
  answers: [
    { resolver: 'Cloudflare', records: kajstrobergRecords, challenge: [] },
    { resolver: 'Google', records: kajstrobergRecords, challenge: [] },
    { resolver: 'Quad9', records: kajstrobergRecords, challenge: [] }
  ],
  nameServersNote:
    'DNS for kajstroberg.se is served by ns01.one.com, ns02.one.com.',
  wildcardNote: 'A * record answers 46.30.213.129, 2a02:2350:5:100::1.',
  negativeCacheNote:
    'This zone tells resolvers to remember a “does not exist” answer for up to 3600 seconds, so a record created recently can stay invisible that long.'
} satisfies DomainDetailsProps['resolvers'];

const nameHelp =
  'In full: _acme-challenge.kajstroberg.se. A registrar that appends the domain itself wants only _acme-challenge.';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full max-w-128">{children}</div>
);

/** Fly's diagnosis, the resolvers' answers and the optional records, mid-setup */
export const Pending: StoryObj = {
  render: () => (
    <Frame>
      <DomainDetails
        {...base}
        active={false}
        issues={['DNS records do not match the expected values']}
        resolvers={kajstrobergReport}
        challenge={{
          type: 'CNAME',
          registrarName: '_acme-challenge',
          nameHelp,
          target: 'kajstroberg.se.pnp2erl.flydns.net',
          clue: {
            verdict: 'missing',
            label: 'Record missing',
            detail:
              'Public DNS has no CNAME record for _acme-challenge.kajstroberg.se yet.'
          }
        }}
        ownership={{
          type: 'TXT',
          registrarName: '_fly-ownership',
          nameHelp:
            'In full: _fly-ownership.kajstroberg.se. A registrar that appends the domain itself wants only _fly-ownership.',
          target: 'app-pnp2erl'
        }}
      />
    </Frame>
  )
};

/** Issued, answering and clean: certificates are what the sheet has to show */
export const ActiveWithCertificates: StoryObj = {
  render: () => (
    <Frame>
      <DomainDetails
        {...base}
        active
        issues={null}
        certificateAuthority="lets_encrypt"
        issued={[
          { type: 'RSA', expiresLabel: '15 November 2026' },
          { type: 'ECDSA', expiresLabel: '15 November 2026' }
        ]}
        challenge={{
          type: 'CNAME',
          registrarName: '_acme-challenge',
          nameHelp,
          target: 'kajstroberg.se.pnp2erl.flydns.net',
          confirmed: true
        }}
      />
    </Frame>
  )
};

/** Nobody has asked the resolvers yet, which is the normal state of a sheet */
export const NotCompared: StoryObj = {
  render: () => (
    <Frame>
      <DomainDetails
        {...base}
        active={false}
        issues={['DNS records do not match the expected values']}
      />
    </Frame>
  )
};

/** The button spins while the resolvers are asked, and locks with the rest */
export const Comparing: StoryObj = {
  render: () => (
    <Frame>
      <DomainDetails
        {...base}
        active={false}
        issues={['DNS records do not match the expected values']}
        comparing
        disabled
      />
    </Frame>
  )
};

export const PendingAdminLight = a11yStory(Pending, 'payload-admin', 'light');
export const PendingAdminDark = a11yStory(Pending, 'payload-admin', 'dark');
export const ActiveAdminLight = a11yStory(
  ActiveWithCertificates,
  'payload-admin',
  'light'
);
export const ActiveAdminDark = a11yStory(
  ActiveWithCertificates,
  'payload-admin',
  'dark'
);
