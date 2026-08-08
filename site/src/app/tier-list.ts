import { setStatus } from '../lib/utils';
import { dom } from './dom';
import { state } from './state';
import type { ResultsPayload, ResultRow } from '../lib/types';

const TIER_LABELS = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];

export function renderTierList(payload: ResultsPayload) {
  // Only the export grid needs the template; the sidebar rows must still
  // render if the off-screen block is absent.
  if (!state.wasm) return;

  // An empty number input parses to NaN, and NaN survives Math.max/Math.min,
  // so clamp only after establishing a real number.
  const parsedK = dom.tierKValue ? parseInt(dom.tierKValue.value, 10) : 5;
  const k = Math.max(3, Math.min(7, Number.isFinite(parsedK) ? parsedK : 5));

  const tierLabels = TIER_LABELS.slice(0, k);
  state.wasm.compute_tiers(k);

  const tierGroups = Array.from({ length: k }, () => [] as ResultRow[]);

  payload.rows.forEach(row => {
    const tierIdx = state.wasm!.get_tier_for(row.index);
    if (tierIdx >= 0 && tierIdx < k) {
      tierGroups[tierIdx].push(row);
    } else {
      console.warn(`[tierlist] item ${row.index} has tier ${tierIdx}, outside 0..${k - 1}`);
    }
  });

  if (dom.tierLines) dom.tierLines.innerHTML = '';
  if (dom.tierExport) dom.tierExport.innerHTML = '';

  const populated = tierGroups.some(group => group.length > 0);
  dom.tierBlock?.classList.toggle('hidden', !populated);
  if (!populated) return;

  // One pass feeds both surfaces: the sidebar text rows people read, and the
  // off-screen grid that `downloadTierListImage` rasterises.
  tierGroups.forEach((group, i) => {
    if (group.length === 0) return;
    const label = tierLabels[i] || '?';
    appendTierLine(label, group);
    appendExportRow(i, label, group);
  });
}

function appendTierLine(label: string, group: ResultRow[]) {
  if (!dom.tierLines) return;

  const line = document.createElement('div');
  line.className = 'tier-line';

  const labelEl = document.createElement('span');
  labelEl.className = 'tier-line-label';
  labelEl.textContent = label;

  const namesEl = document.createElement('span');
  namesEl.className = 'tier-line-names';
  // Titles arrive from arbitrary CSV, so they are written as text, not markup.
  namesEl.textContent = group.map(row => row.title).join(', ');

  line.appendChild(labelEl);
  line.appendChild(namesEl);
  dom.tierLines.appendChild(line);
}

function appendExportRow(tierIndex: number, label: string, group: ResultRow[]) {
  if (!dom.tierExport || !dom.tierTemplate) return;

  const clone = dom.tierTemplate.content.cloneNode(true) as DocumentFragment;
  const rowEl = clone.querySelector('.tier-row')!;
  const labelEl = clone.querySelector('.tier-label')!;
  const itemsEl = clone.querySelector('.tier-items')!;

  rowEl.setAttribute('data-tier', String(tierIndex));
  labelEl.textContent = label;

  group.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'tier-item';

    const img = document.createElement('img');
    img.alt = item.title;
    // Both of these exist for the PNG export and must be set before `src`.
    // `crossOrigin` makes the very first fetch a CORS request so the canvas
    // is never tainted. Setting it later cannot work: the browser reuses the
    // cached non-CORS response for the re-request and the load simply fails,
    // which is how every cover silently vanished from the exported image.
    // `loading="lazy"` would leave off-screen tiers blank in the capture.
    img.crossOrigin = 'anonymous';

    const useTextFallback = () => {
      itemEl.classList.add('no-image');
      img.style.display = 'none';
      const fallback = document.createElement('div');
      fallback.className = 'tier-item-text';
      fallback.textContent = item.title;
      itemEl.insertBefore(fallback, itemEl.firstChild);
    };

    // The 56×80 cell wants the `medium` thumbnail; `coverArt` is the
    // extraLarge Compare poster and would download megabytes per tier.
    if (item.coverImage) {
      img.src = item.coverImage;
      img.onerror = useTextFallback;
    } else {
      useTextFallback();
    }

    itemEl.appendChild(img);
    itemsEl.appendChild(itemEl);
  });

  dom.tierExport.appendChild(clone);
}

export async function downloadTierListImage() {
  const container = dom.tierExport as HTMLElement;
  if (!container) return;

  const downloadButton = document.querySelector('[data-action="download-tierlist"]');
  if (!downloadButton) return;

  const originalText = downloadButton.textContent;
  downloadButton.textContent = 'Working';
  downloadButton.setAttribute('disabled', 'true');
  setStatus(dom.tierStatus, 'Moonsorter makes the tier list image.');

  // Covers are already CORS-clean: `renderTierList` sets `crossOrigin` before
  // `src`, so the canvas is untainted and there is nothing to swap here.
  const imgs = Array.from(container.querySelectorAll('img'));

  try {
    // Only pull the ~194 KB renderer when someone actually exports. Nothing
    // else in the app needs it, and most sessions never click this button.
    const h2cPromise = import('html2canvas');

    // Give the re-requested images a chance to resolve from cache.
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
      ),
    );

    const { default: h2c } = await h2cPromise;

    const canvas = await h2c(container, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#F3F3EC',
      scale: 2,
      logging: false,
    });

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `moonsorter-tierlist-${new Date().getTime()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setStatus(dom.tierStatus, 'Moonsorter saved the tier list image.');
    downloadButton.textContent = 'Saved';
  } catch (error) {
    console.error('[tierlist] Export failed', error);
    setStatus(dom.tierStatus, 'The tier list export failed. Make a screenshot of the tier list.');
    downloadButton.textContent = 'Failed';
  } finally {
    setTimeout(() => {
      downloadButton.textContent = originalText;
      downloadButton.removeAttribute('disabled');
    }, 2000);
  }
}
