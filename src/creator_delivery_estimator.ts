import type OpenAI from 'openai';

export async function estimateCreatorDeliveryUsd(
  openai: OpenAI,
  input: {
    assetTitle: string;
    creatorId: string;
    destination: string;
    estimatedTokens: number;
  }
): Promise<number> {
  const completion = await openai.chat.completions.create({
    model: 'auto',
    messages: [
      {
        role: 'system',
        content: 'Return a single decimal USD estimate for summarizing and packaging creator delivery notes.'
      },
      {
        role: 'user',
        content: `asset=${input.assetTitle}; creator=${input.creatorId}; destination=${input.destination}; estimated_tokens=${input.estimatedTokens}`
      }
    ],
    max_tokens: 16,
    temperature: 0
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? '0';
  const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric)) {
    throw new Error('Model did not return a numeric estimate');
  }
  return Math.round(numeric * 100) / 100;
}
