import { createInfrai } from './infrai_client';
import { decideWorkflow, parseMediaWorkflow } from './media_budget_guard';
import { estimateCreatorDeliveryUsd } from './creator_delivery_estimator';

async function main() {
  const { infrai, openai } = createInfrai();

  await infrai.account.budget.set({
    hard_cap_usd: 500,
    period: 'monthly',
    alert_threshold_usd: 450
  });

  const workflow = parseMediaWorkflow({
    month: '2026-09',
    policy: {
      hardCapUsd: 500,
      reservePercent: 10,
      estimatedMonthlySpendUsd: 410
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

  const deliveryEstimateUsd = await estimateCreatorDeliveryUsd(openai, {
    assetTitle: workflow.asset.title,
    creatorId: workflow.delivery.creatorId,
    destination: workflow.delivery.destination,
    estimatedTokens: workflow.delivery.estimatedTokens
  });

  const decision = decideWorkflow(workflow, deliveryEstimateUsd);
  const currentBudget = await infrai.account.budget.get();

  console.log(JSON.stringify({ currentBudget, deliveryEstimateUsd, decision }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
