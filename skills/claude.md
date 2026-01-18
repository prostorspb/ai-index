## AI-Index

Large files may have `@ai-index` header with section map.

**Before reading file >100 lines:**
1. `view file 1-50` — check for index
2. If table exists — read only needed section: `view file {Line}-{End}`
3. After editing — update line numbers in table

**Index format:**
```
/**
 * @ai-index
 * | Section     | Line | End  |
 * |-------------|------|------|
 * | imports     |    1 |   45 |
 * | store/nodes |  180 |  350 |
 */
```

**After adding N lines:** shift all sections below by N.

Full skill: `.ai-index/SKILL.md`
