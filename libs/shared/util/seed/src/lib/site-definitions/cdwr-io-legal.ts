/**
 * The legal pages of cdwr.io, rendered once from the platform's legal
 * templates. The seed lib cannot import the templates, so the text lives here
 * and a spec in `app-cms-feature-seed` fails when the two drift apart.
 */

/** What the templates were filled with; the drift spec renders with the same */
export const cdwrIoLegalVars = {
  published: true,
  forms: false,
  tenantName: 'cdwr.io',
  contactEmail: 'hello@codeware.se',
  tourSignups: false,
  tourRetentionDays: 365,
  formsRetentionDays: null,
  humanCheck: false,
  sendgrid: true,
  errorMonitoring: true,
  errorMonitoringEu: true,
  analytics: true
} as const;

export const cdwrIoPrivacyMarkdown =
  "# Privacy\n\ncdwr.io is responsible for the personal data you give us on this website. This page explains what we collect, why, how long we keep it, and which services help us run the website.\n\n## Hosting\n\nThe website and the details you send through it are stored with hosting providers in the EU, who handle them on our behalf.\n\n## Email\n\nWe send email through Twilio SendGrid, a US company that delivers the messages on our behalf. Your email address and the content of the email are therefore transferred to the United States. Twilio is certified under the EU–US Data Privacy Framework, which is the basis for that transfer.\n\n## Error monitoring\n\nWhen something goes wrong on this website, an error report is sent to Sentry, a service that helps us find and fix errors. A report shows which page you were on and which browser you use, and it is stored in the EU. It does not include your IP address or anything you entered on the page. The reports are not used to follow what you do on the page, only to fix errors.\n\nThe legal basis is our legitimate interest in keeping the website working.\n\n## Visitor statistics\n\nWe count visits to this website with Umami, a statistics service that is run on our behalf. It sets no cookies and stores nothing in your browser. For each page view it records the page, the website you came from, your browser, operating system, device type, screen size and language, and your approximate location (country, region and city). On some visits it also records where on the page you click and how far you scroll. Your IP address is used to work out that location and, together with your browser details, to recognise visits from the same browser during the current month. The IP address itself is not stored. We use the statistics to see which pages people read and how the website is used, not to find out who you are.\n\nThe legal basis is our legitimate interest in knowing how the website is used.\n\n## Cookies and your browser\n\nWe do not use cookies for tracking or advertising, so there is nothing to accept. The website only remembers choices you make yourself:\n\n- the theme you pick, in a cookie kept for a year\n- light or dark mode when you switch it, in your browser's local storage or in a cookie kept for a year\n\nNothing is stored until you make a choice.\n\n## Your rights\n\nYou can ask us for a copy of the details we hold about you, ask us to correct them, or ask us to delete them. Write to hello@codeware.se and we will answer.\n\nYou can also complain to the data protection authority in your country if you think we have handled your details badly.\n\n## Contact\n\ncdwr.io hello@codeware.se";
