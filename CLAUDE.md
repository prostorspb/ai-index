# Global Claude Code Instructions

## AI-Index Standard v2.0

This configuration implements the AI-Index standard for context-efficient file reading across all projects.

---

## Core Principle

**Before reading large files (>100 lines), check for AI-Index header first.**

```
Read lines 1-60 → Check for @ai-index header
If found → Read only the needed section
If not found → Read file normally
```

---

## Workflow for Large Files

### Step 1: Check Index
```
Read file.ts lines 1-60
Look for:
  - @ai-index marker
  - Section table with line numbers
```

### Step 2: Read Specific Section
```
Based on task, identify section from table
Read only that section: lines 352-480 (for example)
```

### Step 3: After Editing
```
If lines added/removed:
  - Update section end numbers
  - Shift all following sections
  - Update @generated timestamp
```

---

## Index Format Reference

### TypeScript / JavaScript
```typescript
/**
 * @ai-index
 * @generated 2026-01-18T12:00:00Z
 * @total-lines 2250
 *
 * | Section        | Line | End  | Description       |
 * |----------------|------|------|-------------------|
 * | imports        | 1    | 45   | Dependencies      |
 * | types          | 47   | 125  | Interfaces        |
 * | store/nodes    | 180  | 350  | Node operations   |
 */

//#region imports
import { create } from 'zustand';
//#endregion
```

### Python
```python
"""
@ai-index
@generated 2026-01-18T12:00:00Z
@total-lines 1500

| Section   | Line | End  | Description   |
|-----------|------|------|---------------|
| imports   | 1    | 30   | Imports       |
| models    | 32   | 200  | Data models   |
| routes    | 202  | 800  | API routes    |
"""

#region imports
from fastapi import FastAPI
#endregion
```

### Rust
```rust
//! @ai-index
//! @generated 2026-01-18T12:00:00Z
//! @total-lines 1200
//!
//! | Section     | Line | End  | Description     |
//! |-------------|------|------|-----------------|
//! | imports     | 1    | 30   | Use statements  |
//! | structs     | 32   | 150  | Data structures |
//! | impl        | 152  | 800  | Implementations |

// region: imports
use std::collections::HashMap;
// endregion: imports
```

### Go
```go
/*
@ai-index
@generated 2026-01-18T12:00:00Z
@total-lines 900

| Section   | Line | End  | Description  |
|-----------|------|------|--------------|
| imports   | 1    | 20   | Imports      |
| types     | 22   | 100  | Type defs    |
| handlers  | 102  | 500  | HTTP handlers|
*/

// region: imports
package main
import "net/http"
// endregion: imports
```

### JSON (with index key)
```json
{
  "_ai_index": {
    "version": "2.0",
    "generated": "2026-01-18T12:00:00Z",
    "sections": {
      "config": { "line": 10, "end": 50, "desc": "Configuration" },
      "data": { "line": 52, "end": 500, "desc": "Main data" }
    }
  }
}
```

### YAML
```yaml
# @ai-index
# @generated: 2026-01-18
# @total-lines: 800
#
# | Section   | Line | End  | Description  |
# |-----------|------|------|--------------|
# | config    | 10   | 50   | Settings     |
# | database  | 52   | 200  | DB config    |

#region config
app:
  name: MyApp
#endregion
```

---

## Section Naming Convention

```
{category}                  - top level (imports, types, store)
{category}/{subcategory}    - nested (store/nodes, api/routes)
{category}/{sub}/{detail}   - detailed (store/nodes/validation)
```

---

## When to Apply

| File Size     | Recommendation        |
|---------------|----------------------|
| < 100 lines   | Not needed           |
| 100-300 lines | Optional             |
| > 300 lines   | Recommended          |
| > 500 lines   | Required             |

**Optimal section size: 50-200 lines**

---

## Context Savings

```
Without AI-Index:
  2000-line file = ~15000 tokens

With AI-Index:
  60 lines (header) + 150 lines (section) = ~1500 tokens

Savings: 90%
```

---

## Indexing Script

Run in project directory:
```bash
node scripts/ai-index.mjs src/stores/projectStore.ts
node scripts/ai-index.mjs src/**/*.ts --min-lines=200
node scripts/ai-index.mjs --reindex-modified
```

---

## Standard Documentation

Full specification: `docs/AI_INDEX_STANDARD.md`
Multi-format research: `docs/AI_INDEX_MULTIFORMAT_RESEARCH.md`
Script: `scripts/ai-index.mjs`

---

*AI-Index Standard v2.0 - Context-efficient file indexing for AI assistants*
