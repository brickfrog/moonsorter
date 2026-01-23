# Project Overview

## Purpose
Moonsorter is a Bradley-Terry / Plackett-Luce pairwise comparison ranking system implemented in MoonBit and compiled to WebAssembly. It enables ranking items through pairwise comparisons and full ranking inputs with uncertainty quantification.

## Tech Stack
- **Language**: MoonBit
- **Target**: WebAssembly (wasm-gc)
- **Build System**: Moon build system

## Core Algorithm
- Uses Plackett-Luce (PL) model for ranking: `P(i beats j) = 1 / (1 + exp(-(strength_i - strength_j)))`
- MM (Minorization-Maximization) algorithm for parameter estimation
- Constraint: `sum(strengths) = 0` for identifiability
- Supports uncertainty quantification via bootstrap sampling

## Key Features
- Full ranking input (not just pairwise)
- Uncertainty quantification with confidence intervals
- Multiple pair selection policies (random, uncertainty-based, coverage-based)
- Tier clustering for grouping similarly-ranked items
- Undo capability
- State serialization