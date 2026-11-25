# DeadCode Necromancer

> **Live Web App:** [https://chiru534.github.io/mindatlas-3d/](https://chiru534.github.io/mindatlas-3d/)  
> **Source Repository:** [https://github.com/Chiru534/mindatlas-3d](https://github.com/Chiru534/mindatlas-3d)  
> **Kiroween 2026 Track:** Resurrection / Frankenstein  
> **Author:** Chiru534

---

## Overview

**DeadCode Necromancer** is a browser-native **TypeScript AST Autopsy & Surgical Resurrection Studio** built for the **Kiroween Hackathon**. Instead of fragile regexes, it runs the **Microsoft TypeScript Compiler AST (`typescript`)** directly in the browser to diagnose legacy codebases, visualize call/taint topologies, apply offset-exact surgical codemods, and verify zero compiler syntax errors.

### Five Stitched Capabilities (Frankenstein + Resurrection)
1. **In-Browser TypeScript AST & Compiler Diagnostics (`src/services/curseAnalyzer.ts`):**
   - Uses `ts.createSourceFile` and `ts.transpileModule(..., { reportDiagnostics: true })` in the browser to detect real syntactic errors and AST-verified curses (`eval`/`new Function` RCE, SQL binary concatenation, hardcoded credentials, `.innerHTML` / `dangerouslySetInnerHTML` XSS, reassigned vs. immutable `var` hoisting, loose `==`/`!=`, legacy React `UNSAFE_` lifecycles, error-first callback pyramids, unhandled `.then()` chains, and zombie comments).
2. **AST-Offset Surgical Codemod & Patch Exporter (`src/services/resurrectionEngine.ts`):**
   - Performs non-overlapping right-to-left AST offset edits: chooses `let` vs `const` from real mutation tracking, parameterizes SQL strings *and* wires parameter arrays into `db.query`/`db.execute` call sites, generates side-by-side Split Diffs, Unified Diffs, and exports git-ready `.patch` or `.ts` files.
3. **Real-World File Upload, Drag-and-Drop & GitHub Import (`src/components/TopBar.tsx`, `CodeAutopsyEditor.tsx`):**
   - Drop any `.js`/`.ts`/`.jsx`/`.tsx` file or paste any public GitHub blob/Raw Gist URL to run an instant autopsy.
4. **Interactive 2D SVG Taint & Call Topology (`src/components/AutopsyGraph2D.tsx`):**
   - Extracts functions, classes, and cursed sinks from the AST into a clickable 2D SVG Bezier diagram.
5. **Optional BYOK AI Necromancy + Kiro Hooks (`src/services/aiNecromancer.ts`, `.kiro/hooks/resurrection-validator.json`):**
   - Works 100% offline with the zero-config Local AST Engine, or accepts an optional Gemini / OpenAI key in session memory for full structural async/await rewrites—automatically verified by our local AST & `tsc` diagnostics.

---

## Local Development

```bash
npm install
npm run dev
npm test -- --run
npm run build
```
