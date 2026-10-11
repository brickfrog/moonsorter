import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { buildSavedState, clearStoredState, loadState, saveState } from './storage';
import { resetState, state, STATE_KEY } from './state';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let values: Map<string, string>;
let storage: Storage;
let warning: ReturnType<typeof spyOn>;

beforeEach(() => {
  resetState();
  state.items = [
    { title: 'A', score: 8, mediaId: 1 },
    { title: 'B', score: 6, mediaId: null },
    { title: 'C', score: 0, mediaId: 3 },
  ];
  state.comparisons = [{ indices: [0, 1], tie: true }, { indices: [2, 1, 0] }];
  state.priorComparisons = [{ indices: [0, 1] }];
  values = new Map();
  storage = {
    get length() { return values.size; },
    clear() { values.clear(); },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  warning = spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warning.mockRestore();
  resetState();
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

test('round-trips the complete current session without losing history or metadata', () => {
  const saved = buildSavedState();
  saveState();
  expect(loadState()).toEqual(saved);
  expect(values.size).toBe(1);
});

test('accepts unversioned sessions with missing newer settings and priors', () => {
  const saved = { items: state.items, comparisons: state.comparisons,
    scoreFormat: 'POINT_5', preserveRange: false, includeUnscored: true };
  values.set(STATE_KEY, JSON.stringify(saved));
  expect(loadState()).toMatchObject({ ...saved, version: 1, priorComparisons: [],
    mediaType: 'ANIME', importMode: 'all', sliceCount: 20, useScorePrior: true });
});

test('returns null when no saved session exists', () => {
  expect(loadState()).toBeNull();
});

test('contains failures while accessing the storage property itself', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, get() { throw new DOMException('Blocked', 'SecurityError'); },
  });
  expect(loadState()).toBeNull();
  expect(() => saveState()).not.toThrow();
  expect(() => clearStoredState()).not.toThrow();
  expect(state.comparisons).toHaveLength(2);
});

test('contains getItem failures', () => {
  storage.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  expect(loadState()).toBeNull();
});

test('quota failure preserves the previous saved session and current in-memory history', () => {
  saveState();
  const previous = values.get(STATE_KEY);
  state.comparisons.push({ indices: [1, 2] });
  storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  expect(() => saveState()).not.toThrow();
  expect(state.comparisons).toHaveLength(3);
  expect(values.get(STATE_KEY)).toBe(previous);
  // Persistence can recover on the next save without discarding decisions.
  storage.setItem = (key, value) => { values.set(key, value); };
  saveState();
  expect(loadState()?.comparisons).toEqual(state.comparisons);
});

test('contains removeItem failures without clearing unrelated keys or in-memory state', () => {
  values.set('other-app', 'keep');
  storage.removeItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  expect(() => clearStoredState()).not.toThrow();
  expect(state.items).toHaveLength(3);
  expect(values.get('other-app')).toBe('keep');
});

test('successful clear removes only the session key', () => {
  saveState();
  values.set('other-app', 'keep');
  clearStoredState();
  expect(loadState()).toBeNull();
  expect(values.get('other-app')).toBe('keep');
});

test('a comparison still updates progress and advances the pair when saving is full', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const title = { textContent: '' };
  const count = { textContent: '' };
  const fill = { style: { width: '' } };
  const nodes = new Map<string, unknown>([
    ['[data-choice-title="A"]', title], ['[data-choice-title="B"]', title],
    ['[data-progress-count]', count], ['[data-progress-fill]', fill],
  ]);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    querySelector: (selector: string) => nodes.get(selector) ?? null,
    querySelectorAll: () => [], getElementById: () => null,
  } });
  try {
    const { handleChoice } = await import('./comparison');
    let answered = 0;
    const ranker = {
      add_comparison: () => { answered++; return true; },
      get_progress_completed: () => answered,
      get_progress_estimated: () => 3,
      get_next_pair_encoded: () => 5, // Next pair: [1, 2] for three titles.
    };
    state.wasm = ranker as typeof state.wasm;
    state.currentPair = [0, 1];
    state.comparisons = [];
    storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    handleChoice(1);
    expect(state.comparisons).toEqual([{ indices: [0, 1] }]);
    expect(state.currentPair).toEqual([1, 2]);
    expect(count.textContent).toBe('1 of ~3 answered');
    expect(fill.style.width).toBe('33%');
    handleChoice(3);
    expect(state.comparisons).toEqual([{ indices: [0, 1] }, { indices: [2, 1] }]);
    expect(count.textContent).toBe('2 of ~3 answered');
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test.each([
  'not json', 'null', '[]', '{}',
  JSON.stringify({ items: {}, comparisons: [] }),
  JSON.stringify({ items: [null], comparisons: [] }),
  JSON.stringify({ items: [{ title: '   ' }], comparisons: [] }),
])('rejects malformed saved data without deleting it: %s', (raw) => {
  values.set(STATE_KEY, raw);
  expect(loadState()).toBeNull();
  expect(values.get(STATE_KEY)).toBe(raw);
});

test.each([
  { comparisons: {} }, { comparisons: [null] },
  { comparisons: [{ indices: [0, '1'] }] },
  { comparisons: [{ indices: [0, 3] }] },
  { comparisons: [{ indices: [-1, 1] }] },
  { comparisons: [{ indices: [0, 1.5] }] },
  { comparisons: [{ indices: [1, 1] }] },
  { comparisons: [{ indices: [0] }] },
  { comparisons: [{ indices: [0, 1], tie: 'true' }] },
  { comparisons: [{ indices: [0, 1, 2], tie: true }] },
  { priorComparisons: {} }, { priorComparisons: [{ indices: [0, 5] }] },
  { version: 999 }, { importMode: {} }, { useScorePrior: 'false' },
])('rejects unsafe history and incompatible settings: %j', (patch) => {
  const raw = JSON.stringify({ ...buildSavedState(), ...patch });
  values.set(STATE_KEY, raw);
  expect(loadState()).toBeNull();
  expect(values.get(STATE_KEY)).toBe(raw);
});
