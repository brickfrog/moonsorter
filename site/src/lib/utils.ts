export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function parsePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function setStatus(target: Element | null, message: string): void {
  if (target) target.textContent = message;
}

export function suggestAnalysisSamples(total: number): number {
  if (total < 20) return 100;
  if (total < 50) return 150;
  return 200;
}

export function suggestAnalysisIterations(total: number): number {
  if (total < 20) return 20;
  if (total < 50) return 30;
  return 40;
}

export function suggestTopK(total: number, importMode: string, sliceCount: number): number {
  if (
    importMode === 'top' ||
    importMode === 'bottom' ||
    importMode === 'top-bottom'
  ) {
    return Math.max(1, Math.min(sliceCount, total));
  }
  if (total <= 10) return total;
  if (total <= 30) return 10;
  if (total <= 100) return 15;
  return 20;
}
