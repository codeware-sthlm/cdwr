import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import type { RecordClue, RequiredRecord } from './dns-record';
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
  saveFirst: 'Save to request a certificate for this domain.',
  request: 'Request certificate',
  check: 'Check now',
  remove: 'Remove certificate',
  details: 'Details',
  copyRecord: 'Copy the DNS target',
  moreInfo: 'More about this'
};

const apexNote =
  'This is the domain itself rather than a subdomain, so a CNAME is not allowed — it needs A and AAAA records pointing at the app’s IP addresses.';
const subdomainNote =
  'A subdomain points at the app with this CNAME, or with A and AAAA records at the app’s addresses, which Fly accepts too. A CNAME cannot sit beside other records on the same name.';
const wildcardAdvice =
  'A * record answers for every subdomain nobody created. It doesn’t affect the names on this card, since an exact record wins, but it sends every other subdomain wherever it points; pointed at the app, they reach it without a certificate. Remove * unless the site needs it.';
const nextStepCreate =
  'Create these records where DNS for codeware.se is served, then press Check now.';
const nextStepWaitFly =
  'Public DNS answers as expected; Fly has not confirmed it yet. Press Check now.';
const nextStepNameServers =
  'DNS for kajstroberg.se is served by ns01.one.com, ns02.one.com, which doesn’t answer with these records yet. Create or change them there, then press Check now.';

const apexNameHelp = (name: string) =>
  `The domain itself, ${name}. Most registrars write it as @; some want the name left empty.`;
const subNameHelp = (name: string, label: string) =>
  `In full: ${name}. A registrar that appends the domain itself wants only ${label}.`;

const base = {
  hostname: 'pr-test.codeware.se',
  app: 'cdwr-cms-pr-477-demo',
  saved: true,
  labels,
  onAction: () => undefined
} satisfies Partial<DomainCardProps>;

const cname = (extra: Partial<RequiredRecord> = {}): RequiredRecord => ({
  type: 'CNAME',
  registrarName: 'pr-test',
  nameHelp: subNameHelp('pr-test.codeware.se', 'pr-test'),
  target: 'cdwr-cms-pr-477-demo.fly.dev',
  ...extra
});

const dns = {
  records: [cname()],
  note: subdomainNote,
  wildcard: { advice: wildcardAdvice }
} satisfies DomainCardProps['dns'];

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
        nextStep={nextStepCreate}
        dns={dns}
      />
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 14 Aug 22:44"
        dns={{ ...dns, records: [cname({ confirmed: true })] }}
      />
    </Frame>
  )
};

const mismatch: RecordClue = {
  verdict: 'mismatch',
  label: 'Points at the wrong server',
  detail: 'Answers 46.30.213.129, should be cdwr-cms-pr-477-demo.fly.dev.'
};

/**
 * After a check: what Fly confirmed shows as a checkmark, what public DNS
 * answers as a clue beside the record, and the next step says what is left.
 * Fly's own diagnosis lives behind Details.
 */
export const CheckedWithIssues: StoryObj = {
  render: () => (
    <Frame>
      {/* Not in place, and public DNS has nothing for it */}
      <DomainCard
        {...base}
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 15 Aug 00:40"
        nextStep={nextStepCreate}
        dns={{
          ...dns,
          records: [
            cname({
              clue: {
                verdict: 'missing',
                label: 'Record missing',
                detail:
                  'Public DNS has no CNAME record for pr-test.codeware.se yet.'
              }
            })
          ]
        }}
      />
      {/* Pointing somewhere else */}
      <DomainCard
        {...base}
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 15 Aug 00:40"
        nextStep="Fly reports a problem with this domain. See Details."
        dns={{ ...dns, records: [cname({ clue: mismatch })] }}
      />
      {/* Public DNS is right, Fly has not caught up */}
      <DomainCard
        {...base}
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 15 Aug 00:40"
        nextStep={nextStepWaitFly}
        dns={{
          ...dns,
          records: [
            cname({
              clue: {
                verdict: 'match',
                label: 'Answers as expected',
                detail: nextStepWaitFly
              }
            })
          ]
        }}
      />
      {/* Active and Fly still reports something: the next step points at
          Details, the record stays confirmed */}
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 15 Aug 00:41"
        nextStep="Fly reports a problem with this domain. See Details."
        dns={{ ...dns, records: [cname({ confirmed: true })] }}
      />
      {/* Active and clean: no next step */}
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 15 Aug 00:41"
        dns={{ ...dns, records: [cname({ confirmed: true })] }}
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
        dns={dns}
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

/** A settled subdomain Fly itself has confirmed, with nothing left to do */
export const ConfirmedByFly: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 14 Aug 22:44"
        dns={{ ...dns, records: [cname({ confirmed: true })] }}
      />
    </Frame>
  )
};

const apexRecords: Array<RequiredRecord> = [
  {
    type: 'A',
    registrarName: '@',
    nameHelp: apexNameHelp('example.com'),
    target: '192.0.2.10'
  },
  {
    type: 'AAAA',
    registrarName: '@',
    nameHelp: apexNameHelp('example.com'),
    target: '2001:db8:1::19b:2e4e:0'
  }
];

const apexDns = {
  records: apexRecords,
  note: apexNote,
  wildcard: { advice: wildcardAdvice }
} satisfies DomainCardProps['dns'];

/**
 * An apex domain cannot use a CNAME, so the A and AAAA records stand in for
 * it. The second card has been checked: the A record is in place, AAAA is not.
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
        nextStep="Create these records where DNS for example.com is served, then press Check now."
        dns={apexDns}
      />
      <DomainCard
        {...base}
        hostname="example.com"
        status="pending"
        statusDetail="Awaiting configuration"
        checkedLabel="Checked 15 Aug 00:40"
        nextStep="Create these records where DNS for example.com is served, then press Check now."
        dns={{
          ...apexDns,
          records: [
            { ...apexRecords[0], confirmed: true },
            {
              ...apexRecords[1],
              clue: {
                verdict: 'missing',
                label: 'Missing IPv6 record',
                detail: 'Public DNS has no AAAA record for example.com yet.'
              }
            }
          ]
        }}
      />
      <DomainCard
        {...base}
        hostname="example.com"
        status="pending"
        statusDetail="Awaiting configuration"
        dns={{
          ...apexDns,
          records: [],
          pendingNote:
            'No addresses known yet. Press Check now to fetch them; if none appear, the app has no public address and needs one allocated in Fly.'
        }}
      />
    </Frame>
  )
};

const kajstrobergApp = 'cdwr-cms-ks-vininfo';

const kajstrobergBase = {
  ...base,
  app: kajstrobergApp,
  status: 'pending',
  statusDetail: 'Awaiting configuration',
  checkedLabel: 'Checked 15 Aug 00:40'
} satisfies Partial<DomainCardProps>;

const kajstrobergWildcard = {
  advice: wildcardAdvice,
  found: 'A * record answers 46.30.213.129, 2a02:2350:5:100::1.'
};

const wwwNameHelp = subNameHelp('www.kajstroberg.se', 'www');

/**
 * An apex whose DNS is served by another provider: the A record points at a
 * foreign server, the AAAA record is absent, and the next step names where
 * the records have to be created.
 */
export const KajstrobergApex: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...kajstrobergBase}
        hostname="kajstroberg.se"
        nextStep={nextStepNameServers}
        dns={{
          records: [
            {
              type: 'A',
              registrarName: '@',
              nameHelp: apexNameHelp('kajstroberg.se'),
              target: '66.241.124.125',
              clue: {
                verdict: 'mismatch',
                label: 'Points at the wrong server',
                detail: 'Answers 46.30.213.129, should be 66.241.124.125.'
              }
            },
            {
              type: 'AAAA',
              registrarName: '@',
              nameHelp: apexNameHelp('kajstroberg.se'),
              target: '2a09:8280:1::d1:eaa0:0',
              clue: {
                verdict: 'missing',
                label: 'Missing IPv6 record',
                detail: 'Public DNS has no AAAA record for kajstroberg.se yet.'
              }
            }
          ],
          note: apexNote,
          wildcard: kajstrobergWildcard
        }}
      />
    </Frame>
  )
};

/**
 * A www host whose name already carries an A record elsewhere: a CNAME cannot
 * sit beside it, so the clue says what to remove first.
 */
export const KajstrobergWwwForeignA: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...kajstrobergBase}
        hostname="www.kajstroberg.se"
        nextStep={nextStepNameServers}
        dns={{
          records: [
            {
              type: 'CNAME',
              registrarName: 'www',
              nameHelp: wwwNameHelp,
              target: `${kajstrobergApp}.fly.dev`,
              clue: {
                verdict: 'mismatch',
                label: 'Points at the wrong server',
                detail: `Answers 46.30.213.129, should be ${kajstrobergApp}.fly.dev. Remove what www.kajstroberg.se has now first: a CNAME cannot sit beside other records. Or point its A and AAAA records at the app’s addresses instead.`
              }
            }
          ],
          note: subdomainNote,
          wildcard: kajstrobergWildcard
        }}
      />
    </Frame>
  )
};

/** The www host already answers with the app's addresses; Fly has not caught up */
export const KajstrobergWwwByAddress: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...kajstrobergBase}
        hostname="www.kajstroberg.se"
        nextStep={nextStepWaitFly}
        dns={{
          records: [
            {
              type: 'CNAME',
              registrarName: 'www',
              nameHelp: wwwNameHelp,
              target: `${kajstrobergApp}.fly.dev`,
              clue: {
                verdict: 'match',
                label: 'Answers as expected',
                detail: nextStepWaitFly
              }
            }
          ],
          note: subdomainNote,
          wildcard: kajstrobergWildcard
        }}
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
        nextStep={nextStepCreate}
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
        nextStep="Create these records where DNS for kulturhuset-vasterbotten.se is served, then press Check now."
        dns={{
          ...dns,
          records: [
            {
              type: 'CNAME',
              registrarName: 'gallerier-och-utstallningar',
              nameHelp: subNameHelp(
                'gallerier-och-utstallningar.kulturhuset-vasterbotten.se',
                'gallerier-och-utstallningar'
              ),
              target: 'cdwr-web-kulturhuset-vasterbotten-prod.fly.dev'
            }
          ]
        }}
      />
    </Frame>
  )
};

/** A settled domain: the records it runs on, confirmed, and nothing to do */
export const Settled: StoryObj = {
  render: () => (
    <Frame>
      <DomainCard
        {...base}
        status="active"
        checkedLabel="Checked 14 Aug 22:42"
        dns={{ ...dns, records: [cname({ confirmed: true })] }}
      />
      <DomainCard
        {...base}
        hostname="example.com"
        status="active"
        checkedLabel="Checked 14 Aug 22:42"
        dns={{
          ...apexDns,
          records: apexRecords.map((record) => ({
            ...record,
            confirmed: true
          }))
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
export const KajstrobergAdminLight = a11yStory(
  KajstrobergApex,
  'payload-admin',
  'light'
);
export const KajstrobergAdminDark = a11yStory(
  KajstrobergApex,
  'payload-admin',
  'dark'
);
export const ApexAdminLight = a11yStory(ApexDomain, 'payload-admin', 'light');
export const ApexAdminDark = a11yStory(ApexDomain, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Lifecycle, 'frost', 'light');
export const FrostDark = a11yStory(Lifecycle, 'frost', 'dark');
