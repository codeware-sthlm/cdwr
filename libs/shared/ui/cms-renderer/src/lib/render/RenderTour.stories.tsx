import type {
  Place,
  PlatformLabel,
  StockMedia,
  Tour
} from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { RenderTour } from './RenderTour';

const meta = {
  title: 'cms-renderer/RenderTour',
  component: RenderTour,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof RenderTour>;

export default meta;
type Story = StoryObj<typeof meta>;

const timestamps = {
  createdAt: '2026-01-10T10:00:00.000Z',
  updatedAt: '2026-01-10T10:00:00.000Z'
};

const label = (
  id: number,
  type: PlatformLabel['type'],
  name: string,
  icon: string
): PlatformLabel =>
  ({ id, type, name, icon, ...timestamps }) as unknown as PlatformLabel;

// Icons match what the seed assigns, so the chips look like production
const kinds = {
  activity: label(1, 'place-kind', 'activity', 'MapIcon'),
  hotel: label(2, 'place-kind', 'hotel', 'HomeModernIcon'),
  restaurant: label(3, 'place-kind', 'restaurant', 'CakeIcon'),
  winery: label(4, 'place-kind', 'winery', 'BuildingStorefrontIcon')
};

// Shared platform library image — the atmosphere default
const heroImage: Tour['heroImage'] = {
  relationTo: 'stock-media',
  value: {
    id: 1,
    alt: 'Vineyard terraces above a river valley at sunrise',
    subject: label(5, 'stock-subject', 'vineyard', 'PhotoIcon'),
    url: 'https://placehold.co/1600x900/png',
    width: 1600,
    height: 900,
    mimeType: 'image/png',
    filename: 'stock-vineyard.png',
    filesize: 1024,
    ...timestamps
  } as unknown as StockMedia
};

const richText = (paragraphs: Array<string>) => ({
  root: {
    type: 'root',
    version: 1,
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      version: 1,
      children: [{ type: 'text', version: 1, text }],
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0
    })),
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0
  }
});

const place = (
  id: number,
  name: string,
  kind: Place['kind'],
  note: string
): Place =>
  ({
    id,
    name,
    kind,
    note,
    url: `https://example.com/${id}`,
    ...timestamps
  }) as unknown as Place;

const places = {
  estate: place(
    1,
    'Cascina Fontanazza',
    kinds.winery,
    'Family estate above Barolo'
  ),
  hotel: place(
    2,
    'Albergo del Sole',
    kinds.hotel,
    'Twelve rooms on the square'
  ),
  osteria: place(
    3,
    'Osteria Vecchia',
    kinds.restaurant,
    'Tasting menu, no à la carte'
  ),
  hunt: place(
    4,
    'Truffle hunt with Bruno',
    kinds.activity,
    'Two hours, dogs included'
  )
};

const itinerary = [
  {
    title: 'Arrival & welcome dinner',
    places: [places.hotel, places.estate],
    description:
      'Transfer from the airport, a walk through the old town and a long first dinner at the estate with the winemaker.'
  },
  {
    title: 'The Nebbiolo slopes',
    places: [places.estate],
    description:
      'Morning in the vineyards during harvest, tasting straight from the barrel after lunch.'
  },
  {
    title: 'Barbaresco',
    description:
      'A slower day across the valley, with three small producers and a late afternoon free in the village.'
  },
  {
    title: 'Truffle country',
    places: [places.hunt, places.osteria],
    description:
      'Into the hills with a truffle hunter and their dogs, followed by a tasting menu built around the morning find.'
  },
  {
    title: 'Departure',
    description: 'A last breakfast on the terrace, then transfers home.'
  }
];

const tour: Tour = {
  id: 1,
  title: 'Barolo & Barbaresco Harvest',
  slug: 'barolo-barbaresco-harvest',
  destination: 'Piedmont, Italy',
  duration: '5 days',
  price: 2400,
  currency: 'EUR',
  intent: 'booking',
  departureDate: '2027-09-21',
  bookingDeadline: '2027-07-21',
  summary:
    'Walk the Nebbiolo vineyards during harvest, taste straight from the barrel and eat your way through the Langhe hills with a small group and a local guide.',
  heroImage,
  itinerary,
  maxCustomers: 20,
  seatsTaken: 12,
  seatsLeft: 8,
  signupsFull: false,
  included: [
    { item: 'All transfers from Turin' },
    { item: 'Five nights with breakfast' },
    { item: 'Four dinners' },
    { item: 'Every tasting on the itinerary' },
    { item: 'A guide throughout' }
  ],
  notIncluded: [
    { item: 'Flights' },
    { item: 'Lunches' },
    { item: 'Anything you ship home' }
  ],
  content: richText([
    'Five days in the Langhe at the busiest and best time of the year.',
    'The Nebbiolo grape is harvested in September, and the hills are alive with the smell of crushed grapes and the sound of tractors.',
    'We will walk the vineyards, taste straight from the barrel and eat our way through the hills with a small group and a local guide.'
  ]),
  ...timestamps
} as unknown as Tour;

export const Default: Story = {
  name: 'Full tour',
  args: { tour }
};

export const WithoutPlaces: Story = {
  name: 'Itinerary without places',
  args: {
    tour: {
      ...tour,
      itinerary: itinerary.map((day) => ({ ...day, places: undefined }))
    } as unknown as Tour
  }
};

export const InterestOnly: Story = {
  name: 'Interest only (departure unconfirmed)',
  args: {
    tour: {
      ...tour,
      intent: 'interest',
      departureDate: null,
      bookingDeadline: null,
      departureNote: 'Autumn 2027 — dates to be confirmed'
    } as unknown as Tour
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

export const QueueOnly: Story = {
  name: 'Seats left, queue served first',
  args: {
    tour: {
      ...tour,
      seatsTaken: 16,
      seatsLeft: 4,
      signupsQueueOnly: true
    } as unknown as Tour
  }
};

export const SignupsClosed: Story = {
  name: 'Closed for signups (no CTA)',
  args: { tour: { ...tour, signupsClosed: true } as unknown as Tour }
};

export const NoMaximum: Story = {
  name: 'No maximum set',
  args: {
    tour: {
      ...tour,
      maxCustomers: null,
      seatsLeft: null,
      signupsFull: false
    } as unknown as Tour
  }
};

export const Minimal: Story = {
  name: 'Minimal (no content, lists or itinerary)',
  args: {
    tour: {
      ...tour,
      content: null,
      itinerary: null,
      included: null,
      notIncluded: null,
      duration: null
    } as unknown as Tour
  }
};

const a11yArgs = { tour };

export const FrostLight = a11yStory({ args: a11yArgs }, 'frost', 'light');
export const FrostDark = a11yStory({ args: a11yArgs }, 'frost', 'dark');
export const PayloadAdminLight = a11yStory(
  { args: a11yArgs },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: a11yArgs },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: a11yArgs },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory({ args: a11yArgs }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args: a11yArgs }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args: a11yArgs }, 'codeware', 'dark');
