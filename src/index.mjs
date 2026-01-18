/**
 * AI-Index v2.0: Universal file indexing for AI assistants
 *
 * @module @physcode/ai-index
 */

import { readFile, writeFile } from 'fs/promises';
import { extname } from 'path';

// ============================================
// Language Plugins Configuration
// ============================================

export const LANGUAGE_PLUGINS = {
  ts: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    indexFormat: 'jsdoc',
    regionStart: /^\/\/#region\s+(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/#endregion/,
    sectionMarker: /\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
  },
  python: {
    extensions: ['.py', '.pyw', '.pyi'],
    indexFormat: 'docstring',
    regionStart: /^#\s*region\s*[:\s]*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^#\s*endregion/,
    sectionMarker: /^#\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
  },
  rust: {
    extensions: ['.rs'],
    indexFormat: 'doc-comment',
    regionStart: /^\/\/\s*region:\s*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/\s*endregion/,
    sectionMarker: /^\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
  },
  go: {
    extensions: ['.go'],
    indexFormat: 'block-comment',
    regionStart: /^\/\/\s*region:\s*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/\s*endregion/,
    sectionMarker: /^\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
  },
  csharp: {
    extensions: ['.cs'],
    indexFormat: 'xml-doc',
    regionStart: /^\s*#region\s+(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\s*#endregion/,
    sectionMarker: /\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
  },
  java: {
    extensions: ['.java'],
    indexFormat: 'javadoc',
    regionStart: /^\/\/\s*region\s*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/\s*endregion/,
    sectionMarker: /\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
  },
  yaml: {
    extensions: ['.yaml', '.yml'],
    indexFormat: 'comment',
    regionStart: /^#\s*region:\s*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^#\s*endregion/,
    sectionMarker: /^#\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i,
  },
  json: {
    extensions: ['.json', '.json5', '.jsonc'],
    indexFormat: 'key',
    regionStart: null,
    regionEnd: null,
    sectionMarker: /"__section__(\w+)__"/,
  }
};

/**
 * Get language plugin for a file
 */
export function getLanguagePlugin(filePath) {
  const ext = extname(filePath).toLowerCase();
  for (const [name, plugin] of Object.entries(LANGUAGE_PLUGINS)) {
    if (plugin.extensions.includes(ext)) {
      return { name, ...plugin };
    }
  }
  return null;
}

/**
 * Parse existing AI-Index from file content
 */
export function parseIndex(content) {
  const indexMatch = content.match(/\/\*\*\s*\n\s*\*\s*@ai-index[\s\S]*?\*\//);
  if (!indexMatch) return null;

  const indexBlock = indexMatch[0];
  const sections = {};

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

/**
 * Find explicit section markers in content
 */
export function findSections(content, plugin) {
  const sections = [];
  const lines = content.split('\n');

  let currentSection = null;
  let currentDesc = null;
  let sectionStart = null;

  const regionStart = plugin?.regionStart || /^\/\/#region\s+(.+?)(?:\s*[—\-]\s*(.+))?$/;
  const regionEnd = plugin?.regionEnd || /^\/\/#endregion/;
  const sectionMarker = plugin?.sectionMarker || /\/\/\s*(?:={3,}\s*)?SECTION:\s*(.+?)(?:\s*={3,})?\s*$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (regionStart) {
      const regionMatch = line.match(regionStart);
      if (regionMatch) {
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

    if (sectionMarker) {
      const markerMatch = line.match(sectionMarker);
      if (markerMatch) {
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

/**
 * Generate index block from sections
 */
export function generateIndex(sections, totalLines) {
  const now = new Date().toISOString();

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

/**
 * Index a file and return the new content
 */
export async function indexFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const plugin = getLanguagePlugin(filePath);

  if (!plugin) {
    throw new Error(`Unsupported file type: ${filePath}`);
  }

  const lines = content.split('\n');
  const totalLines = lines.length;
  const existingIndex = parseIndex(content);

  let sections = findSections(content, plugin);

  if (sections.length === 0) {
    sections = [{ name: 'main', line: 1, end: totalLines, desc: 'Main content' }];
  }

  const indexBlock = generateIndex(sections, totalLines);

  let newContent;
  if (existingIndex) {
    newContent = content.slice(0, existingIndex.startIndex) +
                 indexBlock +
                 content.slice(existingIndex.endIndex);
  } else {
    const shebangMatch = content.match(/^#!.*\n/);
    if (shebangMatch) {
      newContent = shebangMatch[0] + indexBlock + '\n\n' + content.slice(shebangMatch[0].length);
    } else {
      newContent = indexBlock + '\n\n' + content;
    }
  }

  await writeFile(filePath, newContent);

  return {
    sections: sections.length,
    totalLines,
    action: existingIndex ? 'updated' : 'added'
  };
}

export default {
  LANGUAGE_PLUGINS,
  getLanguagePlugin,
  parseIndex,
  findSections,
  generateIndex,
  indexFile
};
