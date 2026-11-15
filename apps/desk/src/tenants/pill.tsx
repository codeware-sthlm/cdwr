import { PILL } from '../desk/components/status';
import type { View } from '../desk/state';
import type { TenantsPayload } from '../supabase';

import { tenantsView } from './status';
import { DOT_TONE } from './ui';

type Props = {
  data: TenantsPayload | null;
  now: Date;
  /** The view on show, for `aria-current` */
  view: View;
  onView: (view: 'tenants') => void;
};

/** The header's Tenants button: how many tenants, and a dot in the colour of the worst status; grey-dashed with no data yet */
export const TenantsPill = ({ data, now, view, onView }: Props) => {
  const v = tenantsView(data, now);
  const ready = v.kind === 'ready';
  const count = ready ? v.tenants.length : null;
  const label = ready
    ? `Tenants: ${count}, ${v.worst}${v.stale ? ', data is stale' : ''}`
    : `Tenants: ${v.kind === 'empty' ? 'no data yet' : 'loading'}`;
  return (
    <button
      type="button"
      className={`tenants-pill ${PILL}`}
      data-view="tenants"
      data-worst={ready ? v.worst : undefined}
      onClick={() => onView('tenants')}
      aria-label={label}
      aria-current={view === 'tenants' ? 'page' : undefined}
    >
      <svg
        aria-hidden="true"
        className="size-4 flex-none stroke-[color:var(--muted)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="6" rx="1.5" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" />
        <path d="M7 7h.01M7 17h.01" />
      </svg>
      <span className="name max-[600px]:hidden">Tenants</span>
      <span className="count max-[600px]:hidden">{count ?? '–'}</span>
      {ready ? (
        <i
          className={`dot ${DOT_TONE[v.worst]} size-2 flex-none rounded-[var(--r-pill)] max-[600px]:absolute max-[600px]:top-[9px] max-[600px]:right-[9px] max-[600px]:size-[7px]`}
          aria-hidden="true"
        ></i>
      ) : null}
    </button>
  );
};
