/** "12 s", "4 m", "2 h", "3 d" from minutes: the cards' compact age */
export const shortAge = (min: number): string =>
  min < 1
    ? `${Math.max(0, Math.round(min * 60))} s`
    : min < 60
      ? `${Math.round(min)} m`
      : min < 48 * 60
        ? `${Math.round(min / 60)} h`
        : `${Math.round(min / 1440)} d`;
