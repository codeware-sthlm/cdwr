/**
 * Starter privacy text for a workspace's website.
 *
 * Describes what this platform actually does with a visitor's details, so the
 * editor is correcting and extending real text rather than starting from
 * nothing. Sections for what the workspace does not use are left out when the
 * page is created. It is not legal advice, and the draft says so in its first
 * line — the page is created unpublished precisely so nobody ships it unread.
 */
export const privacyEn = `> **Draft — review before publishing.** This text describes what this website collects and why. It is a starting point, not legal advice. Check it against how you actually work, fill in what is marked, add anything else you collect, and have it reviewed if you are unsure.

# Privacy

{{tenantName}} is responsible for the personal data you give us on this website. This page explains what we collect, why, how long we keep it, and which services help us run the website.

## Forms

When you send a message through a form on this website, we store what you wrote in the form and when you sent it. Which details that is depends on the form — usually your name, your email address and your message.

We use them to answer you and to deal with what you asked about. The legal basis is our legitimate interest in answering people who contact us, or taking steps towards an agreement when that is what you asked about.

Only the people at {{tenantName}} who handle your message can read it, and they are told about it by email. If the form sends you a copy, that email goes out the same way.

{{#formsRetentionDays}}
Messages are deleted {{formsRetentionDays}} days after they were sent.
{{/formsRetentionDays}}
{{^formsRetentionDays}}
We keep messages until we delete them. **Fill in:** how long that is, or set a retention period under Forms in the site settings so messages are deleted automatically.
{{/formsRetentionDays}}

{{#tourSignups}}
## Tour signups

When you sign up for a tour we ask for:

- your name
- your email address
- your phone number (optional)
- how many people the signup is for

We also record when you signed up, and whether you accepted our terms.

We use these details to run the tour you signed up for: to confirm your place, to reach you if something about the departure changes, and to know how many people are travelling. If the tour is full we keep your details on a waiting list so we can offer you a place if one opens up.

The legal basis is the performance of our agreement with you. We do not use your signup details for marketing unless you have asked us to.

Only the people at {{tenantName}} who organise the tours can see your signup. We do not share it with anyone else, except where a supplier needs a passenger name to provide part of the tour — a hotel or a carrier, for example.

Your name, email address and phone number are cleared {{tourRetentionDays}} days after the tour departs. After that we keep only the number of travellers and the status of the signup, which say nothing about who you are.
{{/tourSignups}}

## Hosting

The website and the details you send through it are stored with hosting providers in the EU, who handle them on our behalf.

## Email

{{#sendgrid}}
We send email through Twilio SendGrid, a US company that delivers the messages on our behalf. Your email address and the content of the email are therefore transferred to the United States. Twilio is certified under the EU–US Data Privacy Framework, which is the basis for that transfer.
{{/sendgrid}}
{{^sendgrid}}
We send email through a service that delivers the messages on our behalf. **Fill in:** which provider that is and where it handles the data.
{{/sendgrid}}

{{#errorMonitoring}}
## Error monitoring

When something goes wrong on this website, an error report is sent to Sentry, a service that helps us find and fix errors. A report shows which page you were on and which browser you use{{#errorMonitoringEu}}, and it is stored in the EU{{/errorMonitoringEu}}. It does not include your IP address or anything you entered on the page. We do not record what you do on the page, and we use the reports only to fix errors.

The legal basis is our legitimate interest in keeping the website working.
{{/errorMonitoring}}

{{#humanCheck}}
## Spam protection

Our forms use Cloudflare Turnstile to tell people apart from automated spam. On a page with a form it checks signals from your browser, it sets no cookies of its own, and Cloudflare uses the signals on our behalf for that purpose only.
{{/humanCheck}}

## Cookies and your browser

We do not use cookies for tracking or advertising, so there is nothing to accept. The website only remembers choices you make yourself:

- the theme you pick, in a cookie kept for a year
- light or dark mode when you switch it, in your browser's local storage or in a cookie kept for a year

Nothing is stored until you make a choice.

## Your rights

You can ask us for a copy of the details we hold about you, ask us to correct them, or ask us to delete them. Write to {{contactEmail}} and we will answer.

You can also complain to the data protection authority in your country if you think we have handled your details badly.

## Contact

{{tenantName}} {{contactEmail}}`;
