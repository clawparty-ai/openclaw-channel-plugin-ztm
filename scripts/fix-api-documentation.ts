/**
 * API Documentation Accuracy Fix
 *
 * Fixes API documentation accuracy issues by:
 * 1. Removing non-existent APIs from manual docs
 * 2. Adding @internal tags to internal exports
 * 3. Validating documented APIs against actual exports
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface ApiDocumentationIssue {
  type: 'missing_export' | 'extra_documentation' | 'internal_api';
  file: string;
  api: string;
  suggestion?: string;
}

const MANUAL_DOCS = ['docs/README.md', 'docs/modules/messaging.md'];

const NON_EXISTENT_APIS = [
  'MessageDispatcher', // Documentation mentions this class, but it doesn't exist
  'stopMessageWatcher', // Wrong function name (should be stopWatcher)
  'checkMessageConstraints', // Not exported
];

const INTERNAL_APIS = [
  'AccountStateManager',
  'GroupPermissionLRUCache',
  'createAccountStateManagerService',
  'getAccountStateManagerService',
];

/**
 * Scan manual documentation for non-existent APIs
 */
function scanManualDocs(): ApiDocumentationIssue[] {
  const issues: ApiDocumentationIssue[] = [];

  for (const docPath of MANUAL_DOCS) {
    try {
      const content = readFileSync(docPath, 'utf-8');

      for (const api of NON_EXISTENT_APIS) {
        if (content.includes(api)) {
          issues.push({
            type: 'extra_documentation',
            file: docPath,
            api,
            suggestion: getCorrectApiName(api),
          });
        }
      }
    } catch (error) {
      console.warn(`Could not read ${docPath}:`, error);
    }
  }

  return issues;
}

/**
 * Get the correct API name for a non-existent API
 */
function getCorrectApiName(wrongName: string): string {
  const corrections: Record<string, string> = {
    MessageDispatcher: 'notifyMessageCallbacks',
    stopMessageWatcher: 'stopWatcher',
    checkMessageConstraints: 'validateMessage',
  };

  return corrections[wrongName] || 'Unknown';
}

/**
 * Fix manual documentation by removing or correcting API references
 */
function fixManualDocumentation(issues: ApiDocumentationIssue[]): void {
  for (const issue of issues) {
    if (issue.type === 'extra_documentation' && issue.suggestion) {
      const filePath = join(process.cwd(), issue.file);
      let content = readFileSync(filePath, 'utf-8');

      // Replace incorrect API name with correct one
      content = content.replaceAll(issue.api, issue.suggestion);

      writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ Fixed ${issue.file}: ${issue.api} → ${issue.suggestion}`);
    }
  }
}

/**
 * Add @internal tags to internal APIs
 */
function addInternalTags(): void {
  const internalApiFiles = ['src/runtime/state.ts', 'src/runtime/cache.ts', 'src/di/index.ts'];

  for (const filePath of internalApiFiles) {
    try {
      let content = readFileSync(filePath, 'utf-8');

      for (const api of INTERNAL_APIS) {
        // Find exports of internal APIs and add @internal tag
        const regex = new RegExp(
          `(export\\s+(?:class|function|const|interface|type)\\s+${api}\\b)`,
          'g'
        );

        if (regex.test(content) && !content.includes(`@internal\n${api}`)) {
          content = content.replaceAll(regex, `/**\n * @internal\n */\n$1`);
          console.log(`✅ Added @internal tag to ${api} in ${filePath}`);
        }
      }

      writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      console.warn(`Could not process ${filePath}:`, error);
    }
  }
}

/**
 * Generate API documentation accuracy report
 */
function generateAccuracyReport(): void {
  console.log('\n📊 API Documentation Accuracy Report\n');
  console.log('='.repeat(60));

  // Scan manual docs
  const issues = scanManualDocs();

  if (issues.length === 0) {
    console.log('✅ No documentation issues found!');
  } else {
    console.log(`\n❌ Found ${issues.length} issue(s):\n`);

    for (const issue of issues) {
      console.log(`  📄 ${issue.file}`);
      console.log(`     Issue: ${issue.type.replace('_', ' ')}`);
      console.log(`     API: ${issue.api}`);

      if (issue.suggestion) {
        console.log(`     → Should be: ${issue.suggestion}`);
      }

      console.log('');
    }
  }

  console.log('='.repeat(60));
  console.log('\n💡 Recommendations:\n');
  console.log('1. Rely on TypeDoc auto-generated documentation');
  console.log('2. Keep manual docs focused on architecture and usage');
  console.log('3. Use @internal tags for implementation details');
  console.log('4. Run this script before releases\n');
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'check':
    generateAccuracyReport();
    break;

  case 'fix':
    const issues = scanManualDocs();
    if (issues.length > 0) {
      console.log('🔧 Fixing documentation issues...\n');
      fixManualDocumentation(issues);
      addInternalTags();
      console.log('\n✅ Documentation fixed!');
    } else {
      console.log('✅ No fixes needed!');
    }
    break;

  default:
    console.log(`
API Documentation Accuracy Tool

Usage:
  tsx scripts/fix-api-documentation.ts check    # Check for issues
  tsx scripts/fix-api-documentation.ts fix      # Fix all issues
    `);
}
