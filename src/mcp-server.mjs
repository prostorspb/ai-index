#!/usr/bin/env node
/**
 * AI-Index MCP Server v2.1
 *
 * Динамически генерирует индекс файла по запросу.
 * Не требует модификации исходных файлов.
 *
 * Поддержка companion markdown файлов:
 *   - filename.ai.md (рядом с файлом)
 *   - .ai/filename.md (в папке .ai)
 *
 * Инструменты:
 *   - get_file_index: Получить карту секций файла
 *   - read_section: Прочитать конкретную секцию
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile, access } from 'fs/promises';
import { extname, basename, dirname, join } from 'path';
import { constants } from 'fs';

// ============================================
// Language Detection
// ============================================

const LANGUAGE_CONFIG = {
  ts: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    commentStart: '//',
    blockStart: '/*',
    blockEnd: '*/',
    regionStart: /^\/\/#region\s+(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/#endregion/,
  },
  python: {
    extensions: ['.py', '.pyw', '.pyi'],
    commentStart: '#',
    regionStart: /^#\s*region\s*[:\s]*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^#\s*endregion/,
  },
  rust: {
    extensions: ['.rs'],
    commentStart: '//',
    regionStart: /^\/\/\s*region:\s*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/\s*endregion/,
  },
  go: {
    extensions: ['.go'],
    commentStart: '//',
    regionStart: /^\/\/\s*region:\s*(.+?)(?:\s*[—\-]\s*(.+))?$/,
    regionEnd: /^\/\/\s*endregion/,
  },
  csharp: {
    extensions: ['.cs'],
    commentStart: '//',
    regionStart: /^\s*#region\s+(.+?)$/,
    regionEnd: /^\s*#endregion/,
  },
  java: {
    extensions: ['.java', '.kt', '.scala'],
    commentStart: '//',
    regionStart: /^\/\/\s*region\s*(.+?)$/,
    regionEnd: /^\/\/\s*endregion/,
  },
  yaml: {
    extensions: ['.yaml', '.yml'],
    commentStart: '#',
    regionStart: /^#\s*region:\s*(.+?)$/,
    regionEnd: /^#\s*endregion/,
  }
};

function detectLanguage(filePath) {
  const ext = extname(filePath).toLowerCase();
  for (const [lang, config] of Object.entries(LANGUAGE_CONFIG)) {
    if (config.extensions.includes(ext)) {
      return { lang, ...config };
    }
  }
  return null;
}

// ============================================
// Companion Markdown Support
// ============================================

/**
 * Ищет companion markdown файл с описанием секций
 * Приоритет: filename.ai.md > .ai/filename.md
 */
async function findCompanionMarkdown(filePath) {
  const dir = dirname(filePath);
  const name = basename(filePath);

  // Варианты расположения
  const candidates = [
    join(dir, `${name}.ai.md`),           // file.ts.ai.md
    join(dir, '.ai', `${name}.md`),       // .ai/file.ts.md
    join(dir, '.ai', name.replace(/\.[^.]+$/, '.md')), // .ai/file.md
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch {
      // File doesn't exist, try next
    }
  }

  return null;
}

/**
 * Парсит companion markdown файл
 *
 * Формат:
 * ```markdown
 * # filename.ts
 *
 * Описание файла (опционально)
 *
 * ## Sections
 *
 * | Section | Lines | Description |
 * |---------|-------|-------------|
 * | imports | 1-45 | External dependencies |
 * | store/nodes | 180-350 | Node CRUD operations |
 *
 * ## Notes
 *
 * Дополнительные заметки...
 * ```
 */
async function parseCompanionMarkdown(mdPath) {
  try {
    const content = await readFile(mdPath, 'utf-8');
    const result = {
      description: '',
      sections: [],
      notes: ''
    };

    // Извлекаем описание (текст до первого ## заголовка)
    const descMatch = content.match(/^#[^#].*\n\n([\s\S]*?)(?=\n##|$)/);
    if (descMatch) {
      result.description = descMatch[1].trim();
    }

    // Парсим таблицу секций
    const tableMatch = content.match(/##\s*Sections?\s*\n\n([\s\S]*?)(?=\n##|$)/i);
    if (tableMatch) {
      const tableContent = tableMatch[1];
      // Парсим строки таблицы: | Section | Lines | Description |
      const rows = tableContent.matchAll(/\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/g);

      for (const row of rows) {
        const [, name, lines, desc] = row;
        // Пропускаем заголовок и разделитель
        if (name.includes('Section') || name.includes('---')) continue;

        // Парсим диапазон строк: "180-350" или "180"
        const lineMatch = lines.match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
        if (lineMatch) {
          result.sections.push({
            name: name.trim(),
            line: parseInt(lineMatch[1]),
            end: parseInt(lineMatch[2] || lineMatch[1]),
            desc: desc.trim()
          });
        }
      }
    }

    // Извлекаем заметки
    const notesMatch = content.match(/##\s*Notes?\s*\n\n([\s\S]*?)(?=\n##|$)/i);
    if (notesMatch) {
      result.notes = notesMatch[1].trim();
    }

    return result;
  } catch {
    return null;
  }
}

// ============================================
// Smart Section Detection
// ============================================

/**
 * Автоматически определяет секции без маркеров
 */
function detectSectionsAuto(lines, langConfig) {
  const sections = [];

  // Patterns for common code structures
  const patterns = {
    ts: [
      { regex: /^import\s+/, name: 'imports', desc: 'Import statements' },
      { regex: /^export\s+(interface|type)\s+(\w+)/, name: 'types', desc: 'Type definitions' },
      { regex: /^export\s+const\s+use\w+/, name: 'hooks', desc: 'React hooks' },
      { regex: /^export\s+(async\s+)?function\s+(\w+)/, name: 'functions', desc: 'Exported functions' },
      { regex: /^(export\s+)?class\s+(\w+)/, name: 'classes', desc: 'Class definitions' },
    ],
    python: [
      { regex: /^(from|import)\s+/, name: 'imports', desc: 'Import statements' },
      { regex: /^class\s+(\w+)/, name: 'classes', desc: 'Class definitions' },
      { regex: /^(async\s+)?def\s+(\w+)/, name: 'functions', desc: 'Function definitions' },
      { regex: /^@(app|router)\.(get|post|put|delete)/, name: 'routes', desc: 'API routes' },
    ],
    rust: [
      { regex: /^use\s+/, name: 'imports', desc: 'Use statements' },
      { regex: /^(pub\s+)?struct\s+(\w+)/, name: 'structs', desc: 'Struct definitions' },
      { regex: /^(pub\s+)?enum\s+(\w+)/, name: 'enums', desc: 'Enum definitions' },
      { regex: /^impl\s+/, name: 'impl', desc: 'Implementations' },
      { regex: /^(pub\s+)?(async\s+)?fn\s+(\w+)/, name: 'functions', desc: 'Functions' },
    ],
    go: [
      { regex: /^import\s*\(/, name: 'imports', desc: 'Import block' },
      { regex: /^type\s+(\w+)\s+struct/, name: 'types', desc: 'Struct types' },
      { regex: /^type\s+(\w+)\s+interface/, name: 'interfaces', desc: 'Interface types' },
      { regex: /^func\s+\(/, name: 'methods', desc: 'Methods' },
      { regex: /^func\s+(\w+)/, name: 'functions', desc: 'Functions' },
    ]
  };

  const langPatterns = patterns[langConfig?.lang] || [];
  let currentSection = null;
  let sectionStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { regex, name, desc } of langPatterns) {
      if (regex.test(line)) {
        // Close previous section
        if (currentSection && currentSection.name !== name) {
          currentSection.end = i;
          currentSection.size = currentSection.end - currentSection.line + 1;
          sections.push(currentSection);
        }

        // Start new section if different
        if (!currentSection || currentSection.name !== name) {
          currentSection = {
            name,
            desc,
            line: i + 1,
            end: i + 1,
            size: 1
          };
        } else {
          currentSection.end = i + 1;
          currentSection.size = currentSection.end - currentSection.line + 1;
        }
        break;
      }
    }
  }

  // Close last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Находит секции по явным маркерам #region
 */
function detectSectionsExplicit(lines, langConfig) {
  const sections = [];
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (langConfig?.regionStart) {
      const match = line.match(langConfig.regionStart);
      if (match) {
        if (currentSection) {
          currentSection.end = lineNum - 1;
          currentSection.size = currentSection.end - currentSection.line + 1;
          sections.push(currentSection);
        }
        currentSection = {
          name: match[1].trim(),
          desc: match[2]?.trim() || '',
          line: lineNum,
          end: lineNum,
          size: 1
        };
        continue;
      }
    }

    if (langConfig?.regionEnd && line.match(langConfig.regionEnd)) {
      if (currentSection) {
        currentSection.end = lineNum;
        currentSection.size = currentSection.end - currentSection.line + 1;
        sections.push(currentSection);
        currentSection = null;
      }
    }
  }

  if (currentSection) {
    currentSection.end = lines.length;
    currentSection.size = currentSection.end - currentSection.line + 1;
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Генерирует полный индекс файла
 *
 * Приоритет источников:
 * 1. Companion markdown файл (filename.ai.md или .ai/filename.md)
 * 2. Явные маркеры #region в коде
 * 3. Автоматическое определение по паттернам
 */
async function generateIndex(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const langConfig = detectLanguage(filePath);

  let sections = [];
  let source = 'auto';
  let description = '';
  let notes = '';
  let companionPath = null;

  // 1. Пробуем найти companion markdown
  companionPath = await findCompanionMarkdown(filePath);
  if (companionPath) {
    const companion = await parseCompanionMarkdown(companionPath);
    if (companion && companion.sections.length > 0) {
      sections = companion.sections.map(s => ({
        ...s,
        size: s.end - s.line + 1
      }));
      source = 'markdown';
      description = companion.description;
      notes = companion.notes;
    }
  }

  // 2. Если нет markdown, пробуем явные маркеры #region
  if (sections.length === 0) {
    sections = detectSectionsExplicit(lines, langConfig);
    if (sections.length > 0) {
      source = 'regions';
    }
  }

  // 3. Если нет регионов, автоопределение
  if (sections.length === 0) {
    sections = detectSectionsAuto(lines, langConfig);
    source = 'auto';
  }

  // 4. Если ничего не нашли, создаём одну секцию "main"
  if (sections.length === 0) {
    sections = [{
      name: 'main',
      desc: 'Main content',
      line: 1,
      end: lines.length,
      size: lines.length
    }];
  }

  const result = {
    file: basename(filePath),
    path: filePath,
    language: langConfig?.lang || 'unknown',
    totalLines: lines.length,
    source, // 'markdown' | 'regions' | 'auto'
    sections
  };

  // Добавляем метаданные из companion markdown
  if (description) result.description = description;
  if (notes) result.notes = notes;
  if (companionPath) result.companionFile = companionPath;

  return result;
}

/**
 * Читает конкретную секцию файла
 */
async function readSection(filePath, sectionName) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const index = await generateIndex(filePath);

  const section = index.sections.find(s => s.name === sectionName);
  if (!section) {
    return {
      error: `Section "${sectionName}" not found`,
      availableSections: index.sections.map(s => s.name)
    };
  }

  const sectionLines = lines.slice(section.line - 1, section.end);

  return {
    section: section.name,
    lineStart: section.line,
    lineEnd: section.end,
    content: sectionLines.join('\n')
  };
}

// ============================================
// MCP Server
// ============================================

const server = new Server(
  { name: 'ai-index', version: '2.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'get_file_index',
      description: 'Get section index of a file. Returns list of sections with line numbers. Use before reading large files to find relevant sections.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path to the file to index'
          }
        },
        required: ['file_path']
      }
    },
    {
      name: 'read_section',
      description: 'Read a specific section of a file by name. More efficient than reading the entire file.',
      inputSchema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Path to the file'
          },
          section_name: {
            type: 'string',
            description: 'Name of the section to read'
          }
        },
        required: ['file_path', 'section_name']
      }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'get_file_index') {
      const index = await generateIndex(args.file_path);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(index, null, 2)
        }]
      };
    }

    if (name === 'read_section') {
      const result = await readSection(args.file_path, args.section_name);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
