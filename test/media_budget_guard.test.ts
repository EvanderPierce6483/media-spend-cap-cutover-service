import { describe, expect, it } from 'vitest';
import { decideWorkflow, parseMediaWorkflow } from '../src/media_budget_guard';

describe('decideWorkflow', () => {
  it('rejects a media workflow once projected monthly spend crosses the reserved cap', () => {
    const input = parseMediaWorkflow({
      month: '2026-09',
      policy: {
        hardCapUsd: 500,
        reservePercent: 10,
        estimatedMonthlySpendUsd: 430
      },
      asset: {
        assetId: 'asset_2048',
        title: 'Episode 12 rough cut',
        durationMinutes: 44,
        sourceBytes: 1800000000
      },
      jobs: [
        { jobType: 'transcode', costUsd: 18 },
        { jobType: 'qc', costUsd: 6 },
        { jobType: 'thumbnail', costUsd: 2 }
      ],
      delivery: {
        creatorId: 'creator_77',
        destination: 'portal',
        estimatedTokens: 1800
      }
    });

    const decision = decideWorkflow(input, 15);

    expect(decision.accepted).toBe(false);
    expect(decision.projectedSpendUsd).toBe(471);
    expect(decision.reserveLimitUsd).toBe(450);
    expect(decision.queuedJobs).toEqual([]);
  });
});
