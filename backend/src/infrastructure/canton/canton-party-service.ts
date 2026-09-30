import { CantonAdminClient } from './canton-admin-client';
import { CantonPartyDetails } from '../../types/canton.types';
import { UnauthorizedError } from '../../types/errors.types';

export interface UserPartyMapping {
  userId: string;
  email: string;
  organizationId: string;
  tenantId: string;
  partyId: string; // Full Canton party string: Name::fingerprint
  partyName: string;
  roles: string[];
  capabilities: string[];
  participantId: string;
}

export type OnboardingStage =
  | 'BUSINESS_REGISTERED'
  | 'COMPLIANCE_APPROVED'
  | 'TOPOLOGY_PROVISIONED'
  | 'PARTY_HOSTED'
  | 'OPERATIONAL_ACTIVE';

export interface ParticipantOnboardingRecord {
  participantId: string;
  legalName: string;
  lei: string;
  stage: OnboardingStage;
  cantonPartyId?: string;
  participantNodeId: string;
  registeredAt: Date;
  complianceApprovedAt?: Date;
  topologyProvisionedAt?: Date;
  activatedAt?: Date;
}

export class CantonPartyService {
  // Pre-configured enterprise topology mappings for standard network nodes
  private readonly partyRegistry: Map<string, UserPartyMapping> = new Map([
    [
      'user_banka@banka.com',
      {
        userId: 'user_banka@banka.com',
        email: 'ops@banka.com',
        organizationId: 'ORG_BANKA',
        tenantId: 'TENANT_BANKA',
        partyId: 'BankA::1220a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
        partyName: 'BankA',
        roles: ['ObligationCounterparty', 'NettingParticipant', 'SettlementParticipant'],
        capabilities: [
          'canCreateObligations',
          'canAcceptObligations',
          'canConfirmObligations',
          'canInitiateNetting',
          'canParticipateInNetting',
          'canInitiateSettlement'
        ],
        participantId: 'participant1'
      }
    ],
    [
      'user_bankb@bankb.com',
      {
        userId: 'user_bankb@bankb.com',
        email: 'ops@bankb.com',
        organizationId: 'ORG_BANKB',
        tenantId: 'TENANT_BANKB',
        partyId: 'BankB::1220b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1',
        partyName: 'BankB',
        roles: ['ObligationCounterparty', 'NettingParticipant', 'SettlementParticipant'],
        capabilities: [
          'canCreateObligations',
          'canAcceptObligations',
          'canConfirmObligations',
          'canInitiateNetting',
          'canParticipateInNetting',
          'canInitiateSettlement'
        ],
        participantId: 'participant2'
      }
    ],
    [
      'user_bankc@bankc.com',
      {
        userId: 'user_bankc@bankc.com',
        email: 'ops@bankc.com',
        organizationId: 'ORG_BANKC',
        tenantId: 'TENANT_BANKC',
        partyId: 'BankC::1220c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2',
        partyName: 'BankC',
        roles: ['ObligationCounterparty', 'NettingParticipant', 'SettlementParticipant'],
        capabilities: [
          'canCreateObligations',
          'canAcceptObligations',
          'canConfirmObligations',
          'canInitiateNetting',
          'canParticipateInNetting',
          'canInitiateSettlement'
        ],
        participantId: 'participant3'
      }
    ],
    [
      'operator@obligax.network',
      {
        userId: 'operator@obligax.network',
        email: 'admin@obligax.network',
        organizationId: 'ORG_OPERATOR',
        tenantId: 'TENANT_OPERATOR',
        partyId: 'NetworkOperator::1220d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2c3',
        partyName: 'NetworkOperator',
        roles: ['NetworkOperator', 'ComplianceOperator', 'SettlementOperator'],
        capabilities: [
          'canManageParticipant',
          'canProcessSettlement',
          'canResolveDisputes'
        ],
        participantId: 'participant1'
      }
    ],
    [
      'regulator@fsa.gov',
      {
        userId: 'regulator@fsa.gov',
        email: 'audit@fsa.gov',
        organizationId: 'ORG_REGULATOR',
        tenantId: 'TENANT_REGULATOR',
        partyId: 'Regulator::1220e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2c3d4',
        partyName: 'Regulator',
        roles: ['Auditor', 'ComplianceOperator'],
        capabilities: ['canAuditLedger', 'canInspectTransactions'],
        participantId: 'participant1'
      }
    ]
  ]);

  private onboardingStore: Map<string, ParticipantOnboardingRecord> = new Map();

  constructor(private readonly adminClient?: CantonAdminClient) {}

  /**
   * Resolve user principal to full Canton party with namespace
   */
  public getPartyMapping(userPrincipal: string): UserPartyMapping {
    // 1. Direct match by principal email or user ID
    let mapping = this.partyRegistry.get(userPrincipal);
    if (mapping) return mapping;

    // 2. Match by short party name (e.g. 'BankA', 'BankB')
    for (const m of this.partyRegistry.values()) {
      if (m.partyName === userPrincipal || m.partyId === userPrincipal) {
        return m;
      }
    }

    // Default fallback with generated namespace for dynamic enterprise onboarding
    const cleanName = userPrincipal.replace(/[^a-zA-Z0-9]/g, '');
    const simulatedFingerprint = '1220' + Buffer.from(cleanName).toString('hex').padEnd(64, '0').slice(0, 64);
    const dynamicParty = `${cleanName}::${simulatedFingerprint}`;

    const newMapping: UserPartyMapping = {
      userId: userPrincipal,
      email: `${cleanName.toLowerCase()}@institutional.net`,
      organizationId: `ORG_${cleanName.toUpperCase()}`,
      tenantId: `TENANT_${cleanName.toUpperCase()}`,
      partyId: dynamicParty,
      partyName: cleanName,
      roles: ['ObligationCounterparty', 'NettingParticipant', 'SettlementParticipant'],
      capabilities: ['canCreateObligations', 'canAcceptObligations', 'canConfirmObligations', 'canInitiateNetting'],
      participantId: 'participant1'
    };

    this.partyRegistry.set(userPrincipal, newMapping);
    return newMapping;
  }

  /**
   * Enforce actAs security: User cannot specify arbitrary Canton party
   */
  public validateActAs(userPrincipal: string, requestedParty: string): string {
    const mapping = this.getPartyMapping(userPrincipal);

    // Permitted if requestedParty matches the principal's authorized Canton party or party name
    if (
      requestedParty === mapping.partyId ||
      requestedParty === mapping.partyName ||
      requestedParty === userPrincipal
    ) {
      return mapping.partyId;
    }

    // Operator can actAs for system workflows
    if (mapping.roles.includes('NetworkOperator')) {
      return requestedParty;
    }

    throw new UnauthorizedError(
      `ERR_PARTY_IMPERSONATION: Authenticated principal '${userPrincipal}' is only authorized to actAs '${mapping.partyId}', not '${requestedParty}'.`
    );
  }

  /**
   * Canton multi-stage onboarding workflow
   */
  public async registerParticipantBusiness(participantId: string, legalName: string, lei: string, participantNodeId: string): Promise<ParticipantOnboardingRecord> {
    const record: ParticipantOnboardingRecord = {
      participantId,
      legalName,
      lei,
      stage: 'BUSINESS_REGISTERED',
      participantNodeId,
      registeredAt: new Date()
    };
    this.onboardingStore.set(participantId, record);
    return record;
  }

  public async approveCompliance(participantId: string): Promise<ParticipantOnboardingRecord> {
    const record = this.onboardingStore.get(participantId);
    if (!record) throw new Error(`Participant '${participantId}' not found.`);
    record.stage = 'COMPLIANCE_APPROVED';
    record.complianceApprovedAt = new Date();
    return record;
  }

  public async provisionCantonTopology(participantId: string): Promise<ParticipantOnboardingRecord> {
    const record = this.onboardingStore.get(participantId);
    if (!record) throw new Error(`Participant '${participantId}' not found.`);
    if (record.stage !== 'COMPLIANCE_APPROVED') {
      throw new Error(`Participant '${participantId}' must be COMPLIANCE_APPROVED before Canton topology provisioning.`);
    }

    let allocatedParty: CantonPartyDetails | null = null;
    if (this.adminClient) {
      try {
        allocatedParty = await this.adminClient.allocateParty(participantId, record.legalName);
      } catch (err) {
        // Fallback to deterministic party formatting if offline
      }
    }

    const cantonPartyId = allocatedParty ? allocatedParty.party : `${participantId}::1220${Buffer.from(participantId).toString('hex').padEnd(64, '0').slice(0, 64)}`;
    record.cantonPartyId = cantonPartyId;
    record.stage = 'TOPOLOGY_PROVISIONED';
    record.topologyProvisionedAt = new Date();
    return record;
  }

  public async activateParticipant(participantId: string): Promise<ParticipantOnboardingRecord> {
    const record = this.onboardingStore.get(participantId);
    if (!record) throw new Error(`Participant '${participantId}' not found.`);
    if (record.stage !== 'TOPOLOGY_PROVISIONED') {
      throw new Error(`Participant '${participantId}' must be TOPOLOGY_PROVISIONED before activation.`);
    }

    record.stage = 'OPERATIONAL_ACTIVE';
    record.activatedAt = new Date();
    return record;
  }

  public getOnboardingRecord(participantId: string): ParticipantOnboardingRecord | null {
    return this.onboardingStore.get(participantId) || null;
  }
}
