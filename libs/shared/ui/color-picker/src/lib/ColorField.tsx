'use client';

import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@codeware/shared/ui/shadcn/components/popover';
import {
  type Rgba,
  formatOklch,
  oklchToRgb,
  parseColor,
  rgbToOklch
} from '@codeware/shared/util/color';
import { cn } from '@codeware/shared/util/ui';
import { useState } from 'react';
import { HexColorInput, RgbaColorPicker } from 'react-colorful';

/** Six digits, since the alpha slider owns the seventh and eighth. */
const hex = ({ r, g, b }: Rgba): string =>
  '#' +
  [r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('');

type Props = {
  /** The value as written, which may be an alias or no colour at all */
  value: string;
  /**
   * What that value resolves to, when it is an alias.
   *
   * The core and prose tokens are `var()` chains by design, and there is no
   * colour to open a picker on without following them. Defaults to `value`.
   */
  resolved?: string;
  /** Given an `oklch()` string, on each interaction */
  onChange: (value: string) => void;
  /** Names the swatch for a screen reader, e.g. the token it edits */
  label?: string;
  className?: string;
};

/**
 * Point at a colour instead of typing one.
 *
 * Emits `oklch()` because that is what every generated token already holds:
 * `parseColor` reads it back, so the contrast report keeps working, and it
 * carries alpha — which `#rrggbbaa` would too, right up until the report
 * silently dropped every pair using one.
 *
 * A value with no colour in it — a radius, a font stack, a dead alias — gets
 * the swatch without the picker. There is nothing to seed one from, and an
 * empty surface that snaps to black on the first click is worse than no
 * surface at all.
 */
export function ColorField({
  value,
  resolved,
  onChange,
  label,
  className
}: Props) {
  const [open, setOpen] = useState(false);
  /**
   * What the surface is showing, while it is showing it.
   *
   * The picker works in HSV and the token holds a colour; a grey has no hue to
   * recover, so handing back a converted value moves the pointer somewhere the
   * drag never went. Kept here, it gets its own output back unchanged and the
   * pointer stays under the cursor.
   */
  const [dragged, setDragged] = useState<Rgba | null>(null);

  const apply = (rgba: Rgba) => {
    setDragged(rgba);
    onChange(formatOklch(rgbToOklch(rgba)));
  };

  // Aliases are followed for both, so the swatch shows the colour the picker
  // opens on. Painting the written value would resolve `var(--primary)` against
  // whatever host this panel sits in, which is not the theme being edited.
  const painted = resolved ?? value;
  const seed = parseColor(painted);

  const swatch = (
    <span
      className={cn('border-border block size-8 rounded border', className)}
      style={{ background: painted }}
    />
  );

  if (!seed) {
    return swatch;
  }

  const current = dragged ?? oklchToRgb(seed);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Reseed on open and let go on close, so reopening follows the token
        // rather than the last drag
        setDragged(next ? oklchToRgb(seed) : null);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded"
          aria-label={label ? `Pick ${label}` : 'Pick a colour'}
        >
          {swatch}
        </button>
      </PopoverTrigger>

      {/* Portals to `body`, out of any `twp` scope the host set up */}
      <PopoverContent className="twp w-auto space-y-3 p-3" align="end">
        <RgbaColorPicker
          color={current}
          // Only on an interaction. Seeding clamps to the sRGB gamut, so
          // writing back what it produced would quietly rewrite a wide-gamut
          // token that the author never touched.
          onChange={apply}
        />

        {/* A brand arrives as a hex, and dragging to it by eye is hopeless */}
        <HexColorInput
          color={hex(current)}
          prefixed
          aria-label={label ? `${label} as hex` : 'Colour as hex'}
          className="border-input h-8 w-full rounded-md border px-2 font-mono text-xs"
          onChange={(typed) => {
            const parsed = parseColor(typed);
            // Alpha carried over rather than reset: six digits say nothing
            // about it, and a translucent token should stay translucent
            if (parsed) {
              apply({ ...oklchToRgb(parsed), a: current.a });
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
