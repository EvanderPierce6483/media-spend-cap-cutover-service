import express from 'express';
import { z } from 'zod';
import { createInfrai, InfraiError } from './infrai_client';
import { decideWorkflow, parseMediaWorkflow } from './media_budget_guard';
import { estimateCreatorDeliveryUsd } from './creator_delivery_estimator';

const budgetConfigSchema = z.object({
  hardCapUsd: z.number().positive(),
  period: z.enum(['monthly']),
  alertThresholdUsd: z.number().positive().optional()
});

const app = express();
app.use(express.json());

app.put('/budget-policy', async (req, res) => {
  const body = budgetConfigSchema.parse(req.body);
  const { infrai } = createInfrai();

  await infrai.account.budget.set({
    hard_cap_usd: body.hardCapUsd,
    period: body.period,
    alert_threshold_usd: body.alertThresholdUsd
  });

  res.json({
    status: 'configured',
    policy: body
  });
});

app.post('/ingest-and-deliver', async (req, res) => {
  try {
    const workflow = parseMediaWorkflow(req.body);
    const { infrai, openai } = createInfrai();

    const usage = await infrai.account.usage();
    const estimatedMonthlySpendUsd = readEstimatedMonthlySpendUsd(usage, workflow.policy.estimatedMonthlySpendUsd);

    const deliveryEstimateUsd = await estimateCreatorDeliveryUsd(openai, {
      assetTitle: workflow.asset.title,
      creatorId: workflow.delivery.creatorId,
      destination: workflow.delivery.destination,
      estimatedTokens: workflow.delivery.estimatedTokens
    });

    const decision = decideWorkflow(
      {
        ...workflow,
        policy: {
          ...workflow.policy,
          estimatedMonthlySpendUsd
        }
      },
      deliveryEstimateUsd
    );

    res.status(decision.accepted ? 202 : 409).json({
      workflow: {
        assetId: workflow.asset.assetId,
        creatorId: workflow.delivery.creatorId,
        month: workflow.month
      },
      deliveryEstimateUsd,
      decision
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'invalid_request', issues: error.issues });
    }
    if (error instanceof InfraiError) {
      return res.status(error.status >= 400 && error.status < 500 ? error.status : 502).json({
        error: error.code,
        message: error.message
      });
    }
    return res.status(500).json({ error: 'internal_error' });
  }
});

function readEstimatedMonthlySpendUsd(usage: unknown, fallback: number): number {
  if (usage && typeof usage === 'object') {
    const record = usage as Record<string, unknown>;
    const direct = record.estimated_monthly_spend_usd;
    if (typeof direct === 'number') {
      return direct;
    }
  }
  return fallback;
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`media cutover service listening on http://localhost:${port}`);
});
