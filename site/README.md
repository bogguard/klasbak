# Product site (klasbak.itrw.be)

The public page about Schoolbibliotheek itself: what it is, what it does, the webinar, the price
and how to get started. It is not part of a library installation; one copy runs for everyone at
https://klasbak.itrw.be (decision 035).

Static HTML in Dutch (`/`) and English (`/en/`), built without dependencies by `build.mjs` from:

| File                 | What                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `src/config.mjs`     | Price, contact email, GitHub link, YouTube ID, company details      |
| `src/content/nl.mjs` | All Dutch text (only what the app does today)                       |
| `src/content/en.mjs` | The same in English                                                 |
| `src/styles.css`     | The app's colours and typefaces (served from the site itself)       |
| `src/main.js`        | Small touches; the page works without it                            |
| `src/img/`           | Screenshots from the demo library (`*-en.jpg` for the English page) |

## Work on it locally

```bash
npm run build:site                        # → site/dist
python3 -m http.server 8090 -d site/dist  # http://localhost:8090 and /en/
```

New screenshots after an app change (with `npm run dev:local` running; macOS, uses Quick Look
for the PDFs):

```bash
npm run demo && node site/scripts/screenshots.mjs
npm run demo && SITE_LANG=en node site/scripts/screenshots.mjs
site/scripts/media.sh      # the webinar's still, from video/out (see video/README.md)
node site/scripts/og.mjs   # the image shown when the link is shared (serve site/dist first)
```

## Publish

Once per AWS account, the certificate for the address (in us-east-1, as CloudFront wants):

```bash
export AWS_PROFILE=library-test
scripts/request-certificate.sh klasbak.itrw.be /library-site   # shows a DNS record to add, then waits
```

Then, and after every change:

```bash
npm run deploy:site   # = site/deploy.sh: the library-site stack, then the pages
```

The first time, point the address to CloudFront with a CNAME at the domain's DNS: `bib` to the
`CloudFrontDomain` the deploy prints.

`template.yaml` is a separate CloudFormation stack (`library-site`, eu-west-1): a private S3
bucket, CloudFront with its own certificate, security headers (only the site itself, plus the
YouTube player in privacy-enhanced mode, loaded after a click) and a small function that serves
`index.html` for folders. Assets have a content hash in their name and are cached for a year;
pages for five minutes.

## Costs

A few MB in S3 and some CloudFront traffic: well within the AWS free tier for CloudFront (1 TB and
10 million requests a month), so cents a month at most. No fixed costs.

## Privacy

No cookies, no analytics, no third parties until a visitor plays the webinar (YouTube,
privacy-enhanced mode). Fonts and images come from the site itself.
