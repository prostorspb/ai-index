# AI-Index v3.0

File indexing for AI assistants. CLI + Skill approach with **zero runtime overhead**.

## Problem

AI assistants waste context reading entire large files:

```
projectStore.ts = 2250 lines = ~15000 tokens
Need to modify 1 function = ~50 lines = ~300 tokens

Waste: 98% of context
```

## Solution

**CLI** generates index headers. **Skill** teaches AI to read them.

```
┌─────────────────────────────────────────────────┐
│  Developer              AI Agent                │
│      │                      │                   │
│      ▼                      ▼                   │
│  ┌───────────┐        ┌───────────┐            │
│  │    CLI    │        │   Skill   │            │
│  │ generate  │───────▶│  Reads    │            │
│  │ sync      │ index  │  table    │            │
│  │ verify    │        │           │            │
│  └───────────┘        └───────────┘            │
│                             │                   │
│                             ▼                   │
│                    view file 180-350            │
│                    (standard tool)              │
└─────────────────────────────────────────────────┘
```

**No MCP server = 0 tokens overhead per request.**

## Installation

```bash
npm install -g @physcode/ai-index
```

## CLI Commands

```bash
ai-index generate <file>     # Create/update index
ai-index sync [files...]     # Sync line numbers with #region markers
ai-index verify [files...]   # Check if index is up-to-date
ai-index remove <file>       # Remove index from file
```

### Generate Index

```bash
ai-index generate src/stores/projectStore.ts
```

Adds `@ai-index` header to file:

```typescript
/**
 * @ai-index
 * @generated 2026-01-18T12:00:00Z
 * @lines 2250
 *
 * | Section          | Line | End  | Size |
 * |------------------|------|------|------|
 * | imports          |   45 |   90 |   46 |
 * | types            |   92 |  180 |   89 |
 * | store/nodes      |  182 |  350 |  169 |
 * | store/edges      |  352 |  480 |  129 |
 */
```

### Sync Index

After editing, sync line numbers with #region markers:

```bash
ai-index sync src/stores/projectStore.ts
```

### Verify Index

```bash
ai-index verify --strict    # Fail on warnings
ai-index verify --ci        # JSON output for CI
```

## Skills

Copy to your AI configuration:

| File | For |
|------|-----|
| `skills/SKILL.md` | Full instructions |
| `skills/claude.md` | CLAUDE.md (compact) |
| `skills/cursor.mdc` | Cursor rules |

### For Claude Code

Add to your project's `CLAUDE.md`:

```markdown
## AI-Index

Large files may have `@ai-index` header with section map.

**Before reading file >100 lines:**
1. Read lines 1-50 — check for index
2. If table exists — read only needed section by line range
3. After editing — update line numbers in table
```

### For Cursor

Copy `skills/cursor.mdc` to `.cursor/rules/`

## Index Format

### Minimal

```typescript
/**
 * @ai-index
 * | Section | Line | End |
 * |---------|------|-----|
 * | imports |    1 |  30 |
 * | main    |   32 | 200 |
 */
```

### Extended

```typescript
/**
 * @ai-index
 * @generated 2026-01-18T12:00:00Z
 * @lines 2250
 *
 * | Section          | Line | End  | Size | Description        |
 * |------------------|------|------|------|--------------------|
 * | imports          |    1 |   45 |   45 | Dependencies       |
 * | types            |   47 |  125 |   79 | Interfaces         |
 * | store/nodes      |  150 |  320 |  171 | Node operations    |
 */
```

## Region Markers

Use `#region` for explicit section boundaries:

```typescript
//#region store/nodes — Node operations
addNode: (position) => { ... },
deleteNode: (id) => { ... },
//#endregion
```

```python
# region: validation
def validate_input(data):
    ...
# endregion
```

## Companion Files

Create `file.ai.md` for extra context:

```markdown
# projectStore.ts

Main Zustand store for the project.

## Sections

| Section | Description |
|---------|-------------|
| store/nodes | CRUD operations for graph nodes |
| store/edges | Edge management |

## Notes

- Uses immer middleware
- Undo/redo via temporal
```

## Git Integration

### Pre-commit Hook

```bash
#!/bin/sh
npx ai-index verify --strict $(git diff --cached --name-only | grep -E '\.(ts|py)$')
```

### GitHub Action

```yaml
- run: npx ai-index verify --ci --strict
```

## Comparison

| v2 (MCP) | v3 (Skill + CLI) |
|----------|------------------|
| +500-2000 tokens overhead | 0 tokens |
| Requires Node.js runtime | CLI only for dev |
| Only Claude Code + MCP | Any AI agent |
| `get_file_index` tool | `view file 1-50` |
| `read_section` tool | `view file 180-350` |

**Principle:** AI doesn't need a special tool to read a table in a comment. Just teach it how.

## License

MIT
