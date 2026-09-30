import { CantonClient } from '../../infrastructure/canton/canton-client';
import { AuditRepository } from '../../infrastructure/database/repositories/audit.repository';
import { RequestContext } from '../../types/common.types';
import { ObligaXPolicyEntity } from '../../domain/governance/governance.types';
import { SafeDecimal } from '../../utils/decimal';
import { TEMPLATES } from '../../infrastructure/canton/canton-commands';

export class PolicyService {
  private activePolicy: ObligaXPolicyEntity | null = null;

  constructor(
    private readonly cantonClient: CantonClient,
    private readonly auditRepo: AuditRepository
  ) {}

  public async setPolicy(
    dto: Record<string, unknown>,
    context: RequestContext
  ): Promise<ObligaXPolicyEntity> {
    const policyId = String(dto['policyId'] || 'POL-DEFAULT-001');
    const now = new Date();

    const cmdResult = await this.cantonClient.submit({
      commandId: `cmd-policy-${policyId}`,
      actAs: [context.partyId || 'NetworkOperator'],
      commands: [
        {
          type: 'create',
          templateId: TEMPLATES.OBLIGAX_POLICY,
          argument: {
            networkOperator: context.partyId || 'NetworkOperator',
            policyId,
            policyVersion: Number(dto['policyVersion'] || 1),
            active: true,
            supportedCurrencies: dto['supportedCurrencies'] || ['USD', 'EUR', 'GBP'],
            maximumObligationAmount: SafeDecimal.from(String(dto['maximumObligationAmount'] || '10000000')).toString(),
            maximumNettingAmount: SafeDecimal.from(String(dto['maximumNettingAmount'] || '50000000')).toString(),
            maximumSettlementAmount: SafeDecimal.from(String(dto['maximumSettlementAmount'] || '50000000')).toString(),
            allowedRoles: dto['allowedRoles'] || ['Issuer', 'ObligationCounterparty', 'SettlementParticipant', 'NettingParticipant'],
            effectiveDate: now.toISOString()
          }
        }
      ]
    });

    const policy: ObligaXPolicyEntity = {
      contractId: cmdResult.createdContractIds[0],
      policyId,
      policyVersion: Number(dto['policyVersion'] || 1),
      active: true,
      supportedCurrencies: (dto['supportedCurrencies'] as any) || ['USD', 'EUR', 'GBP'],
      maximumObligationAmount: SafeDecimal.from(String(dto['maximumObligationAmount'] || '10000000')),
      maximumNettingAmount: SafeDecimal.from(String(dto['maximumNettingAmount'] || '50000000')),
      maximumSettlementAmount: SafeDecimal.from(String(dto['maximumSettlementAmount'] || '50000000')),
      allowedRoles: (dto['allowedRoles'] as any) || ['Issuer', 'ObligationCounterparty', 'SettlementParticipant', 'NettingParticipant'],
      effectiveDate: now
    };

    this.activePolicy = policy;

    await this.auditRepo.record({
      traceId: context.traceId,
      actor: context.actor,
      action: 'POLICY_CONFIGURED',
      resourceType: 'Policy',
      resourceId: policyId,
      contractId: policy.contractId,
      payloadAfter: policy,
      ipAddress: context.ipAddress
    });

    return policy;
  }

  public getPolicy(): ObligaXPolicyEntity | null {
    return this.activePolicy;
  }
}
