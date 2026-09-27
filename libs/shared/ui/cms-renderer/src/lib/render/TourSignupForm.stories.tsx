import type { Tour } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { TourSignupForm } from './TourSignupForm';

const meta = {
  title: 'cms-renderer/TourSignupForm',
  component: TourSignupForm
} satisfies Meta<typeof TourSignupForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Only the fields the form actually reads */
const tour = {
  id: 1,
  title: 'Barolo & Barbaresco Harvest',
  intent: 'booking',
  maxCustomers: 20,
  seatsTaken: 12,
  seatsLeft: 8,
  signupsFull: false,
  signupsClosed: false
} as unknown as Tour;

export const Open: Story = {
  name: 'Open (places left)',
  args: { tour }
};

export const NearlyFull: Story = {
  name: 'Nearly full',
  args: {
    tour: { ...tour, seatsTaken: 18, seatsLeft: 2 } as unknown as Tour
  }
};

export const Full: Story = {
  name: 'Full (waiting list)',
  args: {
    tour: {
      ...tour,
      seatsTaken: 20,
      seatsLeft: 0,
      signupsFull: true
    } as unknown as Tour
  }
};

/**
 * Seats remain, but people are already waiting for them — the form offers the
 * queue rather than a place it would not hand over
 */
export const QueueOnly: Story = {
  name: 'Seats left, queue served first',
  args: {
    tour: {
      ...tour,
      seatsTaken: 16,
      seatsLeft: 4,
      signupsFull: false,
      signupsQueueOnly: true
    } as unknown as Tour
  }
};

export const NoMaximum: Story = {
  name: 'No maximum set',
  args: {
    tour: {
      ...tour,
      maxCustomers: null,
      seatsLeft: null
    } as unknown as Tour
  }
};

/**
 * With a terms page configured the customer has something to accept, and the
 * form refuses to submit until they do
 */
export const WithTerms: Story = {
  name: 'With terms to accept',
  args: { tour },
  parameters: {
    signupPolicy: {
      privacyUrl: '/privacy',
      termsUrl: '/terms',
      retentionDays: 365
    }
  }
};

export const WithoutPolicy: Story = {
  name: 'Nothing configured (plain notice)',
  args: { tour },
  parameters: { signupPolicy: null }
};

export const Closed: Story = {
  name: 'Closed for signups',
  args: { tour: { ...tour, signupsClosed: true } as unknown as Tour }
};

const a11yArgs = { tour };

export const FrostLight = a11yStory({ args: a11yArgs }, 'frost', 'light');
export const FrostDark = a11yStory({ args: a11yArgs }, 'frost', 'dark');
export const SpotlightLight = a11yStory(
  { args: a11yArgs },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory({ args: a11yArgs }, 'spotlight', 'dark');
