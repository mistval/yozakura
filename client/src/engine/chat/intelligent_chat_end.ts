export type ChatEndDecision = 'continue' | 'stop';

export async function decideIntelligentChatEnd(params: {
  currentLength: number;
  minLength: number;
  maxLength: number;
  judgementInterval: number;
  runJudge: () => Promise<ChatEndDecision>;
}): Promise<ChatEndDecision> {
  const { currentLength, minLength, maxLength, judgementInterval, runJudge } = params;

  if (currentLength >= maxLength) {
    return 'stop';
  }

  if (currentLength < minLength) {
    return 'continue';
  }

  if ((currentLength - minLength) % judgementInterval !== 0) {
    return 'continue';
  }

  return runJudge();
}
