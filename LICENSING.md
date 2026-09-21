# Licensing

This repository holds two kinds of code under two different licences.

| Path                                                                     | Licence                            | What it is                                                          |
| ------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------- |
| `packages/nx-payload`, `packages/create-nx-payload`, `packages/fly-node` | [MIT](packages/nx-payload/LICENSE) | The three developer tools published to npm                          |
| Everything else                                                          | [FSL-1.1-MIT](LICENSE)             | The Codeware platform — the apps, libraries and tooling that run it |

Each of the three MIT packages carries its own `LICENSE` file, so what you get is
visible wherever you land. The other packages under `packages/` are internal
GitHub Actions that are never published, and they fall under the platform
licence along with everything else.

## The short version

Do anything you like with the platform **except run it as a competing hosting
service**. Two years after any version is published, that restriction lapses and
the version becomes MIT.

## What FSL allows

The [Functional Source License](https://fsl.software/) grants the right to use,
copy, modify, create derivative works from and redistribute the software for any
purpose that is not a Competing Use. It names these explicitly:

- your internal use and access
- non-commercial education
- non-commercial research
- professional services you provide to a licensee using the software

So if you run your own site on this platform, that is allowed. If you are a
developer building and maintaining a site for a client, that is allowed.

## What FSL does not allow

> A Competing Use means making the Software available to others in a commercial
> product or service that: (1) substitutes for the Software; (2) substitutes for
> any other product or service we offer using the Software that exists as of the
> date we make the Software available; or (3) offers the same or substantially
> similar functionality as the Software.

In practice: you cannot take this platform and sell hosting from it. If that is
what you want to do, a commercial licence is available — get in touch rather
than guessing.

## It becomes MIT after two years

Every version carries an irrevocable grant of the MIT licence effective on the
**second anniversary of its publication**. The clock runs per version, so the
platform is continuously becoming open source two years behind itself. Nothing
here is locked away permanently.

FSL is **source-available**, not OSI-approved open source, and we do not describe
it as open source without that qualification.

## Why it is set up this way

Codeware is a small company that sells hosting for this platform. The source is
public because a customer should never be trapped: if Codeware stops existing,
your site keeps running, the code is already in your hands, and any competent
developer can take it over. That promise is only worth making if the licence
genuinely permits it, and FSL does.

The same permission granted to a competitor, though, is the entire business for
free — which is the one outcome the company would not survive. FSL draws the line
between those two cases, and the two-year conversion keeps it from being a
permanent enclosure.

The three published packages stay MIT because their value _is_ their openness,
and nothing about them competes with anything.

## Questions

Licensing questions, including commercial licences for uses FSL excludes, go to
Codeware Sthlm AB at <hello@codeware.se>.

Nothing on this page is legal advice, and where it differs from [`LICENSE`](LICENSE)
the licence text governs.
