/**
 * Runs at most `max` async jobs at the same time; the others wait their turn.
 * Keeps us polite to the docs site and our own server when many pages are fetched at once.
 *
 *   const limit = createLimiter(4);
 *   await Promise.all(urls.map((url) => limit(() => fetchPage(url))));   // 4 at a time
 */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  // A finished job hands its slot straight to the next waiting job (or frees it).
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };

  return async function limit<T>(job: () => Promise<T>): Promise<T> {
    if (active >= max)
      await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await job();
    } finally {
      release();
    }
  };
}
