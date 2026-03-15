#!/usr/bin/env tsx
/**
 * Update openclaw.plugin.json Version
 *
 * Updates the version field in openclaw.plugin.json to match the package.json version.
 * This ensures plugin manifest stays synchronized with npm package version.
 *
 * Usage:
 *   npm run version:plugin          # Sync with package.json
 *   npm run version:plugin 1.2.3    # Set specific version
 *
 * Exit codes:
 *   0 - Version updated successfully
 *   1 - Error updating version
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface PluginManifest {
  version: string;
  [key: string]: unknown;
}

interface PackageJson {
  version: string;
  [key: string]: unknown;
}

/**
 * Validates semantic version format (YYYY.M.D or semver)
 */
function isValidVersion(version: string): boolean {
  // Supports: YYYY.M.D (2026.3.15) or semver (1.2.3)
  const semverRegex = /^\d+\.\d+\.\d+$/;
  return semverRegex.test(version);
}

/**
 * Updates the version in openclaw.plugin.json
 */
function updatePluginVersion(newVersion: string): void {
  const pluginPath = join(process.cwd(), 'openclaw.plugin.json');

  // Read current manifest
  let manifest: PluginManifest;
  try {
    const content = readFileSync(pluginPath, 'utf-8');
    manifest = JSON.parse(content);
  } catch (error: any) {
    console.error(`❌ Error reading openclaw.plugin.json: ${error.message}`);
    process.exit(1);
  }

  const oldVersion = manifest.version;
  console.log(`📄 openclaw.plugin.json`);
  console.log(`   Current version: ${oldVersion}`);
  console.log(`   New version:      ${newVersion}`);

  // Update version
  manifest.version = newVersion;

  // Write back with proper formatting
  try {
    writeFileSync(pluginPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  } catch (error: any) {
    console.error(`❌ Error writing openclaw.plugin.json: ${error.message}`);
    process.exit(1);
  }

  console.log(`✅ Version updated successfully!\n`);
}

/**
 * Gets version from package.json
 */
function getPackageVersion(): string {
  const pkgPath = join(process.cwd(), 'package.json');

  try {
    const content = readFileSync(pkgPath, 'utf-8');
    const pkg: PackageJson = JSON.parse(content);
    return pkg.version;
  } catch (error: any) {
    console.error(`❌ Error reading package.json: ${error.message}`);
    process.exit(1);
  }
}

// Main execution
function main(): void {
  console.log('\n' + '='.repeat(60));
  console.log('🔧 Update openclaw.plugin.json Version');
  console.log('='.repeat(60) + '\n');

  let targetVersion: string;

  // Parse command line arguments
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // No version specified, sync with package.json
    targetVersion = getPackageVersion();
    console.log(`📦 Syncing with package.json version: ${targetVersion}\n`);
  } else {
    // Specific version provided
    targetVersion = args[0];
    console.log(`🎯 Setting specific version: ${targetVersion}\n`);

    if (!isValidVersion(targetVersion)) {
      console.error(`❌ Invalid version format: ${targetVersion}`);
      console.error('   Expected format: X.Y.Z (e.g., 2026.3.15 or 1.2.3)\n');
      process.exit(1);
    }
  }

  // Update the version
  updatePluginVersion(targetVersion);

  console.log('='.repeat(60) + '\n');
}

main();
