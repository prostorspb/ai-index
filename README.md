# AI-Index v2.1

Dynamic file indexing for AI assistants. Reduces context usage by 80-95% when working with large files.

## Problem

AI assistants waste context reading entire large files:

```
projectStore.ts = 2250 lines = ~15000 tokens
Need to modify 1 function = ~50 lines = ~300 tokens

Waste: 98% of context
```

## Solution

**MCP Server** that dynamically generates file index on demand. No file modifications needed.

```
AI calls: get_file_index("projectStore.ts")
Returns:  { sections: [{name: "store/nodes", line: 180, end: 350}, ...] }
AI calls: read_section("projectStore.ts", "store/nodes")
Returns:  Only 170 lines instead of 2250
```

## Installation

```bash
npm install -g @physcode/ai-index
```

## MCP Server Setup (Recommended)

Add to your Claude Code MCP config (`~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "ai-index": {
      "command": "ai-index-mcp"
    }
  }
}
```

Or with npx:

```json
{
  "mcpServers": {
    "ai-index": {
      "command": "npx",
      "args": ["@physcode/ai-index", "mcp"]
    }
  }
}
```

## MCP Tools

### get_file_index
Get section map of any file. Auto-detects language and sections.

```json
{
  "file": "projectStore.ts",
  "language": "ts",
  "totalLines": 2250,
  "sections": [
    { "name": "imports", "line": 1, "end": 45, "size": 45 },
    { "name": "types", "line": 47, "end": 125, "size": 79 },
    { "name": "store/nodes", "line": 180, "end": 350, "size": 171 }
  ]
}
```

### read_section
Read specific section by name. Returns only the relevant code.

```json
{
  "section": "store/nodes",
  "lineStart": 180,
  "lineEnd": 350,
  "content": "addNode: (position) => {...}"
}
```

## CLI Usage (Legacy)

```bash
# Add embedded index to file
ai-index src/stores/projectStore.ts

# Verify embedded index
ai-index src/stores/projectStore.ts --verify

# Remove embedded index
ai-index src/stores/projectStore.ts --remove
```

## Companion Markdown Files (Recommended)

Create a markdown file next to your source file to document sections:

**Location options:**
- `projectStore.ts.ai.md` (next to file)
- `.ai/projectStore.ts.md` (in .ai folder)
- `.ai/projectStore.md` (without extension)

**Format:**

```markdown
# projectStore.ts

Main Zustand store for the project. Manages nodes, edges, and connectors.

## Sections

| Section | Lines | Description |
|---------|-------|-------------|
| imports | 1-45 | External dependencies |
| types | 47-125 | TypeScript interfaces |
| store/nodes | 180-350 | Node CRUD operations |
| store/edges | 352-480 | Edge management |
| store/connectors | 482-620 | Connector generation |

## Notes

This store uses immer for immutable updates.
See also: uiStore.ts for UI state.
```

**Benefits:**
- Human-readable documentation
- Line numbers updated manually only when needed
- Extra context (description, notes) for AI
- No code modifications required
- Works with any existing codebase

## Supported Languages

| Language | Extensions | Region Marker |
|----------|-----------|---------------|
| TypeScript/JavaScript | .ts, .tsx, .js, .jsx, .mjs | `//#region name` |
| Python | .py, .pyw, .pyi | `# region: name` |
| Rust | .rs | `// region: name` |
| Go | .go | `// region: name` |
| C# | .cs | `#region name` |
| Java | .java | `// region name` |
| YAML | .yaml, .yml | `# region: name` |
| JSON | .json, .json5 | `"_ai_index": {...}` |

## Priority

The MCP server uses this priority for section detection:
1. **Companion markdown** (if exists) — most reliable
2. **#region markers** in code — explicit
3. **Auto-detection** — pattern matching

## Index Format (Legacy)

```typescript
/**
 * @ai-index
 * @generated 2026-01-18T12:00:00Z
 * @total-lines 2250
 *
 * | Section        | Line | End  | Size | Description       |
 * |----------------|------|------|------|-------------------|
 * | imports        |    1 |   45 |   45 | Dependencies      |
 * | types          |   47 |  125 |   79 | Type definitions  |
 * | store/nodes    |  180 |  350 |  171 | Node operations   |
 * | store/edges    |  352 |  480 |  129 | Edge operations   |
 */

//#region imports
import { create } from 'zustand';
//#endregion

//#region store/nodes
addNode: (position) => { ... },
deleteNode: (id) => { ... },
//#endregion
```

## AI Workflow

1. **Read index** (lines 1-60)
2. **Identify section** from task requirements
3. **Read only that section** (e.g., lines 352-480)
4. **Edit** the section
5. **Update index** line numbers if size changed

## VSCode Integration

The `//#region` format is compatible with VSCode:
- Automatic code folding (Ctrl+Shift+[ / ])
- Breadcrumbs navigation
- Outline view

## Context Savings

| File Size | Without Index | With Index | Savings |
|-----------|---------------|------------|---------|
| 500 lines | ~3500 tokens | ~500 tokens | 86% |
| 1000 lines | ~7000 tokens | ~600 tokens | 91% |
| 2000 lines | ~14000 tokens | ~800 tokens | 94% |

## Claude Code Integration

Add to your global `~/.claude/CLAUDE.md`:

```markdown
## AI-Index Standard

Before reading large files (>100 lines), check for @ai-index header first.
Read lines 1-60 to get the index, then read only the section you need.
```

## License

MIT
