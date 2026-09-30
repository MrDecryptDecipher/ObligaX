#!/usr/bin/env node

/**
 * ObligaX Software Bill of Materials (SBOM) Generator
 * Produces CycloneDX-compliant JSON SBOM for software supply chain security
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pkgPath = path.resolve(__dirname, '../package.json');
const lockPath = path.resolve(__dirname, '../package-lock.json');
const manifestPath = path.resolve(__dirname, '../package-manifest.json');
const outputPath = path.resolve(__dirname, '../sbom.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : { packages: {} };
const damlManifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;

const components = [];

// Add DAML DAR Component
if (damlManifest) {
  components.push({
    type: 'application',
    'bom-ref': `daml-dar:${damlManifest.packageId}`,
    name: 'ObligaX DAML Models',
    version: damlManifest.version,
    description: 'Privacy-preserving DAML smart contracts for bilateral netting and settlement',
    hashes: [
      {
        alg: 'SHA-256',
        content: damlManifest.darSha256
      }
    ],
    properties: [
      { name: 'canton:packageId', value: damlManifest.packageId },
      { name: 'canton:approver', value: damlManifest.approver }
    ]
  });
}

// Add npm dependencies
const packages = lock.packages || {};
for (const [pkgDir, pkgInfo] of Object.entries(packages)) {
  if (!pkgDir || pkgDir === '') continue; // Skip root project
  const name = pkgDir.replace(/^node_modules\//, '');
  if (!pkgInfo.version) continue;

  const purl = `pkg:npm/${name}@${pkgInfo.version}`;
  const component = {
    type: 'library',
    'bom-ref': purl,
    name,
    version: pkgInfo.version,
    purl
  };

  if (pkgInfo.integrity) {
    const parts = pkgInfo.integrity.split('-');
    if (parts.length === 2) {
      component.hashes = [
        {
          alg: parts[0].toUpperCase(),
          content: parts[1]
        }
      ];
    }
  }

  components.push(component);
}

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [
      {
        vendor: 'ObligaX',
        name: 'ObligaX SBOM Generator',
        version: '0.1.0'
      }
    ],
    component: {
      type: 'application',
      'bom-ref': `pkg:npm/obligax@${pkg.version}`,
      name: pkg.name,
      version: pkg.version,
      description: pkg.description
    }
  },
  components
};

fs.writeFileSync(outputPath, JSON.stringify(sbom, null, 2), 'utf8');
console.log(`[SBOM] Successfully generated CycloneDX SBOM with ${components.length} components at: ${outputPath}`);
