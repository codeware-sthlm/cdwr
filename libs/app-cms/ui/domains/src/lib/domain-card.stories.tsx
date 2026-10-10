import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { DomainCard, type DomainCardProps } from './domain-card';

const meta = {
  title: 'App CMS/Domains/DomainCard'
} satisfies Meta;

export default meta;

const labels: DomainCardProps['labels'] = {
  active: 'Active',
  pending: 'Waiting for DNS',
  notRequested: 'No certificate yet',
  paused: 'Paused',
  saveFirst: 'Save the workspace to request a certificate for this domain.',
  request: 'Request certificate',
  check: 'Check now',
  remove: 'Remove certificate',
  copyRecord: 'Copy DNS target',
  dnsLede: 'Create this record where the domain’s DNS is managed:',
  dnsNameHint:
    'Record names are written in full — a registrar that appends the domain itself only wants the part before it.',
  dnsOwnershipLede:
    'Only needed if the app has no IPv6 address, or if traffic reaches it through a CDN or proxy:',
  issuesHeading:
    'Fly’s own diagnosis from its last check — it doesn’t have to match the records suggested below:',
  issuesActiveHeading:
    'The certificate is issued, and Fly’s last check still had this to say about the domain:',
  dnsTrafficLede:
    'Point the domain at the app, where the domain’s DNS is managed. Without this record the domain answers nowhere, certificate or not:',
  dnsValidationLede:
    'Optional, and only worth adding to have the certificate issued before the domain points here:',
  dnsSettledLede:
    'These are the records the domain runs on. They stay needed — remove one and the domain stops answering, certificate or not:',
  apexNote:
    'This is the domain itself rather than a subdomain, so a CNAME is not allowed — it needs A and AAAA records pointing at the app’s IP addresses.',
  apexAddressesPending:
    'No addresses known yet. Press Check now to fetch them; if none appear, the app has no public address and needs one allocated in Fly.',
  issuedHeading: 'Issued certificates',
  issuedBy: 'Issued by',
  compareResolvers: 'Compare resolvers',
  resolversHeading: 'What the public resolvers see',
  resolversAgree:
    'Every resolver agrees. If the domain still will not load for you, the stale answer is on your own side — your router, your ISP or this machine.',
  resolversDisagree:
    'The resolvers do not agree yet, which is what a record still spreading looks like.',
  resolversNoAnswer: 'no record yet',
  resolversUnreachable: 'could not be reached'
};

const base = {
  hostname: 'pr-test.codeware.se',
  app: 'cdwr-cms-pr-477-demo',
  saved: true,
  labels,
  onAction: () => undefined
} satisfies Partial<DomainCardProps>;

const dns = {
  name: '_acme-challenge.pr-test.codeware.se',
  target: 'pr-test.codeware.se.w0608qd.flydns.net.',
  // Fly repeats the record in prose; the card must not print it twice
  instructions:
    'CNAME _acme-challenge.pr-test.codeware.se ⇒ pr-test.codeware.se.w0608qd.flydns.net.'
};

/** The card takes its width from the panel, so the frame only caps it */
const Frame = ({
  children,
  width = 'w-full max-w-160'
}: {
  children: React.ReactNode;
  width?: string;
}) => <div className={`flex flex-col gap-4 ${width}`}>{children}</div>;

/** Every state a domain moves through, top to bottom */
export const Lifecycle: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard {...base} status="not-requested" />
      <DomainCard
        {...base}
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 14 Aug 22:42"
        dns={dns}
      />
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 14 Aug 22:44"
        dns={dns}
      />
    </Frame>
  )
};

/**
 * After a check: Fly's own diagnosis, boxed apart from the suggestion below
 * it, plus the ownership record that answers it when Fly cannot read the
 * app's address off the domain. The first card is exactly the case that
 * looks contradictory without the framing — Fly complains about AAAA, the
 * suggestion below is a CNAME — and the box is what explains why that's fine.
 */
export const CheckedWithIssues: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...base}
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 15 Aug 00:40"
        dns={dns}
        check={{
          issues: ['No AAAA records were found for your domain'],
          ownershipRecord: 'app-w0608qd'
        }}
      />
      <DomainCard
        {...base}
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 15 Aug 00:40"
        dns={dns}
        check={{
          issues: [
            'No AAAA records were found for your domain',
            'The CNAME record points at an app that does not serve this hostname'
          ],
          ownershipRecord: 'app-w0608qd'
        }}
      />
      {/* The traffic record resolves; the ACME challenge one has not been
          created yet — a checkmark tells them apart without another read */}
      <DomainCard
        {...base}
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 15 Aug 00:40"
        dns={dns}
        check={{
          issues: ['DNS not configured for certificate validation'],
          confirmed: { traffic: true, validation: false }
        }}
      />
      {/* Active, but Fly still has something to say — the challenge record is
          commonly removed once issued, so this is a normal end state, not a
          fault. The box reads neutral rather than red, and the dns block
          below keeps its setup voice since something here is still unconfirmed */}
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 15 Aug 00:41"
        dns={dns}
        check={{
          issues: [
            'No TXT record was found at _acme-challenge for your domain'
          ],
          confirmed: { traffic: true, validation: false }
        }}
      />
      {/* Active and clean: no issues box, and the dns block switches to its
          settled voice — the pair above and below is what a reviewer compares */}
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 15 Aug 00:41"
        dns={dns}
        check={{ confirmed: { traffic: true, validation: true } }}
      />
    </Frame>
  )
};

/** The states that need saying out loud rather than just waiting */
export const NeedsAttention: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...base}
        status="paused"
        checkedLabel="Checked 14 Aug 22:42"
        pausedMessage="Let’s Encrypt has paused new attempts for this domain until 15 Aug 08:00. Retrying before then only extends the pause."
      />
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 14 Aug 22:42"
      />
      <DomainCard {...base} status="pending" />
      <DomainCard {...base} status="not-requested" saved={false} />
    </Frame>
  )
};

const apexDns = {
  isApex: true,
  name: '_acme-challenge.example.com',
  target: 'example.com.abc123.flydns.net',
  instructions:
    'CNAME _acme-challenge.example.com => example.com.abc123.flydns.net.',
  addresses: [
    { type: 'A' as const, address: '192.0.2.10' },
    { type: 'AAAA' as const, address: '2001:db8:1::19b:2e4e:0' }
  ]
};

/**
 * An apex domain cannot use a CNAME, so the A and AAAA records stand in for
 * it. The second card has been checked: the A record resolves, AAAA does not.
 * The third was stored before the addresses were known.
 */
export const ApexDomain: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...base}
        hostname="example.com"
        status="pending"
        statusDetail="Awaiting configuration"
        dns={apexDns}
      />
      <DomainCard
        {...base}
        hostname="example.com"
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 15 Aug 00:40"
        dns={apexDns}
        check={{
          issues: ['No AAAA records were found for your domain'],
          confirmed: {
            traffic: false,
            validation: false,
            addresses: ['192.0.2.10']
          }
        }}
      />
      <DomainCard
        {...base}
        hostname="example.com"
        status="pending"
        statusDetail="Awaiting configuration"
        dns={{ ...apexDns, addresses: undefined }}
      />
    </Frame>
  )
};

/** Only the button that was pressed spins */
export const Working: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...base}
        status="not-requested"
        runningAction="request"
        disabled
      />
      <DomainCard
        {...base}
        status="pending"
        statusDetail="Awaiting configuration"
        dns={dns}
        runningAction="check"
        disabled
      />
      <DomainCard {...base} status="active" runningAction="remove" disabled />
    </Frame>
  )
};

/**
 * A narrow field with names too long for one line — where the header, the
 * actions and the dns record each have to wrap or break
 */
export const Narrow: StoryObj = {
  render: () => (
    <Frame width="w-72">
      <DomainCard
        {...base}
        hostname="gallerier-och-utstallningar.kulturhuset-vasterbotten.se"
        app="cdwr-web-kulturhuset-vasterbotten-prod"
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 14 Aug 22:42"
        dns={{
          name: '_acme-challenge.gallerier-och-utstallningar.kulturhuset-vasterbotten.se',
          target:
            'gallerier-och-utstallningar.kulturhuset-vasterbotten.se.w0608qd.flydns.net.'
        }}
      />
    </Frame>
  )
};

/**
 * A settled domain carrying everything it can carry.
 *
 * The two issued rows share an expiry — Fly renews the RSA and ECDSA pair
 * together — which is why they are rows rather than a table.
 */
export const Settled: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 14 Aug 22:42"
        dns={dns}
        certificateAuthority="lets_encrypt"
        issued={[
          { type: 'RSA', expiresLabel: '15 November 2026' },
          { type: 'ECDSA', expiresLabel: '15 November 2026' }
        ]}
      />
      {/* Renewal has quietly stopped working — the one case the expiry is
          worth printing for */}
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 14 Aug 22:42"
        dns={dns}
        certificateAuthority="lets_encrypt"
        issued={[
          { type: 'RSA', expiresLabel: '28 August 2026', expiringSoon: true },
          { type: 'ECDSA', expiresLabel: '28 August 2026', expiringSoon: true }
        ]}
      />
    </Frame>
  )
};

/** Green everywhere, and still not loading — what the comparison is for */
export const ResolversCompared: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 14 Aug 22:42"
        dns={dns}
        resolvers={{
          agree: true,
          answers: [
            { resolver: 'Cloudflare', records: ['cdwr-cms-demo.fly.dev'] },
            { resolver: 'Google', records: ['cdwr-cms-demo.fly.dev'] },
            { resolver: 'Quad9', records: ['cdwr-cms-demo.fly.dev'] }
          ],
          negativeCacheNote:
            'This zone tells resolvers to remember a “does not exist” answer for up to 3600 seconds, so a record created recently can stay invisible that long.'
        }}
      />
      <DomainCard
        {...base}
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 14 Aug 22:42"
        dns={dns}
        resolvers={{
          agree: false,
          answers: [
            { resolver: 'Cloudflare', records: ['cdwr-cms-demo.fly.dev'] },
            { resolver: 'Google', records: [] },
            { resolver: 'Quad9', records: [], error: 'ETIMEOUT' }
          ],
          negativeCacheNote: null
        }}
      />
    </Frame>
  )
};

export const PayloadAdminLight = a11yStory(Lifecycle, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Lifecycle, 'payload-admin', 'dark');
export const AttentionAdminLight = a11yStory(
  NeedsAttention,
  'payload-admin',
  'light'
);
export const AttentionAdminDark = a11yStory(
  NeedsAttention,
  'payload-admin',
  'dark'
);
export const NarrowAdminLight = a11yStory(Narrow, 'payload-admin', 'light');
export const NarrowAdminDark = a11yStory(Narrow, 'payload-admin', 'dark');
export const IssuesAdminLight = a11yStory(
  CheckedWithIssues,
  'payload-admin',
  'light'
);
export const IssuesAdminDark = a11yStory(
  CheckedWithIssues,
  'payload-admin',
  'dark'
);
export const SettledAdminLight = a11yStory(Settled, 'payload-admin', 'light');
export const SettledAdminDark = a11yStory(Settled, 'payload-admin', 'dark');
export const ResolversAdminLight = a11yStory(
  ResolversCompared,
  'payload-admin',
  'light'
);
export const ResolversAdminDark = a11yStory(
  ResolversCompared,
  'payload-admin',
  'dark'
);
export const ApexAdminLight = a11yStory(ApexDomain, 'payload-admin', 'light');
export const ApexAdminDark = a11yStory(ApexDomain, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Lifecycle, 'frost', 'light');
export const FrostDark = a11yStory(Lifecycle, 'frost', 'dark');
