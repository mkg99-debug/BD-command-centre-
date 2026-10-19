# Salt BD Command Centre (Netlify)

100 South African SMEs, 20 each across Software, Data & AI, Infrastructure, SAP, and Product & Projects. The page and the company list only load after the team password is entered. Statuses, owners, follow-ups and notes sync for the whole team (stored in Netlify Blobs).

Live news: a scheduled function scans Google News every hour (15 companies per run, so every company is re-checked roughly every 6 hours). Headlines are tagged Funding, Leadership or Hiring, shown on each card and in the Live signals panel. Named contacts get a warning when leadership news appears, so you can check they're still in the seat. Anyone can hit Refresh on a card to rescan it immediately.

## Deploy (about 5 minutes)

Netlify's drag-and-drop doesn't run the sync function, so deploy with the CLI:

```bash
cd salt-bd-command-centre
npm install
npm install -g netlify-cli
netlify login
netlify init                      # create a new site, e.g. salt-bd-command-centre
netlify env:set TEAM_PASSWORD 'pick-a-new-password'
netlify deploy --prod
```

Use a new password. Don't reuse the old one.

## Updating the company list

Edit `netlify/functions/companies.mjs` (or ask Claude to regenerate it), then run `netlify deploy --prod` again. Team updates are stored separately and survive redeploys.

## Changing the password

Run `netlify env:set TEAM_PASSWORD 'new-one'`, then `netlify deploy --prod`. Everyone signs in again.

## Gmail digest

Weekdays at 07:00 SAST the site emails a digest (follow-ups due, new funding/leadership/hiring news, team updates). The "Email me the digest" button sends one on demand.

Set these Netlify environment variables, then redeploy:
- `GMAIL_USER`: the Gmail address that sends the digest
- `GMAIL_APP_PASSWORD`: a Google App Password (myaccount.google.com/apppasswords, needs 2-Step Verification)
- `DIGEST_TO` (optional): comma-separated recipients; defaults to GMAIL_USER
