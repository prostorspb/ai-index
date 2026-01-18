# AI-Index Reading Skill

## Purpose

Efficient reading of large files (>150 lines) through section indexes.
Saves 80-95% of context by reading only relevant sections.

---

## Step 1: Detect Index

Before reading a large file, check first 50 lines:

```
view {file} 1-50
```

Look for `@ai-index` block:

```
/**
 * @ai-index
 * | Section     | Line | End  |
 * |-------------|------|------|
 * | imports     |    1 |   30 |
 * | store/nodes |  150 |  300 |
 */
```

If found → file is indexed, use section reading.
If not found → read file normally.

---

## Step 2: Read Section

1. Find section in table: `| store/nodes | 150 | 300 |`
2. Read only that range:
```
view {file} 150-300
```

---

## Step 3: After Editing

If you added N lines to a section:

1. Update this section: `End += N`
2. Shift ALL sections BELOW: `Line += N`, `End += N`

**Example:** Added 20 lines to `store/nodes`

```
Before: | store/nodes | 150 | 300 |
        | store/edges | 302 | 400 |

After:  | store/nodes | 150 | 320 |  ← End +20
        | store/edges | 322 | 420 |  ← shift +20
```

Then suggest: "Run `ai-index sync` to update index"

---

## Region Markers

Look for explicit section boundaries:

**TypeScript/JavaScript:**
```typescript
//#region store/nodes
// ... code ...
//#endregion
```

**Python:**
```python
# region: validation
# ... code ...
# endregion
```

**Rust/Go:**
```rust
// region: handlers
// ... code ...
// endregion
```

---

## Companion Files

Additional context in `{file}.ai.md` or `.ai/{file}.md`:

- Section descriptions
- Dependencies
- Architecture notes

Read when you need context about the file as a whole.

---

## Quick Reference

| Action | Command |
|--------|---------|
| Check for index | `view file 1-50` |
| Read section | `view file {Line}-{End}` |
| After edit | Update table, suggest `ai-index sync` |
| Need context | Read `file.ai.md` |
