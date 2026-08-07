import { dom } from './dom';
import { state } from './state';
import type { ResultsPayload, ResultRow } from '../lib/types';

export function renderTierList(payload: ResultsPayload) {
  if (!state.wasm || !dom.tierList || !dom.tierContainer || !dom.tierTemplate) return;

  const showTierList = dom.optInTierList?.checked ?? true;
  if (!showTierList) {
    dom.tierList.classList.add('hidden');
    return;
  }

  dom.tierList.classList.remove('hidden');
  dom.tierContainer.innerHTML = '';

  // An empty number input parses to NaN, and NaN survives Math.max/Math.min,
  // so clamp only after establishing a real number.
  const parsedK = dom.tierKValue ? parseInt(dom.tierKValue.value, 10) : 5;
  const k = Math.max(3, Math.min(7, Number.isFinite(parsedK) ? parsedK : 5));

  // Generate tier labels dynamically
  const allLabels = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
  const tierLabels = allLabels.slice(0, k);
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

  tierGroups.forEach((group, i) => {
    if (group.length === 0) return;
    const clone = dom.tierTemplate!.content.cloneNode(true) as DocumentFragment;
    const rowEl = clone.querySelector('.tier-row')!;
    const labelEl = clone.querySelector('.tier-label')!;
    const itemsEl = clone.querySelector('.tier-items')!;

    rowEl.setAttribute('data-tier', String(i));
    labelEl.textContent = tierLabels[i] || '?';

    group.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'tier-item';
      itemEl.title = item.title;

      const img = document.createElement('img');
      img.alt = item.title;
      img.loading = 'lazy';

      if (item.coverImage) {
        img.src = item.coverImage;
        img.onerror = () => {
          // Fallback to text-only card
          itemEl.classList.add('no-image');
          img.style.display = 'none';
          const fallback = document.createElement('div');
          fallback.className = 'tier-item-text';
          fallback.textContent = item.title;
          itemEl.insertBefore(fallback, itemEl.firstChild);
        };
      } else {
        // No image available, show text
        itemEl.classList.add('no-image');
        img.style.display = 'none';
        const fallback = document.createElement('div');
        fallback.className = 'tier-item-text';
        fallback.textContent = item.title;
        itemEl.insertBefore(fallback, itemEl.firstChild);
      }

      const tooltip = document.createElement('div');
      tooltip.className = 'item-tooltip';
      tooltip.textContent = item.title;

      itemEl.appendChild(img);
      itemEl.appendChild(tooltip);

      itemEl.onclick = () => {
        state.focusPair = null;
        const tableRow = document.querySelector(`tr[data-index="${item.index}"]`);
        tableRow?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tableRow?.classList.add('highlight-flash');
        setTimeout(() => tableRow?.classList.remove('highlight-flash'), 2000);
      };

      itemsEl.appendChild(itemEl);
    });

    dom.tierContainer!.appendChild(clone);
  });
}

export async function downloadTierListImage() {
  const container = dom.tierContainer as HTMLElement;
  if (!container) return;

  const downloadButton = document.querySelector('[data-action="download-tierlist"]');
  if (!downloadButton) return;

  const originalText = downloadButton.textContent;
  downloadButton.textContent = 'Generating...';
  downloadButton.setAttribute('disabled', 'true');

  // The build is static, so there is no image proxy to route through. The
  // AniList CDN sends `Access-Control-Allow-Origin: *`, so re-requesting each
  // cover with crossOrigin set is enough to keep the canvas untainted.
  const imgs = Array.from(container.querySelectorAll('img'));
  const originalSrcs = new Map<HTMLImageElement, string>();

  imgs.forEach((img) => {
    if (img.src && !img.src.startsWith(window.location.origin)) {
      originalSrcs.set(img, img.src);
      img.crossOrigin = 'anonymous';
      img.src = img.src;
    }
  });

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
      backgroundColor: '#111',
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

    downloadButton.textContent = 'Saved!';
  } catch (error) {
    console.error('[tierlist] Export failed', error);
    alert('Export failed. Browser security still blocked the images. Manual screenshot is the safest bet!');
    downloadButton.textContent = 'Failed';
  } finally {
    // Restore original sources
    imgs.forEach(img => {
      const original = originalSrcs.get(img);
      if (original) {
        img.src = original;
        img.removeAttribute('crossOrigin');
      }
    });

    setTimeout(() => {
      downloadButton.textContent = originalText;
      downloadButton.removeAttribute('disabled');
    }, 2000);
  }
}
