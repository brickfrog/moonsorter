import { getToken } from '../lib/auth';
import { dom, type Steps, type StepKey } from './dom';
import { state } from './state';

export function resolveStepKey(name: keyof Steps): StepKey {
  if (name === 'sortGroup' || name === 'compareActions') return 'compare';
  return name === 'results' ? 'results' : (name as StepKey);
}

export function canShowMode(): boolean {
  return !!state.pendingStart || state.items.length > 0;
}

export function canShowCompare(): boolean {
  return !!state.wasm && state.items.length > 1;
}

export function canShowResults(): boolean {
  return !!state.lastResults;
}

export function nearestAvailableStep(): StepKey {
  if (canShowCompare()) return 'compare';
  if (canShowMode()) return 'mode';
  return getToken() ? 'import' : 'connect';
}

export function updateStepper(active: keyof Steps) {
  if (!dom.stepperButtons.length) return;
  const activeKey = resolveStepKey(active);
  dom.stepperButtons.forEach((button) => {
    const target = button.getAttribute('data-step-target') as StepKey | null;
    if (!target) return;
    const enabled =
      target === 'connect' ||
      target === 'import' ||
      (target === 'mode' && canShowMode()) ||
      (target === 'compare' && canShowCompare()) ||
      (target === 'results' && canShowResults());
    button.disabled = !enabled;
    button.classList.toggle('is-active', target === activeKey);
  });
}

export function showStep(name: keyof Steps) {
  if (dom.rankLoading) {
    dom.rankLoading.classList.add('hidden');
  }
  Object.entries(dom.steps).forEach(([key, element]) => {
    if (!element) return;
    element.classList.toggle('hidden', key !== name);
  });
  if (name === 'compare' && dom.steps.compareActions) {
    dom.steps.compareActions.classList.remove('hidden');
  } else if (dom.steps.compareActions) {
    dom.steps.compareActions.classList.add('hidden');
  }
  if (name === 'sortGroup' && dom.steps.compareActions) {
    dom.steps.compareActions.classList.remove('hidden');
  }
  if (name === 'results' && dom.steps.results) {
    dom.steps.results.classList.remove('hidden');
  }
  updateStepper(name);
}

export function navigateStep(target: StepKey) {
  let next: StepKey = target;
  if (target === 'results' && !canShowResults()) {
    next = nearestAvailableStep();
    if (dom.stepperStatus) {
      dom.stepperStatus.textContent =
        'Finish a few comparisons to unlock results.';
    }
  } else if (target === 'compare' && !canShowCompare()) {
    next = nearestAvailableStep();
    if (dom.stepperStatus) {
      dom.stepperStatus.textContent =
        'Import a list and choose a mode to start comparing.';
    }
  } else if (target === 'mode' && !canShowMode()) {
    next = getToken() ? 'import' : 'connect';
    if (dom.stepperStatus) {
      dom.stepperStatus.textContent = 'Import a list to choose a ranking mode.';
    }
  } else if (dom.stepperStatus) {
    dom.stepperStatus.textContent = '';
  }
  showStep(next);
}
