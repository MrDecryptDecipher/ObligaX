import { CantonClient } from '../../infrastructure/canton/canton-client';
import { AuditRepository } from '../../infrastructure/database/repositories/audit.repository';
import { RequestContext } from '../../types/common.types';
import { ParticipantRegistrationEntity } from '../../domain/governance/governance.types';
import { SafeDecimal } from '../../utils/decimal';
import { NotFoundError } from '../../types/errors.types';
import { TEMPLATES } from '../../infrastructure/canton/canton-commands';

export class ParticipantService {
  private participants: Map<string, ParticipantRegistrationEntity> = new Map();

  constructor(
    private readonly cantonClient: CantonClient,
    private readonly auditRepo: AuditRepository
  ) {}

  public async registerParticipant(
    dto: Record<string, unknown>,
    context: RequestContext
  ): Promise<ParticipantRegistrationEntity> {
    const participantId = String(dto['participantId']);
    const party = String(dto['party']);
    const now = new Date();

    const cmdResult = await this.cantonClient.submit({
      commandId: `cmd-reg-${participantId}`,
      actAs: [context.partyId || 'NetworkOperator'],
      commands: [
        {
          type: 'create',
          templateId: TEMPLATES.PARTICIPANT_REGISTRATION,
          argument: {
            ...dto,
            status: 'ParticipantPending',
            registeredAt: now.toISOString()
          }
        }
      ]
    });

    const entity: ParticipantRegistrationEntity = {
      contractId: cmdResult.createdContractIds[0],
      participantId,
      party,
      participantName: String(dto['participantName']),
      tier: (dto['tier'] as any) || 'Tier2',
      roles: (dto['roles'] as any) || [],
      status: 'ParticipantPending',
      supportedCurrencies: (dto['supportedCurrencies'] as any) || ['USD'],
      limits: {
        maximumObligationAmount: SafeDecimal.from(String(dto['maximumObligationAmount'] || '1000000')),
        maximumDailyGrossVolume: SafeDecimal.from(String(dto['maximumDailyGrossVolume'] || '10000000')),
        maximumNettingAmount: SafeDecimal.from(String(dto['maximumNettingAmount'] || '5000000'))
      },
      capabilities: {
        canCreateObligations: true,
        canAcceptObligations: true,
        canConfirmObligations: true,
        canInitiateNetting: true,
        canParticipateInNetting: true,
        canInitiateSettlement: true,
        canProcessSettlement: false,
        canResolveDisputes: true,
        canProposeAmendments: true
      },
      metadata: {
        legalName: String(dto['legalName']),
        legalEntityIdentifier: String(dto['legalEntityIdentifier']),
        jurisdiction: String(dto['jurisdiction']),
        businessUnit: String(dto['businessUnit']),
        sourceSystem: String(dto['sourceSystem']),
        registeredAt: now,
        registeredBy: context.partyId || 'NetworkOperator'
      }
    };

    this.participants.set(participantId, entity);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'PARTICIPANT_REGISTERED',
      resourceType: 'Participant',
      resourceId: participantId,
      contractId: entity.contractId,
      payloadAfter: entity,
      ipAddress: context.ipAddress
    });

    return entity;
  }

  public async activateParticipant(participantId: string, context: RequestContext): Promise<ParticipantRegistrationEntity> {
    const existing = this.participants.get(participantId);
    if (!existing) {
      throw new NotFoundError('Participant', participantId);
    }

    const cmdResult = await this.cantonClient.submit({
      commandId: `cmd-act-${participantId}`,
      actAs: [existing.party],
      commands: [
        {
          type: 'exercise',
          templateId: TEMPLATES.PARTICIPANT_REGISTRATION,
          contractId: existing.contractId!,
          choice: 'ActivateParticipant',
          argument: {}
        }
      ]
    });

    existing.status = 'ParticipantActive';
    existing.contractId = cmdResult.createdContractIds[0];
    this.participants.set(participantId, existing);

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'PARTICIPANT_ACTIVATED',
      resourceType: 'Participant',
      resourceId: participantId,
      contractId: existing.contractId,
      payloadAfter: existing,
      ipAddress: context.ipAddress
    });

    return existing;
  }

  public async getParticipant(participantId: string): Promise<ParticipantRegistrationEntity | null> {
    return this.participants.get(participantId) || null;
  }

  public async listParticipants(): Promise<ParticipantRegistrationEntity[]> {
    if (this.participants.size === 0) {
      const defaultParticipants: Array<{
        id: string;
        name: string;
        party: string;
        lei: string;
        tier: 'Tier1' | 'Tier2';
        roles: string[];
      }> = [
        {
          id: 'NetworkOperator',
          name: 'ObligaX Clearinghouse & Network Operator',
          party: 'NetworkOperator::1220d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2c3',
          lei: '549300OBLIGAXOPERATOR01',
          tier: 'Tier1',
          roles: ['NetworkOperator', 'ComplianceOperator', 'SettlementOperator']
        },
        {
          id: 'BankA',
          name: 'Bank A (Global Custody & Investment Banking)',
          party: 'BankA::1220a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
          lei: '549300BANKAGLOBALCUST01',
          tier: 'Tier1',
          roles: ['ObligationCounterparty', 'NettingParticipant', 'SettlementParticipant']
        },
        {
          id: 'BankB',
          name: 'Bank B (Institutional Markets & Treasury)',
          party: 'BankB::1220b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1',
          lei: '549300BANKBINSTMARKET02',
          tier: 'Tier1',
          roles: ['ObligationCounterparty', 'NettingParticipant', 'SettlementParticipant']
        },
        {
          id: 'BankC',
          name: 'Bank C (Securities Clearing & Liquidity)',
          party: 'BankC::1220c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2',
          lei: '549300BANKCSECURITIES03',
          tier: 'Tier2',
          roles: ['ObligationCounterparty', 'NettingParticipant', 'SettlementParticipant']
        }
      ];

      for (const p of defaultParticipants) {
        this.participants.set(p.id, {
          contractId: `cid-part-${p.id.toLowerCase()}`,
          participantId: p.id,
          party: p.party,
          participantName: p.name,
          tier: p.tier,
          roles: p.roles as any,
          status: 'ParticipantActive',
          supportedCurrencies: ['USD', 'EUR', 'GBP', 'CHF'],
          limits: {
            maximumObligationAmount: SafeDecimal.from('100000000'),
            maximumDailyGrossVolume: SafeDecimal.from('1000000000'),
            maximumNettingAmount: SafeDecimal.from('500000000')
          },
          capabilities: {
            canCreateObligations: true,
            canAcceptObligations: true,
            canConfirmObligations: true,
            canInitiateNetting: true,
            canParticipateInNetting: true,
            canInitiateSettlement: true,
            canProcessSettlement: p.id === 'NetworkOperator',
            canResolveDisputes: true,
            canProposeAmendments: true
          },
          metadata: {
            legalName: p.name,
            legalEntityIdentifier: p.lei,
            jurisdiction: 'US/NY',
            businessUnit: 'ClearingOps',
            sourceSystem: 'ObligaX-Core',
            registeredAt: new Date(),
            registeredBy: 'NetworkOperator'
          }
        });
      }
    }
    return Array.from(this.participants.values());
  }
}

