/**
 * TSDoc Coverage Measurement Tool
 *
 * Provides standardized metrics for documentation coverage:
 * - Symbol-level: Each exported function/class/interface requires TSDoc
 * - File-level: Any TSDoc presence in file (existing lenient metric)
 * - API-level: Only public API symbols (excludes internals/test-utils)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as glob from 'glob';

interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable';
  hasTSDoc: boolean;
  filePath: string;
  line: number;
  isPublicAPI: boolean;
}

interface FileMetrics {
  filePath: string;
  totalSymbols: number;
  documentedSymbols: number;
  hasAnyTSDoc: boolean;
  coverage: number;
}

interface CoverageReport {
  symbolLevel: {
    total: number;
    documented: number;
    coverage: number;
    byKind: Record<string, { total: number; documented: number; coverage: number }>;
  };
  fileLevel: {
    totalFiles: number;
    filesWithAnyTSDoc: number;
    coverage: number;
  };
  apiLevel: {
    total: number;
    documented: number;
    coverage: number;
  };
  files: FileMetrics[];
  undocumentedSymbols: SymbolInfo[];
}

/**
 * Extract exported symbols from TypeScript source code
 */
function extractSymbols(source: string, filePath: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const lines = source.split('\n');

  // Patterns for different export types
  const patterns = {
    function: /^export\s+(?:async\s+)?function\s+(\w+)/,
    class: /^export\s+(?:abstract\s+)?class\s+(\w+)/,
    interface: /^export\s+interface\s+(\w+)/,
    type: /^export\s+(?:type|alias)\s+(\w+)/,
    enum: /^export\s+enum\s+(\w+)/,
    variable: /^export\s+(?:const|let|var)\s+(\w+)/,
  };

  let nextSymbolHasDoc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for TSDoc comment
    if (trimmed.startsWith('/**')) {
      nextSymbolHasDoc = true;
      continue;
    }

    // Check for export statements
    for (const [kind, pattern] of Object.entries(patterns)) {
      const match = trimmed.match(pattern);
      if (match) {
        const isPublicAPI =
          !filePath.includes('/test-utils/') &&
          !filePath.includes('/internal/') &&
          !filePath.includes('/mocks/') &&
          !filePath.includes('.test.ts');

        symbols.push({
          name: match[1],
          kind: kind as SymbolInfo['kind'],
          hasTSDoc: nextSymbolHasDoc,
          filePath: path.relative(process.cwd(), filePath),
          line: i + 1,
          isPublicAPI,
        });

        nextSymbolHasDoc = false;
        break;
      }
    }

    // Reset TSDoc flag if we hit a non-comment, non-export line
    if (!trimmed.startsWith('*') && !trimmed.startsWith('//') && trimmed !== '') {
      if (!trimmed.match(/^export/)) {
        nextSymbolHasDoc = false;
      }
    }
  }

  return symbols;
}

/**
 * Measure documentation coverage across the codebase
 */
export function measureDocCoverage(
  srcDir: string = 'src',
  excludePatterns: string[] = ['**/*.test.ts', '**/test-utils/**', '**/mocks/**']
): CoverageReport {
  const pattern = path.join(srcDir, '**/*.ts').replace(/\\/g, '/');
  const files = glob.sync(pattern, {
    ignore: excludePatterns,
  });

  const allSymbols: SymbolInfo[] = [];
  const fileMetrics: FileMetrics[] = [];
  let filesWithAnyTSDoc = 0;

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf-8');
    const symbols = extractSymbols(source, filePath);

    if (symbols.length === 0) continue;

    const documentedSymbols = symbols.filter(s => s.hasTSDoc).length;
    const hasAnyTSDoc = symbols.some(s => s.hasTSDoc);

    if (hasAnyTSDoc) filesWithAnyTSDoc++;

    fileMetrics.push({
      filePath: path.relative(process.cwd(), filePath),
      totalSymbols: symbols.length,
      documentedSymbols,
      hasAnyTSDoc,
      coverage: (documentedSymbols / symbols.length) * 100,
    });

    allSymbols.push(...symbols);
  }

  // Calculate symbol-level metrics
  const symbolLevel = {
    total: allSymbols.length,
    documented: allSymbols.filter(s => s.hasTSDoc).length,
    coverage: 0,
    byKind: {} as Record<string, { total: number; documented: number; coverage: number }>,
  };
  symbolLevel.coverage = (symbolLevel.documented / symbolLevel.total) * 100;

  // Group by kind
  for (const symbol of allSymbols) {
    if (!symbolLevel.byKind[symbol.kind]) {
      symbolLevel.byKind[symbol.kind] = { total: 0, documented: 0, coverage: 0 };
    }
    symbolLevel.byKind[symbol.kind].total++;
    if (symbol.hasTSDoc) symbolLevel.byKind[symbol.kind].documented++;
  }

  for (const kind in symbolLevel.byKind) {
    const metrics = symbolLevel.byKind[kind];
    metrics.coverage = (metrics.documented / metrics.total) * 100;
  }

  // Calculate API-level metrics (public API only)
  const publicSymbols = allSymbols.filter(s => s.isPublicAPI);
  const apiLevel = {
    total: publicSymbols.length,
    documented: publicSymbols.filter(s => s.hasTSDoc).length,
    coverage: (publicSymbols.filter(s => s.hasTSDoc).length / publicSymbols.length) * 100,
  };

  // Calculate file-level metrics
  const fileLevel = {
    totalFiles: fileMetrics.length,
    filesWithAnyTSDoc,
    coverage: (filesWithAnyTSDoc / fileMetrics.length) * 100,
  };

  // Get undocumented symbols (prioritize public API)
  const undocumentedSymbols = allSymbols
    .filter(s => !s.hasTSDoc)
    .sort((a, b) => (a.isPublicAPI === b.isPublicAPI ? 0 : a.isPublicAPI ? -1 : 1));

  return {
    symbolLevel,
    fileLevel,
    apiLevel,
    files: fileMetrics.sort((a, b) => a.coverage - b.coverage),
    undocumentedSymbols,
  };
}

/**
 * Print coverage report to console
 */
export function printCoverageReport(report: CoverageReport): void {
  console.log('\n📊 TSDoc Coverage Report\n');

  // Symbol-level (primary metric)
  console.log('🎯 Symbol-Level Coverage (PRIMARY METRIC)');
  console.log('   ──────────────────────────────────────');
  console.log(`   Total Symbols:     ${report.symbolLevel.total}`);
  console.log(`   Documented:        ${report.symbolLevel.documented}`);
  console.log(`   Coverage:          ${report.symbolLevel.coverage.toFixed(1)}%\n`);

  console.log('   By Symbol Kind:');
  for (const [kind, metrics] of Object.entries(report.symbolLevel.byKind)) {
    console.log(
      `     ${kind.padEnd(12)} ${metrics.documented}/${metrics.total} (${metrics.coverage.toFixed(1)}%)`
    );
  }

  // API-level (public API only)
  console.log('\n📦 API-Level Coverage (PUBLIC API ONLY)');
  console.log('   ──────────────────────────────────────');
  console.log(`   Total API Symbols: ${report.apiLevel.total}`);
  console.log(`   Documented:        ${report.apiLevel.documented}`);
  console.log(`   Coverage:          ${report.apiLevel.coverage.toFixed(1)}%\n`);

  // File-level (legacy metric for comparison)
  console.log('📁 File-Level Coverage (LEGACY METRIC)');
  console.log('   ──────────────────────────────────────');
  console.log(`   Total Files:       ${report.fileLevel.totalFiles}`);
  console.log(`   Files with TSDoc:  ${report.fileLevel.filesWithAnyTSDoc}`);
  console.log(`   Coverage:          ${report.fileLevel.coverage.toFixed(1)}%\n`);

  // Lowest coverage files
  console.log('🔻 Lowest Coverage Files (Top 10):');
  report.files.slice(0, 10).forEach((file, i) => {
    const bar =
      '█'.repeat(Math.floor(file.coverage / 5)) + '░'.repeat(20 - Math.floor(file.coverage / 5));
    console.log(`   ${i + 1}. ${file.filePath}`);
    console.log(
      `      ${file.documentedSymbols}/${file.totalSymbols} [${bar}] ${file.coverage.toFixed(0)}%`
    );
  });

  // Undocumented public API symbols
  const undocumentedPublic = report.undocumentedSymbols.filter(s => s.isPublicAPI).slice(0, 20);
  if (undocumentedPublic.length > 0) {
    console.log('\n⚠️  Undocumented Public API Symbols (Top 20):');
    undocumentedPublic.forEach(symbol => {
      console.log(`   • ${symbol.kind}: ${symbol.name} (${symbol.filePath}:${symbol.line})`);
    });
  }

  // Quality assessment
  console.log('\n📈 Quality Assessment:');
  const apiCoverage = report.apiLevel.coverage;
  if (apiCoverage >= 90) {
    console.log('   ✅ Excellent - API documentation exceeds 90%');
  } else if (apiCoverage >= 80) {
    console.log('   ✔️  Good - API documentation meets 80% threshold');
  } else if (apiCoverage >= 70) {
    console.log('   ⚠️  Fair - API documentation below 80%, improvement needed');
  } else {
    console.log('   ❌ Poor - API documentation critically low, immediate action required');
  }

  // Measurement gap warning
  const gap = report.fileLevel.coverage - report.symbolLevel.coverage;
  if (gap > 10) {
    console.log(
      `\n⚠️  Measurement Gap Warning: File-level (${report.fileLevel.coverage.toFixed(1)}%) ` +
        `is ${gap.toFixed(1)}% higher than symbol-level (${report.symbolLevel.coverage.toFixed(1)}%). ` +
        'This indicates partial documentation coverage.'
    );
  }
}

// CLI entry point
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;

if (isMainModule) {
  const report = measureDocCoverage();
  printCoverageReport(report);

  // Exit with error code if coverage is below threshold
  const API_COVERAGE_THRESHOLD = 80;
  if (report.apiLevel.coverage < API_COVERAGE_THRESHOLD) {
    process.exit(1);
  }
}
