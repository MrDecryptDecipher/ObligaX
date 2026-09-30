import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CantonAdminClient } from './canton-admin-client';
import { CantonPackageDetails } from '../../types/canton.types';

export interface PackageManifest {
  name: string;
  version: string;
  packageId: string;
  darSha256: string;
  compilerVersion: string;
  buildCommit: string;
  dependencies: string[];
  modules: string[];
  deploymentTimestamp: string;
  approver: string;
  vettedParties: string[];
}

export class CantonPackageService {
  private manifest: PackageManifest | null = null;

  constructor(
    private readonly adminClient: CantonAdminClient,
    private readonly manifestPath: string = path.resolve(process.cwd(), 'package-manifest.json')
  ) {
    this.loadManifest();
  }

  public loadManifest(): PackageManifest {
    if (fs.existsSync(this.manifestPath)) {
      const raw = fs.readFileSync(this.manifestPath, 'utf8');
      this.manifest = JSON.parse(raw) as PackageManifest;
      return this.manifest;
    }
    throw new Error(`Package manifest not found at ${this.manifestPath}`);
  }

  public getManifest(): PackageManifest {
    if (!this.manifest) {
      return this.loadManifest();
    }
    return this.manifest;
  }

  /**
   * Verify integrity of a local DAR file against manifest SHA-256
   */
  public verifyDarIntegrity(darBuffer: Buffer): { valid: boolean; actualSha256: string; expectedSha256: string } {
    const manifest = this.getManifest();
    const actualSha256 = crypto.createHash('sha256').update(darBuffer).digest('hex');
    const valid = actualSha256.toLowerCase() === manifest.darSha256.toLowerCase();
    return {
      valid,
      actualSha256,
      expectedSha256: manifest.darSha256
    };
  }

  /**
   * Deploy DAR to participant node and vet for synchronizer connectivity
   */
  public async deployAndVetDar(darBuffer: Buffer, synchronizerId?: string): Promise<{ packageId: string; vetted: boolean }> {
    const verification = this.verifyDarIntegrity(darBuffer);
    if (!verification.valid) {
      throw new Error(
        `DAR checksum mismatch! Expected ${verification.expectedSha256} but calculated ${verification.actualSha256}`
      );
    }

    const uploadRes = await this.adminClient.uploadPackage(darBuffer, `ObligaX ${this.getManifest().version}`);
    const vetRes = await this.adminClient.vetPackage(uploadRes.packageId, synchronizerId);

    return {
      packageId: uploadRes.packageId,
      vetted: vetRes.vetted
    };
  }

  /**
   * List vetted packages
   */
  public async getVettedPackages(): Promise<CantonPackageDetails[]> {
    return this.adminClient.listPackages();
  }
}
