# RSVP connection

The private Google Sheet is already created:
https://docs.google.com/spreadsheets/d/1zjeJZ3WbYrZJaXNs7_-0CkBxA_0Y2JoMYnC67NME684/edit

Its Dashboard has live headcounts, standard/vegetarian meal totals and two charts.
Guests has one row per attendee; filter Events for `both` and `reception` to see the paid reception list.
Responses has one row per reply, with primary and plus-one details. Declines stay here and do not add guests or meals.
The hidden Metrics tab supplies the dashboard and charts.

## One-time Google deployment

1. Open the spreadsheet using the Google account that owns it.
2. Select **Extensions → Apps Script**.
3. Replace the starter Code.gs contents with this folder’s **Code.gs**, and save.
4. Select **checkSetup** from the function menu, click **Run**, and authorize spreadsheet access. The execution log should say “RSVP spreadsheet connected. Ready to deploy.”
5. Choose **Deploy → New deployment → Web app**.
6. Set **Execute as: Me** and **Who has access: Anyone**, so wedding guests do not need a Google account. Deploy and copy the web app URL ending in `/exec`.
7. In the invitation’s `index.html`, set `RSVP.sheetUrl` to that URL. You can also give the URL to Codex to connect it. It is a public submission address, not a dashboard password.
8. Keep the spreadsheet’s own sharing **Restricted**; share it directly with your partner’s Google account if desired. The public script accepts submissions but never returns the guest list.

The Google Drive tools in this session cannot create or deploy Apps Script projects; steps 2–6 need to be done in your Google account.

## Before sending invitations

- Host `index.html`, `art/` and `rsvp/client.js` together on a static HTTPS host. A private source repository by itself is not a hosted invitation. The receiving script and these instructions do not need to be hosted.
- Open the deployed invitation and send a test RSVP: primary attending both with the standard meal, plus-one attending reception with a vegetarian meal. Expect ceremony **1**, reception **2**, standard **1**, vegetarian **1**, and two rows in Guests.
- Only a readable `{ok: true, replyId: ...}` server receipt triggers the thank-you screen. If a deployment, network or cross-origin error prevents confirmation, the form keeps the reply and allows a retry; it never assumes a sent request was saved.
- Check the same submission from a second browser / phone. Complete this live check before distributing the invitation; the deployed Google endpoint has not yet been tested.
- Delete the test entry’s full row from **Responses** afterward. Guests, totals and charts update from that source automatically.

## Counting and retries

- The server recalculates attendance and meal counts from event choices, including each plus-one separately. It ignores client-supplied totals.
- `None` means the standard meal. A ceremony-only guest has no meal.
- Retrying an unconfirmed reply in the same tab reuses its random reference and updates the existing row, including after a reload in that tab. Success clears the pending reference.
- Separate successful submissions, different tabs/devices, or the same couple replying separately can still produce duplicates. Matching primary names are highlighted in Responses for review; matching names are never silently merged. There is no invitation roster yet, so the dashboard cannot show who has not replied.
- Do not rename or reorder Responses columns. To change the receiving script after deployment, update the web app deployment to a **new version** under **Deploy → Manage deployments**.

## Local checks

Run from the invitation directory:

```sh
node --test rsvp/rsvp.test.cjs
```

These checks cover server validation, counts, saved-row updates, formula-safe text, failure handling and client receipt handling. Real Google endpoint and hosted-browser verification still requires deployment.
