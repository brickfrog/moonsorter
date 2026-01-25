/**
 * Moonsorter - Pairwise comparison ranking tool
 *
 * This is the main orchestrator that wires together all the modules.
 * Each module handles a specific concern:
 *
 * - state.ts: Centralized application state
 * - dom.ts: DOM element references
 * - steps.ts: Step navigation
 * - storage.ts: Session persistence
 * - wasm.ts: WASM bindings
 * - progress.ts: Progress tracking
 * - comparison.ts: Pairwise comparison logic
 * - results.ts: Results rendering
 * - tier-list.ts: Tier list rendering
 * - group.ts: Group sorting mode
 * - mode.ts: Mode selection
 * - config.ts: Import configuration
 * - import.ts: Data import (AniList/CSV)
 * - ranking.ts: Ranking initialization
 * - session.ts: Session management
 * - export.ts: Data export
 * - analysis.ts: Uncertainty analysis
 * - events.ts: Event bindings
 * - init.ts: App initialization
 */

// Wire up cross-module callbacks
import { setShowResultsCallback } from './comparison';
import { setRenderTierListCallback, showResults } from './results';
import { renderTierList } from './tier-list';
import { setStartRankingCallback } from './mode';
import { startRanking } from './ranking';
import { setupEvents } from './events';
import { initApp } from './init';

// Connect the callbacks between modules
setShowResultsCallback(showResults);
setRenderTierListCallback(renderTierList);
setStartRankingCallback(startRanking);

// Setup all event listeners
setupEvents();

// Initialize the application
initApp();
