#!/usr/bin/env node
/**
 * AI-Index v2.0: Universal file indexing for AI assistants
 *
 * Adds section index to large files so AI can read only relevant parts.
 * Supports: TypeScript, JavaScript, Python, Rust, Go, C#, Java, YAML, JSON
 *
 * Usage:
 *   node scripts/ai-index.mjs <file>              # Index single file
 *   node scripts/ai-index.mjs <file> --reindex    # Update existing index
 *   node scripts/ai-index.mjs <file> --verify     # Check index validity
 *   node scripts/ai-index.mjs <file> --remove     # Remove index
 *   node scripts/ai-index.mjs --min-lines=200     # Only files with 200+ lines
 */

import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { basename, extname, join } from 'path';
import { existsSync } from 'fs';

// ============================================
// Language Plugins Configuration
// ============================================

const LANGUAGE_PLUGINS = {
  // TypeScript / JavaScript
  ts: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    indexFormat: 'jsdoc', // /** @ai-index ... */
    regionStart: /^\/\/#region\s+(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/#endregion/,
    sectionMarker: /\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
    autoPatterns: [
      { pattern: /^import\s+/m, section: 'imports', priority: 1 },
      { pattern: /^export\s+type\s+/m, section: 'types', priority: 2 },
      { pattern: /^(?:export\s+)?interface\s+\w+State/m, section: 'types/state', priority: 3 },
      { pattern: /^(?:export\s+)?interface\s+\w+Actions/m, section: 'types/actions', priority: 3 },
      { pattern: /^(?:export\s+)?interface\s+/m, section: 'types', priority: 2 },
      { pattern: /^(?:export\s+)?type\s+/m, section: 'types', priority: 2 },
      { pattern: /^const\s+initial\w*\s*[=:]/m, section: 'state/initial', priority: 4 },
      { pattern: /^export\s+const\s+use\w+Store\s*=/m, section: 'store', priority: 5 },
      { pattern: /create<.*>\(\s*\(?/m, section: 'store', priority: 5 },
      { pattern: /^export\s+const\s+select\w+/m, section: 'selectors', priority: 8 },
      { pattern: /^export\s+function\s+use\w+/m, section: 'hooks', priority: 9 },
    ]
  },

  // Python
  python: {
    extensions: ['.py', '.pyw', '.pyi'],
    indexFormat: 'docstring', // """ @ai-index ... """
    regionStart: /^#\s*region\s*[:\s]*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^#\s*endregion/,
    sectionMarker: /^#\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
    autoPatterns: [
      { pattern: /^(?:from|import)\s+/m, section: 'imports', priority: 1 },
      { pattern: /^class\s+\w+\s*\(/m, section: 'classes', priority: 3 },
      { pattern: /^class\s+\w+Model\s*\(/m, section: 'models', priority: 2 },
      { pattern: /^@dataclass/m, section: 'dataclasses', priority: 2 },
      { pattern: /^@app\.(get|post|put|delete|patch)/m, section: 'routes', priority: 4 },
      { pattern: /^@router\.(get|post|put|delete|patch)/m, section: 'routes', priority: 4 },
      { pattern: /^def\s+test_/m, section: 'tests', priority: 5 },
      { pattern: /^async\s+def\s+/m, section: 'async', priority: 3 },
    ]
  },

  // Rust
  rust: {
    extensions: ['.rs'],
    indexFormat: 'doc-comment', // //! @ai-index ...
    regionStart: /^\/\/\s*region:\s*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/\s*endregion/,
    sectionMarker: /^\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
    autoPatterns: [
      { pattern: /^use\s+/m, section: 'imports', priority: 1 },
      { pattern: /^mod\s+/m, section: 'modules', priority: 2 },
      { pattern: /^pub\s+struct\s+/m, section: 'structs', priority: 3 },
      { pattern: /^pub\s+enum\s+/m, section: 'enums', priority: 3 },
      { pattern: /^impl\s+/m, section: 'impl', priority: 4 },
      { pattern: /^pub\s+fn\s+/m, section: 'functions', priority: 5 },
      { pattern: /^#\[test\]/m, section: 'tests', priority: 6 },
    ]
  },

  // Go
  go: {
    extensions: ['.go'],
    indexFormat: 'block-comment', // /* @ai-index ... */
    regionStart: /^\/\/\s*region:\s*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/\s*endregion/,
    sectionMarker: /^\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
    autoPatterns: [
      { pattern: /^import\s*\(/m, section: 'imports', priority: 1 },
      { pattern: /^type\s+\w+\s+struct\s*\{/m, section: 'types', priority: 2 },
      { pattern: /^type\s+\w+\s+interface\s*\{/m, section: 'interfaces', priority: 2 },
      { pattern: /^func\s+\(\w+\s+\*?\w+\)/m, section: 'methods', priority: 3 },
      { pattern: /^func\s+\w+/m, section: 'functions', priority: 4 },
      { pattern: /^func\s+Test\w+/m, section: 'tests', priority: 5 },
    ]
  },

  // C#
  csharp: {
    extensions: ['.cs'],
    indexFormat: 'xml-doc', // /// <ai-index> ...
    regionStart: /^\s*#region\s+(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\s*#endregion/,
    sectionMarker: /\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
    autoPatterns: [
      { pattern: /^using\s+/m, section: 'imports', priority: 1 },
      { pattern: /^namespace\s+/m, section: 'namespace', priority: 2 },
      { pattern: /^public\s+class\s+/m, section: 'classes', priority: 3 },
      { pattern: /^public\s+interface\s+/m, section: 'interfaces', priority: 3 },
      { pattern: /^public\s+enum\s+/m, section: 'enums', priority: 3 },
      { pattern: /^\[Test\]/m, section: 'tests', priority: 5 },
    ]
  },

  // Java
  java: {
    extensions: ['.java'],
    indexFormat: 'javadoc', // /** @ai-index ... */
    regionStart: /^\/\/\s*region\s*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/\s*endregion/,
    sectionMarker: /\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
    autoPatterns: [
      { pattern: /^import\s+/m, section: 'imports', priority: 1 },
      { pattern: /^package\s+/m, section: 'package', priority: 0 },
      { pattern: /^public\s+class\s+/m, section: 'classes', priority: 2 },
      { pattern: /^public\s+interface\s+/m, section: 'interfaces', priority: 2 },
      { pattern: /^public\s+enum\s+/m, section: 'enums', priority: 2 },
      { pattern: /^@Test/m, section: 'tests', priority: 5 },
    ]
  },

  // YAML
  yaml: {
    extensions: ['.yaml', '.yml'],
    indexFormat: 'comment', // # @ai-index ...
    regionStart: /^#\s*region:\s*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^#\s*endregion/,
    sectionMarker: /^#\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
    autoPatterns: []
  },

  // JSON
  json: {
    extensions: ['.json', '.json5', '.jsonc'],
    indexFormat: 'key', // "_ai_index": { ... }
    regionStart: null, // No region support in JSON
    regionEnd: null,
    sectionMarker: /"__section__(\w+)__"/,
    autoPatterns: [
      { pattern: /"nodes"\s*:\s*\{/m, section: 'nodes' },
      { pattern: /"edges"\s*:\s*\{/m, section: 'edges' },
      { pattern: /"config"\s*:\s*\{/m, section: 'config' },
    ]
  }
};

// ============================================
// Helpers
// ============================================

function getLanguagePlugin(filePath) {
  const ext = extname(filePath).toLowerCase();
  for (const [name, plugin] of Object.entries(LANGUAGE_PLUGINS)) {
    if (plugin.extensions.includes(ext)) {
      return { name, ...plugin };
    }
  }
  return null;
}

function getFileType(filePath) {
  const plugin = getLanguagePlugin(filePath);
  return plugin ? plugin.name : 'unknown';
}

function parseExistingIndex(content) {
  const indexMatch = content.match(/\/\*\*\s*\n\s*\*\s*@ai-index[\s\S]*?\*\//);
  if (!indexMatch) return null;

  const indexBlock = indexMatch[0];
  const sections = {};

  // Parse table rows
  const tableRows = indexBlock.matchAll(/\|\s*([^\|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|(?:\s*(\d+)\s*\|)?(?:\s*([^\|]*?)\s*\|)?/g);
  for (const row of tableRows) {
    const [, name, line, end, size, desc] = row;
    if (name && !name.includes('Section') && !name.includes('---')) {
      sections[name.trim()] = {
        line: parseInt(line),
        end: parseInt(end),
        size: size ? parseInt(size) : parseInt(end) - parseInt(line),
        desc: desc?.trim() || ''
      };
    }
  }

  return {
    raw: indexBlock,
    sections,
    startIndex: indexMatch.index,
    endIndex: indexMatch.index + indexBlock.length
  };
}

function findExplicitSections(content, plugin) {
  const sections = [];
  const lines = content.split('\n');

  let currentSection = null;
  let currentDesc = null;
  let sectionStart = null;

  // Use plugin-specific patterns or fallback to TypeScript patterns
  const regionStart = plugin?.regionStart || /^\/\/#region\s+(.+?)(?:\s*[—\-]\s*(.+))?$/;
  const regionEnd = plugin?.regionEnd || /^\/\/#endregion/;
  const sectionMarker = plugin?.sectionMarker || /\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for region marker (language-specific)
    if (regionStart) {
      const regionMatch = line.match(regionStart);
      if (regionMatch) {
        // Close previous section
        if (currentSection) {
          sections.push({
            name: currentSection,
            line: sectionStart,
            end: lineNum - 1,
            desc: currentDesc || ''
          });
        }
        currentSection = regionMatch[1].trim();
        currentDesc = regionMatch[2]?.trim() || '';
        sectionStart = lineNum;
        continue;
      }
    }

    // Check for endregion (language-specific)
    if (regionEnd && line.match(regionEnd)) {
      if (currentSection) {
        sections.push({
          name: currentSection,
          line: sectionStart,
          end: lineNum,
          desc: currentDesc || ''
        });
        currentSection = null;
        currentDesc = null;
        sectionStart = null;
      }
      continue;
    }

    // Check for section marker (language-specific)
    if (sectionMarker) {
      const markerMatch = line.match(sectionMarker);
      if (markerMatch) {
        // Close previous section
        if (currentSection) {
          sections.push({
            name: currentSection,
            line: sectionStart,
            end: lineNum - 1,
            desc: currentDesc || ''
          });
        }
        currentSection = markerMatch[1].trim();
        currentDesc = '';
        sectionStart = lineNum;
      }
    }
  }

  // Close last section
  if (currentSection) {
    sections.push({
      name: currentSection,
      line: sectionStart,
      end: lines.length,
      desc: currentDesc || ''
    });
  }

  return sections;
}

function detectSectionsAuto(content, plugin) {
  const sections = [];
  const lines = content.split('\n');
  const patterns = plugin?.autoPatterns || [];

  // Track detected sections with their line numbers
  const detected = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const lineContent = lines[i];

    for (const { pattern, section, priority } of patterns) {
      if (pattern.test(lineContent)) {
        detected.push({ section, line: lineNum, priority: priority || 5 });
        break; // Only first match per line
      }
    }
  }

  // Group consecutive lines with same section
  let currentSection = null;
  let sectionStart = null;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const detection = detected.find(d => d.line === lineNum);

    if (detection) {
      if (currentSection && currentSection !== detection.section) {
        sections.push({
          name: currentSection,
          line: sectionStart,
          end: lineNum - 1
        });
      }
      if (currentSection !== detection.section) {
        currentSection = detection.section;
        sectionStart = lineNum;
      }
    }
  }

  // Close last section
  if (currentSection) {
    sections.push({
      name: currentSection,
      line: sectionStart,
      end: lines.length
    });
  }

  return sections;
}

function generateIndexBlock(sections, totalLines) {
  const now = new Date().toISOString();

  // Calculate max widths for alignment
  const maxNameLen = Math.max(20, ...sections.map(s => s.name.length));
  const maxDescLen = Math.max(20, ...sections.map(s => (s.desc || '').length));

  let table = '';
  table += ` * | ${'Section'.padEnd(maxNameLen)} | Line | End  | Size | ${'Description'.padEnd(maxDescLen)} |\n`;
  table += ` * | ${'-'.repeat(maxNameLen)} | ---- | ---- | ---- | ${'-'.repeat(maxDescLen)} |\n`;

  for (const section of sections) {
    const size = section.end - section.line + 1;
    const name = section.name.padEnd(maxNameLen);
    const line = String(section.line).padStart(4);
    const end = String(section.end).padStart(4);
    const sizeStr = String(size).padStart(4);
    const desc = (section.desc || '').padEnd(maxDescLen);
    table += ` * | ${name} | ${line} | ${end} | ${sizeStr} | ${desc} |\n`;
  }

  return `/**
 * @ai-index
 * @generated ${now}
 * @total-lines ${totalLines}
 *
${table} */`;
}

function insertIndex(content, indexBlock, existingIndex) {
  if (existingIndex) {
    // Replace existing index
    return content.slice(0, existingIndex.startIndex) +
           indexBlock +
           content.slice(existingIndex.endIndex);
  } else {
    // Insert at beginning (after shebang if present)
    const shebangMatch = content.match(/^#!.*\n/);
    if (shebangMatch) {
      return shebangMatch[0] + indexBlock + '\n\n' + content.slice(shebangMatch[0].length);
    }
    return indexBlock + '\n\n' + content;
  }
}

// ============================================
// Main Functions
// ============================================

async function indexFile(filePath, options = {}) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const totalLines = lines.length;

  // Check minimum lines
  if (options.minLines && totalLines < options.minLines) {
    console.log(`   ⏭️  ${basename(filePath)}: ${totalLines} lines (below threshold)`);
    return { skipped: true, reason: 'below-threshold' };
  }

  const plugin = getLanguagePlugin(filePath);
  if (!plugin) {
    console.log(`   ⚠️  ${basename(filePath)}: Unsupported file type`);
    return { skipped: true, reason: 'unsupported' };
  }

  const existingIndex = parseExistingIndex(content);

  // Find sections (using plugin-specific patterns)
  let sections = findExplicitSections(content, plugin);

  // If no explicit sections, try auto-detection
  if (sections.length === 0) {
    sections = detectSectionsAuto(content, plugin);
  }

  // If still no sections, create a single "main" section
  if (sections.length === 0) {
    sections = [{ name: 'main', line: 1, end: totalLines, desc: 'Main content' }];
  }

  // Add descriptions based on section names
  const descMap = {
    // Common
    'imports': 'External dependencies',
    'types': 'Type definitions',
    'config': 'Configuration',
    'main': 'Main content',
    'tests': 'Unit tests',
    // TypeScript/JavaScript
    'types/state': 'State interface',
    'types/actions': 'Action interfaces',
    'state/initial': 'Initial state',
    'store': 'State store',
    'selectors': 'State selectors',
    'hooks': 'React hooks',
    'debug': 'Debug utilities',
    // Python
    'classes': 'Class definitions',
    'models': 'Data models',
    'dataclasses': 'Dataclass definitions',
    'routes': 'API routes',
    'async': 'Async functions',
    // Rust
    'modules': 'Module declarations',
    'structs': 'Struct definitions',
    'enums': 'Enum definitions',
    'impl': 'Implementations',
    'functions': 'Function definitions',
    // Go
    'interfaces': 'Interface definitions',
    'methods': 'Method definitions',
    // C#/Java
    'namespace': 'Namespace declaration',
    'package': 'Package declaration',
  };

  for (const section of sections) {
    if (!section.desc) {
      section.desc = descMap[section.name] || '';
    }
  }

  // Generate index block
  const indexBlock = generateIndexBlock(sections, totalLines);

  // Insert or replace index
  const newContent = insertIndex(content, indexBlock, existingIndex);

  // Write file
  await writeFile(filePath, newContent);

  const action = existingIndex ? 'Updated' : 'Added';
  console.log(`   ✅ ${basename(filePath)}: ${action} index (${sections.length} sections, ${totalLines} lines)`);

  return {
    success: true,
    sections: sections.length,
    totalLines,
    action
  };
}

async function verifyIndex(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const existingIndex = parseExistingIndex(content);

  if (!existingIndex) {
    console.log(`   ❌ ${basename(filePath)}: No index found`);
    return { valid: false, reason: 'no-index' };
  }

  const plugin = getLanguagePlugin(filePath);
  const lines = content.split('\n');
  const errors = [];

  // Verify each section's line numbers
  for (const [name, section] of Object.entries(existingIndex.sections)) {
    if (section.line > lines.length || section.end > lines.length) {
      errors.push(`Section "${name}": line numbers exceed file length`);
    }
  }

  // Check for explicit markers and verify they match
  const explicitSections = findExplicitSections(content, plugin);
  for (const explicit of explicitSections) {
    const indexed = existingIndex.sections[explicit.name];
    if (!indexed) {
      errors.push(`Section "${explicit.name}" in code but not in index`);
    } else if (Math.abs(indexed.line - explicit.line) > 5) {
      errors.push(`Section "${explicit.name}": index says line ${indexed.line}, actual is ${explicit.line}`);
    }
  }

  if (errors.length > 0) {
    console.log(`   ⚠️  ${basename(filePath)}: ${errors.length} issue(s)`);
    for (const err of errors) {
      console.log(`      - ${err}`);
    }
    return { valid: false, errors };
  }

  console.log(`   ✅ ${basename(filePath)}: Index valid`);
  return { valid: true };
}

async function removeIndex(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const existingIndex = parseExistingIndex(content);

  if (!existingIndex) {
    console.log(`   ⏭️  ${basename(filePath)}: No index to remove`);
    return { removed: false };
  }

  const newContent = content.slice(0, existingIndex.startIndex) +
                     content.slice(existingIndex.endIndex).replace(/^\n+/, '');

  await writeFile(filePath, newContent);
  console.log(`   ✅ ${basename(filePath)}: Index removed`);
  return { removed: true };
}

// ============================================
// CLI
// ============================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
AI-Index v2.0: Universal file indexing for AI assistants

Supported languages:
  TypeScript, JavaScript, Python, Rust, Go, C#, Java, YAML, JSON

Usage:
  node scripts/ai-index.mjs <file> [options]

Options:
  --reindex        Update existing index (same as default)
  --verify         Check if index is valid and up-to-date
  --remove         Remove index from file
  --min-lines=N    Only index files with N+ lines (default: 0)
  --help, -h       Show this help

Region markers (language-specific):
  TypeScript/JS:  //#region name — Description
  Python:         # region: name — Description
  Rust/Go:        // region: name — Description
  C#:             #region name — Description

Examples:
  node scripts/ai-index.mjs src/stores/projectStore.ts
  node scripts/ai-index.mjs main.py --min-lines=200
  node scripts/ai-index.mjs src/lib.rs --verify
`);
    process.exit(0);
  }

  // Parse options
  const options = {
    verify: args.includes('--verify'),
    remove: args.includes('--remove'),
    minLines: parseInt(args.find(a => a.startsWith('--min-lines='))?.split('=')[1] || '0')
  };

  // Get file patterns (non-option arguments)
  const patterns = args.filter(a => !a.startsWith('--'));

  if (patterns.length === 0) {
    console.error('Error: No file pattern specified');
    process.exit(1);
  }

  console.log('\n📑 AI-Index\n');

  // Process file patterns (simple, no glob - just direct paths)
  let files = [];
  for (const pattern of patterns) {
    // Check if file exists
    if (existsSync(pattern)) {
      const fileStat = await stat(pattern);
      if (fileStat.isFile()) {
        files.push(pattern);
      }
    } else {
      console.log(`   ⚠️  File not found: ${pattern}`);
    }
  }

  // Remove duplicates
  files = [...new Set(files)];

  if (files.length === 0) {
    console.log('   No files matched the pattern(s)');
    process.exit(0);
  }

  console.log(`   Processing ${files.length} file(s)...\n`);

  // Process each file
  const results = { success: 0, skipped: 0, failed: 0 };

  for (const file of files) {
    try {
      if (options.verify) {
        const result = await verifyIndex(file);
        if (result.valid) results.success++;
        else results.failed++;
      } else if (options.remove) {
        const result = await removeIndex(file);
        if (result.removed) results.success++;
        else results.skipped++;
      } else {
        const result = await indexFile(file, options);
        if (result.skipped) results.skipped++;
        else if (result.success) results.success++;
        else results.failed++;
      }
    } catch (error) {
      console.log(`   ❌ ${basename(file)}: ${error.message}`);
      results.failed++;
    }
  }

  console.log(`\n   Done: ${results.success} success, ${results.skipped} skipped, ${results.failed} failed\n`);
}

main().catch(console.error);
