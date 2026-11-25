# DeadCode Necromancer

> **Live Web App:** [https://chiru534.github.io/mindatlas-3d/](https://chiru534.github.io/mindatlas-3d/)  
> **Source Repository:** [https://github.com/Chiru534/mindatlas-3d](https://github.com/Chiru534/mindatlas-3d)  
> **Kiroween 2026 Track:** Resurrection / Frankenstein  
> **Author:** Chiru534

---

## Overview

**DeadCode Necromancer** is an ultra-crisp 2D legacy codebase autopsy and surgical resurrection studio built for the **Kiroween Hackathon**. Instead of letting decaying, bug-ridden legacy code rot in production, developers paste or load haunted codebases to:

1. **Run Static Curse Autopsy (`src/services/curseAnalyzer.ts`):** Line-by-line detection of critical security vulnerabilities (`eval()` RCE, SQL string concatenation, hardcoded secrets, DOM XSS sinks), async anti-patterns (callback hell, unhandled promises), and legacy APIs, producing a live **Vitality Score (0–100%)** and **Cyclomatic Complexity**.
2. **Explore 2D SVG Taint & Call Topology (`src/components/AutopsyGraph2D.tsx`):** Crisp interactive 2D SVG graph mapping module entry points, functions, and cursed sinks with clickable jump-to-line navigation.
3. **Cast Surgical Resurrection (`src/services/resurrectionEngine.ts`):** Deterministic patching (`var` → `const`, `==` → `===`, parameterized SQL queries, `innerHTML` → `textContent`, `eval()` → `JSON.parse()`) with a line-by-line **Surgical Diff Viewer**.
4. **Verify Kiro Policy Hooks (`.kiro/`):** Real-time validation against `.kiro/hooks/resurrection-validator.json` (`zero-eval-policy`, `sql-parameterization`, `xss-sink-shield`, `strict-equality-guard`, `modern-async-flow`).

---

## Local Development

```bash
npm install
npm run dev
npm test -- --run
npm run build
```
