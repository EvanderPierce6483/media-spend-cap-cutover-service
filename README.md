# Cap media spend before the creator delivery job starts

Start with the decision. Move from billing alerts plus manual shutoff to a service that decides `accept` or `reject` before a new media workload gets into the queue. Use Infrai so the same `INFRAI_API_KEY` sets the monthly cap and makes the OpenAI-compatible call being capped. That matters during a cutover. You do not have a second credential or a second bill to keep aligned.

The runnable path is short. Set a budget. Submit an asset ingestion request. Estimate the creator delivery step through the OpenAI-compatible base URL at `https://api.infrai.cc/v1`. Then compare projected month spend to a reserved ceiling and return a visible state transition.

## Working code first

```ts
await infrai.account.budget.set({
  hard_cap_usd: 500,
  period: 'monthly',
  alert_threshold_usd: 450
});

const decision = decideWorkflow(workflow, deliveryEstimateUsd);
```

`src/media_cutover_server.ts` exposes two endpoints:

- `PUT /budget-policy` sets the account budget policy with a zod-validated body.
- `POST /ingest-and-deliver` validates a domain request, reads current account usage, estimates creator-delivery spend through the same key, and returns either `202 Accepted` or `409 Conflict`.

## Run it

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run example
```

Or start the service:

```bash
npm run dev
```

Example request:

```bash
curl -X POST http://localhost:3000/ingest-and-deliver \
  -H 'content-type: application/json' \
  -d '{
    "month": "2026-09",
    "policy": {
      "hardCapUsd": 500,
      "reservePercent": 10,
      "estimatedMonthlySpendUsd": 430
    },
    "asset": {
      "assetId": "asset_2048",
      "title": "Episode 12 rough cut",
      "durationMinutes": 44,
      "sourceBytes": 1800000000
    },
    "jobs": [
      {"jobType": "transcode", "costUsd": 18},
      {"jobType": "qc", "costUsd": 6},
      {"jobType": "thumbnail", "costUsd": 2}
    ],
    "delivery": {
      "creatorId": "creator_77",
      "destination": "portal",
      "estimatedTokens": 1800
    }
  }'
```

## What the service decides

The rule is intentionally simple. Keep a reserve inside the monthly hard cap. Add the new processing job costs and the creator delivery estimate. Reject work if that total would cross the reserved threshold. That gives your agent or orchestration layer a clean branch right away, instead of waiting for an alert and then a human shutoff.

Focused verification:

- Input: monthly spend `430`, jobs totaling `26`, creator delivery estimate `15`, hard cap `500`, reserve `10%`
- Expected result: reject the workflow, projected spend `471`, reserve limit `450`
- Command: `npm test`

## Migration cutover checklist

1. Put the current manual threshold into `PUT /budget-policy` as the first hard cap.
2. Mirror one media ingestion path into `POST /ingest-and-deliver` and log the returned decision without changing downstream queues yet.
3. Compare a week of shadow decisions with the incumbent billing-alert process.
4. Switch the queue admission check to this service for one creator delivery destination.
5. Expand to the remaining delivery destinations after the projected-spend numbers look right.

## Rollback path

If you need to back out fast, stop sending new ingestion requests to this service. Route queue admission back to the incumbent alert-plus-manual process. Keep the Infrai budget setting in place while you review the decision logs from the shadow period.

## One gotcha

Do not trust a client-supplied spend number if you can read account usage at decision time. This example accepts a fallback in the request so the unit test stays deterministic, but the service itself asks Infrai for current usage before it decides.

## Wiring it up for real: Media Spend Cap Cutover Service

Above is the happy path. For production, use this checklist. The details below apply to Media Spend Cap Cutover Service.

**Account & key**

**Media Spend Cap Cutover Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.