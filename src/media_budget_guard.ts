import { z } from 'zod';

const mediaWorkflowSchema = z.object({
  month: z.string().min(1),
  policy: z.object({
    hardCapUsd: z.number().positive(),
    reservePercent: z.number().min(0).max(100),
    estimatedMonthlySpendUsd: z.number().nonnegative()
  }),
  asset: z.object({
    assetId: z.string().min(1),
    title: z.string().min(1),
    durationMinutes: z.number().positive(),
    sourceBytes: z.number().int().positive()
  }),
  jobs: z.array(
    z.object({
      jobType: z.enum(['transcode', 'qc', 'thumbnail', 'caption']),
      costUsd: z.number().nonnegative()
    })
  ).min(1),
  delivery: z.object({
    creatorId: z.string().min(1),
    destination: z.enum(['portal', 'download', 'syndication']),
    estimatedTokens: z.number().int().positive()
  })
});

export type MediaWorkflowRequest = z.infer<typeof mediaWorkflowSchema>;

export type WorkflowDecision = {
  accepted: boolean;
  projectedSpendUsd: number;
  reserveLimitUsd: number;
  reason: string;
  queuedJobs: string[];
};

export function parseMediaWorkflow(input: unknown): MediaWorkflowRequest {
  return mediaWorkflowSchema.parse(input);
}

export function decideWorkflow(input: MediaWorkflowRequest, deliveryEstimateUsd: number): WorkflowDecision {
  const processingSpend = input.jobs.reduce((sum, job) => sum + job.costUsd, 0);
  const projectedSpendUsd = roundMoney(input.policy.estimatedMonthlySpendUsd + processingSpend + deliveryEstimateUsd);
  const reserveLimitUsd = roundMoney(input.policy.hardCapUsd * (1 - input.policy.reservePercent / 100));
  const accepted = projectedSpendUsd <= reserveLimitUsd;

  return {
    accepted,
    projectedSpendUsd,
    reserveLimitUsd,
    reason: accepted
      ? `Accepted ${input.asset.assetId} for ${input.delivery.creatorId}`
      : `Rejected ${input.asset.assetId}; projected monthly spend exceeds reserve limit`,
    queuedJobs: accepted ? input.jobs.map((job) => job.jobType) : []
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
