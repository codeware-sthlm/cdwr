/** Neutral link colour, used when there is no brand accent */
export const NEUTRAL_ACCENT = '#666666';

/** Who the mail is from: shown as a header, and colours links and the button */
export type EmailBrand = {
  name: string;
  /** Absolute url to a square image */
  logoUrl?: string;
  /** Hex colour, `#rrggbb` */
  accent?: string;
};

/** A label/value pair rendered as a row in the details table */
export type DetailRow = [label: string, value: string];

export type EmailLayout = {
  /** Preheader and `<title>`; usually the same as the subject */
  title: string;
  /** Leading paragraphs, plain text — escaped and wrapped here */
  paragraphs: Array<string>;
  /** Optional labelled details, rendered as a simple table */
  detailsHeading?: string;
  details?: Array<DetailRow>;
  /** Optional closing links, e.g. privacy and terms */
  links?: Array<{ label: string; url: string }>;
  /** Sender name, shown as the sign-off */
  from: string;
  /** Optional header with logo and name; its accent colours links and the button */
  brand?: EmailBrand;
  /** Optional call to action, rendered as a button with the url spelled out below */
  cta?: { label: string; url: string };
};

/**
 * Escape text destined for the html body.
 *
 * Every value here is either editor content or something a customer typed, so
 * none of it can be trusted into markup — a name containing `<` must arrive as
 * a name, not as a tag.
 *
 * Takes `unknown` and coerces: a localized field with no value in the mail's
 * locale arrives as `undefined`, and a confirmation with a blank line in it
 * beats one that never sends because a template threw.
 */
export const escape = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The shared shell every platform email is rendered into.
 *
 * Deliberately plain: a table-free single column with inline styles, which is
 * what survives contact with the range of clients people actually read mail
 * in. Each template supplies content, never markup.
 *
 * Returns both representations — a text part is what keeps a mail out of the
 * spam folder and readable in a client that refuses html.
 */
export function renderEmailLayout(layout: EmailLayout): {
  html: string;
  text: string;
} {
  const {
    brand,
    cta,
    details,
    detailsHeading,
    from,
    links,
    paragraphs,
    title
  } = layout;
  const accent = brand?.accent ?? NEUTRAL_ACCENT;
  const linkColor = brand ? accent : '#666';

  const htmlBrand = brand
    ? `<table style="border-collapse:collapse;margin:0 0 24px" role="presentation"><tr>${
        brand.logoUrl
          ? `<td style="padding:0 12px 0 0"><img src="${escape(
              brand.logoUrl
            )}" alt="" width="32" height="32" style="display:block;border:0"></td>`
          : ''
      }<td style="font-size:16px;font-weight:600">${escape(
        brand.name
      )}</td></tr></table>`
    : '';

  const htmlCta = cta
    ? `<!--text:skip--><table style="border-collapse:collapse;margin:8px 0 16px" role="presentation"><tr><td style="background:${escape(
        accent
      )};border-radius:6px"><a href="${escape(
        cta.url
      )}" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none;font-weight:600">${escape(
        cta.label
      )}</a></td></tr></table><!--/text:skip--><p style="margin:0 0 16px;font-size:12px;color:#666">${escape(
        cta.label
      )}: <a href="${escape(cta.url)}" style="color:${escape(
        linkColor
      )}">${escape(cta.url)}</a></p>`
    : '';

  const htmlParagraphs = paragraphs
    .map(
      (text) => `<p style="margin:0 0 16px;line-height:1.6">${escape(text)}</p>`
    )
    .join('');

  const htmlDetails = details?.length
    ? `${
        detailsHeading
          ? `<h2 style="margin:24px 0 8px;font-size:16px">${escape(
              detailsHeading
            )}</h2>`
          : ''
      }<table style="border-collapse:collapse;margin:0 0 16px" role="presentation">${details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:#666">${escape(
              label
            )}</td><td style="padding:4px 0">${escape(value)}</td></tr>`
        )
        .join('')}</table>`
    : '';

  const htmlLinks = links?.length
    ? `<p style="margin:24px 0 0;font-size:12px;color:#666">${links
        .map(
          ({ label, url }) =>
            `<a href="${escape(url)}" style="color:${escape(
              linkColor
            )}">${escape(label)}</a>`
        )
        .join(' · ')}</p>`
    : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escape(
    title
  )}</title></head><body style="margin:0;padding:24px;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">${htmlBrand}${htmlParagraphs}${htmlCta}${htmlDetails}<p style="margin:24px 0 0">${escape(
    from
  )}</p>${htmlLinks}</div></body></html>`;

  const text = [
    ...(brand ? [brand.name, ''] : []),
    ...paragraphs,
    ...(cta ? ['', `${cta.label}: ${cta.url}`] : []),
    ...(details?.length
      ? [
          '',
          ...(detailsHeading ? [detailsHeading] : []),
          ...details.map(([label, value]) => `${label}: ${value}`)
        ]
      : []),
    '',
    from,
    ...(links?.length ? ['', ...links.map((l) => `${l.label}: ${l.url}`)] : [])
  ].join('\n');

  return { html, text };
}
