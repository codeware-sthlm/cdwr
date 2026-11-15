import type { TenantsPayload } from '../../supabase';
import { plural } from '../format';
import type { Model } from '../model';
import type { Detail, View } from '../state';
import { agentCount, platformCount } from '../view/header';

// The header's two top-level views, Agent and Platform, each with what needs you in it.

const BUTTON =
  'relative inline-flex min-h-[var(--tap)] items-center gap-2 rounded-[var(--r-pill)] bg-[color:var(--surface)] px-4 py-0 font-[family-name:var(--font-ui)] text-[12px] leading-[normal] font-normal hover:bg-[color:var(--sunk)] aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_0_0_0_1px_var(--accent)] max-[600px]:gap-1.5 max-[600px]:px-3';

// A stale count is grey and dashed, the unknown state's look
const COUNT =
  'count rounded-[var(--r-pill)] px-1.5 font-[family-name:var(--font-mono)] text-[11px] tabular-nums data-[stale=true]:text-[color:var(--muted)] data-[stale=true]:outline-1 data-[stale=true]:outline-offset-1 data-[stale=true]:outline-[color:var(--faint)] data-[stale=true]:outline-dashed';

type Props = {
  m: Model;
  details: ReadonlyMap<string, Detail>;
  tenants: TenantsPayload | null;
  now: Date;
  /** The view on show; Agent is current on its pages too */
  view: View;
  onView: (view: 'agent' | 'platform') => void;
};

export const ViewSwitch = ({
  m,
  details,
  tenants,
  now,
  view,
  onView
}: Props) => {
  const agent = agentCount(m, details, now);
  const platform = platformCount(tenants, now);
  const agentLabel = `Agent: ${agent === null ? 'loading' : agent ? `${agent} waiting on you` : 'nothing waiting on you'}`;
  const platformLabel = `Platform: ${
    platform.count === null
      ? platform.empty
        ? 'no data yet'
        : 'loading'
      : platform.count
        ? plural(platform.count, 'problem', 'problems')
        : 'no problems'
  }${platform.stale ? ', data is stale' : ''}`;
  return (
    <div className="view-switch flex flex-none items-center gap-[6px]">
      <button
        type="button"
        className={`${BUTTON} view-agent`}
        data-view="agent"
        onClick={() => onView('agent')}
        aria-label={agentLabel}
        aria-current={view !== 'platform' ? 'page' : undefined}
      >
        <span className="name">Agent</span>
        <span className={`${COUNT} ${agent ? 'text-[color:var(--wait)]' : ''}`}>
          {agent ?? '–'}
        </span>
      </button>
      <button
        type="button"
        className={`${BUTTON} view-platform`}
        data-view="platform"
        onClick={() => onView('platform')}
        aria-label={platformLabel}
        aria-current={view === 'platform' ? 'page' : undefined}
      >
        <span className="name">Platform</span>
        <span
          className={`${COUNT} ${platform.count ? 'text-[color:var(--block)]' : ''}`}
          data-stale={platform.stale}
        >
          {platform.count ?? '–'}
        </span>
      </button>
    </div>
  );
};
