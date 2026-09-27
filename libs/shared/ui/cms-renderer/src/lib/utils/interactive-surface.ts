import { cva } from 'class-variance-authority';

/**
 * How anything clickable answers a pointer, the same way everywhere.
 *
 * The fill rises to the card, the border takes the link colour, and a card lifts
 * a little. The lift is a movement, so only a visitor who has not asked for
 * reduced motion gets it. The ring shows where the keyboard is, on the element
 * itself or on the link stretched across it.
 *
 * Only for what is clickable: a hover on something that does nothing tells the
 * visitor it does something.
 */
export const interactiveSurface = cva(
  'ring-core-link/40 border-border border outline-none transition-[background-color,border-color,box-shadow,translate,color] duration-200 ease-out hover:border-core-link/40 focus-visible:ring-2 has-focus-visible:ring-2',
  {
    variants: {
      shape: {
        card: 'bg-card/50 hover:bg-card hover:shadow-md motion-safe:hover:-translate-y-0.5',
        // Small enough that a lift reads as a jitter; the colour says enough
        pill: 'bg-card hover:border-core-link hover:text-core-link'
      }
    },
    defaultVariants: { shape: 'card' }
  }
);
