export function startSafePoll(callback: () => void, intervalMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  const start = () => {
    if (document.visibilityState === "visible" && !timer) timer = setInterval(callback, intervalMs);
  };
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") stop();
    else start();
  };
  document.addEventListener("visibilitychange", onVisibility);
  start();
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
