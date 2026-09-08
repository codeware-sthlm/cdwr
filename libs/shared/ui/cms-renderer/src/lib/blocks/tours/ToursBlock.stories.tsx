import type { StockMedia, Tour } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ToursBlock } from './ToursBlock';

const meta = {
  title: 'cms-renderer/ToursBlock',
  component: ToursBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof ToursBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Shared library image, as `heroImage` resolves it at depth 2 */
const hero = (alt: string): Tour['heroImage'] => ({
  relationTo: 'stock-media',
  value: {
    id: 1,
    alt,
    url: 'https://placehold.co/1600x900/png',
    width: 1600,
    height: 900,
    mimeType: 'image/png',
    filename: 'stock-vineyard.png',
    filesize: 1024,
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z'
  } as unknown as StockMedia
});

const makeTour = (
  id: number,
  title: string,
  slug: string,
  destination: string,
  duration: string,
  price: number,
  departureDate: string,
  summary: string,
  heroImage?: Tour['heroImage']
): Tour =>
  ({
    id,
    title,
    slug,
    destination,
    duration,
    price,
    currency: 'EUR',
    intent: 'booking',
    departureDate,
    bookingDeadline: '2027-01-15',
    summary,
    heroImage,
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z'
  }) as unknown as Tour;

const tours: Array<Tour> = [
  makeTour(
    1,
    'Barolo & Barbaresco Harvest',
    'barolo-barbaresco-harvest',
    'Piedmont, Italy',
    '7 days',
    2400,
    '2027-09-21',
    'Walk the Nebbiolo vineyards during harvest, taste straight from the barrel and eat your way through the Langhe hills.'
  ),
  makeTour(
    2,
    'Grand Cru Route d’Alsace',
    'grand-cru-route-alsace',
    'Alsace, France',
    '5 days',
    1800,
    '2027-05-04',
    'Riesling and Gewurztraminer along the Route des Vins, with stops in Colmar, Riquewihr and a family estate in Turckheim.'
  ),
  makeTour(
    3,
    'Douro Valley by River',
    'douro-valley-by-river',
    'Douro, Portugal',
    '6 days',
    2100,
    '2027-06-14',
    'Terraced vineyards seen from the water, port lodges in Vila Nova de Gaia and a night at a working quinta.'
  )
];

const toursWithHero: Array<Tour> = tours.map((tour, index) => ({
  ...tour,
  heroImage: hero(
    [
      'Terraced vineyard slopes',
      'A wine village below the vines',
      'Vine rows above a river'
    ][index]
  )
}));

export const WithHeroImages: Story = {
  name: 'Cards with hero image',
  args: {
    blockType: 'tours',
    title: 'Guided wine tours',
    description:
      'Small groups, family estates and a glass in hand from the first day to the last.',
    limit: 3,
    tours: toursWithHero
  }
};

export const TitleOnly: Story = {
  name: 'Title only (no description)',
  args: {
    blockType: 'tours',
    title: 'Our tours',
    limit: 3,
    tours
  }
};

export const SingleTour: Story = {
  name: 'Single tour',
  args: {
    blockType: 'tours',
    title: 'Featured tour',
    limit: 1,
    tours: [tours[0]]
  }
};

/**
 * A tour with a queue is not sold out, and the card has to keep those two
 * apart — a visitor decides whether to click from here
 */
export const CapacityStates: Story = {
  name: 'Capacity states',
  args: {
    blockType: 'tours',
    title: 'Guided wine tours',
    limit: 3,
    tours: [
      tours[0],
      { ...tours[1], signupsQueueOnly: true } as unknown as Tour,
      { ...tours[2], signupsFull: true } as unknown as Tour
    ]
  }
};

const a11yArgs = {
  blockType: 'tours' as const,
  title: 'Guided wine tours',
  description:
    'Small groups, family estates and a glass in hand from the first day to the last.',
  tours
};

export const ShadcnLight = a11yStory({ args: a11yArgs }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args: a11yArgs }, 'shadcn', 'dark');
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
