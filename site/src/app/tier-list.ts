import { dom } from './dom';
import { state } from './state';
import type { LocalResultsPayload, ResultRow } from './results';

export function renderTierList(payload: LocalResultsPayload) {
  if (!state.wasm || !dom.tierList || !dom.tierContainer || !dom.tierTemplate) return;

  const showTierList = dom.optInTierList?.checked ?? true;
  if (!showTierList) {
    dom.tierList.classList.add('hidden');
    return;
  }

  dom.tierList.classList.remove('hidden');
  dom.tierContainer.innerHTML = '';

  // Read K value from input
  let k = dom.tierKValue ? parseInt(dom.tierKValue.value, 10) : 5;
  k = Math.max(3, Math.min(7, k)); // clamp to 3-7

  // Generate tier labels dynamically
  const allLabels = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
  const tierLabels = allLabels.slice(0, k);
  state.wasm.compute_tiers(k);

  const tierGroups = Array.from({ length: k }, () => [] as ResultRow[]);

  console.log(`[tierlist] rendering ${payload.rows.length} items into ${k} tiers`);

  payload.rows.forEach(row => {
    const tierIdx = state.wasm!.get_tier_for(row.index);
    if (tierIdx >= 0 && tierIdx < k) {
      tierGroups[tierIdx].push(row);
    } else {
      console.warn(`[tierlist] item ${row.index} ("${row.title}") has invalid tier ${tierIdx}`);
    }
  });

  const nonEmptyTiers = tierGroups.filter(g => g.length > 0).length;
  console.log(`[tierlist] found ${nonEmptyTiers} non-empty tiers`);

  tierGroups.forEach((group, i) => {
    const clone = dom.tierTemplate!.content.cloneNode(true) as DocumentFragment;
    const rowEl = clone.querySelector('.tier-row')!;
    const labelEl = clone.querySelector('.tier-label')!;
    const itemsEl = clone.querySelector('.tier-items')!;

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
        // Option to compare this item next if clicked?
        state.focusPair = [item.index, -1]; // special flag or just scroll to table
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

  // To fix CORS for canvas, we temporarily use our proxy for images
  const imgs = Array.from(container.querySelectorAll('img'));
  const originalSrcs = new Map<HTMLImageElement, string>();

  imgs.forEach(img => {
    originalSrcs.set(img, img.src);
    if (img.src && !img.src.startsWith(window.location.origin)) {
      img.crossOrigin = "anonymous";
      img.src = `/api/proxy-image?url=${encodeURIComponent(img.src)}`;
    }
  });

  try {
    const h2c = (window as any).html2canvas;
    if (!h2c) {
      throw new Error('html2canvas not loaded');
    }

    // Small delay to ensure proxied images start loading if not cached
    await new Promise(r => setTimeout(r, 100));

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
