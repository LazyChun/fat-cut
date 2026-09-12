export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    seconds = 0;
  }
  const totalSeconds = Math.floor(seconds);
  const ms = Math.floor((seconds - totalSeconds) * 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${mm}:${ss}`;
  }
  return `${mm}:${ss}.${String(ms).padStart(3, "0").slice(0, 2)}`;
};
