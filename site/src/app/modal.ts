// Dialog controller for the app's `.modal-overlay` elements. Visibility is the
// `hidden` class (`display: none !important`), so a hidden overlay's contents
// have no `offsetParent` and are correctly skipped by the focusable scan.

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type OpenModal = {
  overlay: HTMLElement;
  restoreFocus: HTMLElement | null;
};

// Topmost modal is last. The app opens one at a time, but Escape, the focus
// trap and backdrop clicks all resolve against this stack so nesting works.
const stack: OpenModal[] = [];

// One set of document listeners for the whole controller, installed on the
// first open and removed once the stack drains.
let listening = false;

// Where the pointer went down for the click currently being dispatched. A
// press inside the card that drags out onto the backdrop reports the overlay
// as the click target, and that must not count as a backdrop dismissal.
let pressOrigin: EventTarget | null = null;

function modalCard(overlay: HTMLElement): HTMLElement {
  return overlay.querySelector<HTMLElement>('.modal-card') ?? overlay;
}

function focusableIn(overlay: HTMLElement): HTMLElement[] {
  const card = modalCard(overlay);
  return Array.from(
    overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.offsetParent !== null || element === card);
}

function focusCard(overlay: HTMLElement): void {
  const card = modalCard(overlay);
  if (!card.hasAttribute('tabindex')) {
    card.setAttribute('tabindex', '-1');
  }
  card.focus();
}

function focusFirst(overlay: HTMLElement): void {
  const first = focusableIn(overlay)[0];
  if (first) {
    first.focus();
    return;
  }
  focusCard(overlay);
}

function handleKeydown(event: KeyboardEvent): void {
  const top = stack[stack.length - 1];
  if (!top) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    // Keep the app's global compare shortcuts from also seeing this key.
    event.stopPropagation();
    closeModal(top.overlay);
    return;
  }

  if (event.key !== 'Tab') return;

  const items = focusableIn(top.overlay);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    // Nothing tabbable inside: park focus on the card rather than letting Tab
    // escape to the page behind the dialog.
    event.preventDefault();
    focusCard(top.overlay);
    return;
  }

  const active = document.activeElement;
  const inside = active instanceof HTMLElement && top.overlay.contains(active);
  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleMousedown(event: MouseEvent): void {
  pressOrigin = event.target;
}

function handleClick(event: MouseEvent): void {
  const origin = pressOrigin;
  pressOrigin = null;
  const target = event.target;
  if (!(target instanceof HTMLElement) || target !== origin) return;
  const entry = stack.find((item) => item.overlay === target);
  if (entry) {
    closeModal(entry.overlay);
  }
}

function startListening(): void {
  if (listening) return;
  // Capture phase so the trap wins over anything bound further down the tree.
  document.addEventListener('keydown', handleKeydown, true);
  document.addEventListener('mousedown', handleMousedown, true);
  document.addEventListener('click', handleClick, true);
  listening = true;
}

function stopListening(): void {
  if (!listening) return;
  document.removeEventListener('keydown', handleKeydown, true);
  document.removeEventListener('mousedown', handleMousedown, true);
  document.removeEventListener('click', handleClick, true);
  listening = false;
  pressOrigin = null;
}

export function openModal(overlay: HTMLElement): void {
  const active = document.activeElement;
  const alreadyOpen = stack.some((item) => item.overlay === overlay);
  overlay.classList.remove('hidden');
  if (!alreadyOpen) {
    stack.push({
      overlay,
      restoreFocus:
        active instanceof HTMLElement && !overlay.contains(active)
          ? active
          : null,
    });
  }
  startListening();
  // Must run after `hidden` is off: a display:none subtree reports no
  // offsetParent and would scan as having nothing focusable.
  focusFirst(overlay);
}

export function closeModal(overlay: HTMLElement): void {
  overlay.classList.add('hidden');
  const index = stack.findIndex((item) => item.overlay === overlay);
  if (index === -1) return;
  const [entry] = stack.splice(index, 1);
  if (stack.length === 0) {
    stopListening();
  }
  if (!entry) return;

  // Closing a buried modal must not steal focus from the one still on top.
  const active = document.activeElement;
  const heldFocus =
    active === null || active === document.body || overlay.contains(active);
  if (!heldFocus) return;

  const target = entry.restoreFocus;
  // getClientRects() rather than offsetParent: it stays truthy for a
  // position: fixed opener (the compare actions bar) but goes empty once the
  // element is detached or sits inside a closed dialog.
  if (target && target.isConnected && target.getClientRects().length > 0) {
    target.focus();
  } else if (active instanceof HTMLElement) {
    // Nothing sane to return to; drop focus instead of stranding it on a
    // control that is no longer rendered.
    active.blur();
  }
}

export function isAnyModalOpen(): boolean {
  return stack.length > 0;
}
