import { useEffect, useState } from 'react';
import type { Timestamp } from 'firebase/firestore';

function computeRemaining(turnStartedAt: Timestamp, turnTimeLimitSeconds: number): number {
  const elapsedSeconds = (Date.now() - turnStartedAt.toMillis()) / 1000;
  return Math.max(0, Math.ceil(turnTimeLimitSeconds - elapsedSeconds));
}

export function useCountdown(turnStartedAt: Timestamp, turnTimeLimitSeconds: number): number {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    computeRemaining(turnStartedAt, turnTimeLimitSeconds)
  );

  useEffect(() => {
    setRemainingSeconds(computeRemaining(turnStartedAt, turnTimeLimitSeconds));
    const interval = setInterval(() => {
      setRemainingSeconds(computeRemaining(turnStartedAt, turnTimeLimitSeconds));
    }, 1000);
    return () => clearInterval(interval);
  }, [turnStartedAt, turnTimeLimitSeconds]);

  return remainingSeconds;
}
