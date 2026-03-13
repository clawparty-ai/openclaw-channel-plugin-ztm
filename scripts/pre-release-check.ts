#!/usr/bin/env tsx
/**
 * Pre-Release Checklist Verification
 *
 * Runs all necessary checks before releasing:
 * 1. TypeScript compilation
 * 2. ESLint validation
 * 3. Test suite
 * 4. Build verification
 * 5. API documentation accuracy
 * 6. TSDoc coverage
 *
 * Usage:
 *   npm run pre:release
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface CheckResult {
  name: string;
  passed: boolean;
  duration: number;
  output?: string;
}

const CHECKS = [
  {
    name: 'TypeScript Type Check',
    command: 'npm run typecheck',
    critical: true,
  },
  {
    name: 'ESLint Validation',
    command: 'npm run lint',
    critical: true,
  },
  {
    name: 'Test Suite',
    command: 'npm test',
    critical: true,
  },
  {
    name: 'Build Verification',
    command: 'npm run build',
    critical: true,
  },
  {
    name: 'API Documentation Accuracy',
    command: 'npm run docs:api:check',
    critical: true,
  },
  {
    name: 'TSDoc Coverage',
    command: 'npm run docs:coverage:check',
    critical: false,
  },
];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function runCheck(name: string, command: string): CheckResult {
  const startTime = Date.now();

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    return {
      name,
      passed: true,
      duration: Date.now() - startTime,
      output: output.slice(0, 200),
    };
  } catch (error: any) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      output: error.stdout?.slice(0, 200) || error.message,
    };
  }
}

function printHeader(): void {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 Pre-Release Checklist Verification');
  console.log('='.repeat(70) + '\n');
}

function printResult(result: CheckResult, index: number): void {
  const status = result.passed ? '✅ PASS' : '❌ FAIL';
  const duration = formatDuration(result.duration);

  console.log(`${index + 1}. ${result.name}`);
  console.log(`   ${status}  ${duration}`);

  if (!result.passed && result.output) {
    console.log(`   ✗  Output: ${result.output.split('\n')[0]}...`);
  }

  console.log('');
}

function printSummary(results: CheckResult[]): void {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(0);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('─'.repeat(70));
  console.log(`📊 Summary: ${passed}/${total} checks passed (${percentage}%)`);
  console.log(`⏱️  Total duration: ${formatDuration(totalDuration)}`);

  if (passed === total) {
    console.log('\n🎉 All checks passed! Ready for release.\n');
  } else {
    const failed = results.filter(r => !r.passed);
    console.log('\n❌ Failed checks:');
    failed.forEach(r => {
      console.log(`   • ${r.name}`);
    });
    console.log('\n⚠️  Please fix the failed checks before releasing.\n');
  }

  console.log('='.repeat(70) + '\n');
}

function checkPackageVersion(): void {
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    console.log(`📦 Package version: ${pkg.version}`);
    console.log(`📦 Package name: ${pkg.name}\n`);
  } catch {
    console.log('⚠️  Warning: Could not read package.json\n');
  }
}

// Main execution
function main(): void {
  printHeader();

  // Pre-flight checks
  checkPackageVersion();

  // Run all checks
  const results: CheckResult[] = [];

  for (const check of CHECKS) {
    const result = runCheck(check.name, check.command);
    results.push(result);

    printResult(result, results.length - 1);

    // Fail fast on critical check failure
    if (!result.passed && check.critical) {
      console.log('🛑 Critical check failed. Stopping.\n');
      break;
    }
  }

  // Print summary
  printSummary(results);

  // Exit with appropriate code
  const allPassed = results.every(r => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main();
