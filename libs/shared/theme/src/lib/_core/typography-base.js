/**
 * A Tailwind CSS plugin function that defines typography base styles.
 *
 * @param {import('tailwindcss/plugin').PluginUtils} utils - The plugin utilities provided by Tailwind CSS.
 * @returns {Object} An object containing the typography base styles.
 */
module.exports = ({ theme }) => ({
  // Override default 65ch to allow rich text content to grow
  maxWidth: '100ch',

  color: 'var(--tw-prose-body)',
  lineHeight: theme('lineHeight.7'),

  p: {
    marginTop: theme('spacing.6'),
    marginBottom: theme('spacing.6')
  },

  'h1, h2, h3, h4, h5, h6': {
    color: 'var(--tw-prose-headings)',
    fontWeight: theme('fontWeight.semibold'),
    lineHeight: theme('lineHeight.tight')
  },
  h1: {
    fontSize: theme('fontSize.3xl')[0],
    marginBottom: theme('spacing.4')
  },
  h2: {
    fontSize: theme('fontSize.2xl')[0],
    marginBottom: theme('spacing.3')
  },
  h3: {
    fontSize: theme('fontSize.xl')[0],
    marginBottom: theme('spacing.2')
  },
  h4: {
    fontSize: theme('fontSize.lg')[0],
    marginBottom: theme('spacing.2')
  },
  h5: {
    fontSize: theme('fontSize.base')[0],
    marginBottom: theme('spacing.2')
  },
  h6: {
    fontSize: theme('fontSize.sm')[0],
    textTransform: 'uppercase',
    letterSpacing: theme('letterSpacing.wide'),
    fontWeight: theme('fontWeight.medium'),
    marginBottom: theme('spacing.2')
  },

  img: {
    borderRadius: theme('borderRadius.3xl'),
    marginTop: theme('spacing.6'),
    marginBottom: theme('spacing.6')
  },

  a: {
    color: 'var(--tw-prose-links)',
    fontWeight: theme('fontWeight.medium'),
    textDecoration: 'underline',
    textDecorationColor: 'var(--tw-prose-underline)',
    transitionProperty: 'color, text-decoration-color',
    transitionDuration: theme('transitionDuration.150'),
    transitionTimingFunction: theme('transitionTimingFunction.in-out'),
    '&:hover': {
      color: 'var(--tw-prose-links-hover)',
      textDecorationColor: 'var(--tw-prose-underline-hover)'
    }
  },

  strong: {
    color: 'var(--tw-prose-bold)',
    fontWeight: theme('fontWeight.semibold')
  },

  code: {
    display: 'inline-block',
    color: 'var(--tw-prose-code)',
    fontSize: theme('fontSize.sm')[0],
    fontWeight: theme('fontWeight.medium'),
    backgroundColor: 'var(--tw-prose-code-bg)',
    borderRadius: theme('borderRadius.lg'),
    paddingLeft: theme('spacing.1'),
    paddingRight: theme('spacing.1')
  },

  blockquote: {
    paddingLeft: theme('spacing.6'),
    borderLeftWidth: theme('borderWidth.2'),
    borderLeftColor: 'var(--tw-prose-quote-borders)',
    fontStyle: 'italic'
  },

  figcaption: {
    color: 'var(--tw-prose-captions)',
    fontSize: theme('fontSize.sm')[0],
    lineHeight: theme('lineHeight.6'),
    marginTop: theme('spacing.3')
  },

  'ul, ol': {
    paddingLeft: theme('spacing.6'),
    marginTop: theme('spacing.6'),
    marginBottom: theme('spacing.6')
  },
  'li::marker': {
    fontSize: theme('fontSize.sm')[0],
    fontWeight: theme('fontWeight.medium')
  },
  'ol > li::marker': {
    color: 'var(--tw-prose-counters)'
  },
  'ul > li::marker': {
    color: 'var(--tw-prose-bullets)'
  },
  li: {
    paddingLeft: theme('spacing[3.5]')
  },
  'li > input[type="checkbox"]': {
    display: 'inline-block',
    marginRight: theme('spacing.2'),
    marginLeft: 0,
    position: 'relative',
    top: theme('spacing.px')
  },

  pre: {
    color: 'var(--tw-prose-pre-code)',
    fontSize: theme('fontSize.sm')[0],
    fontWeight: theme('fontWeight.medium'),
    backgroundColor: 'var(--tw-prose-pre-bg)',
    borderRadius: theme('borderRadius.2xl'),
    padding: theme('spacing.6'),
    overflowX: 'auto',
    border: '1px solid',
    borderColor: 'var(--tw-prose-pre-border)'
  },
  'pre code': {
    all: 'unset'
  },

  hr: {
    marginTop: theme('spacing.12'),
    marginBottom: theme('spacing.12'),
    borderTopWidth: '1px',
    borderColor: 'var(--tw-prose-hr)',
    // lg breakpoint (64rem)
    '@media (width >= 64rem)': {
      marginLeft: `calc(${theme('spacing.12')} * -1)`,
      marginRight: `calc(${theme('spacing.12')} * -1)`
    }
  }
});
