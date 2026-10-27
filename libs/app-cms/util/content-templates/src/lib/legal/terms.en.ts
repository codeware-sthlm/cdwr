/**
 * Starter signup terms for a workspace that sells tours.
 *
 * Covers the mechanics this platform imposes — a signup is a request, capacity
 * decides whether it becomes a place or a queue position — and leaves the
 * commercial terms (payment, cancellation windows) as prompts the editor must
 * fill in, since only they know them.
 */
export const termsEn = `{{^published}}
> **Draft — review before publishing.** This text covers how signing up works on this website. The commercial parts are marked and must be filled in with your own terms. It is a starting point, not legal advice.
{{/published}}

# Terms for signing up

These terms apply when you sign up for a tour arranged by {{tenantName}}.

## Signing up

A signup is a request for a place, not a confirmed booking. We confirm your place by email.

Every tour has a limited number of places, counted in people rather than signups — a signup for four takes four places. If there is not room for your whole party, your signup goes on the waiting list instead and we contact you if a place opens up. We decide who to offer a released place to.

## Payment

**Fill in:** when you invoice, what the deposit is if any, and when the balance
is due.

## Changes and cancellation

**Fill in:** how far ahead a customer may cancel, what it costs at each point,
and what happens if you cancel the tour.

If you need to cancel, contact us at {{contactEmail}} as soon as you can. Your place is then offered to the next person on the waiting list.

## What is included

What the price covers is listed on each tour page. Anything not listed there is not included.

## Travel insurance

**Fill in:** whether you require customers to hold travel insurance.

## Your details

We handle the details you give us as described on our privacy page.

## Contact

{{tenantName}} {{contactEmail}}`;
