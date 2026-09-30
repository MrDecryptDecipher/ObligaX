import { ProposeNettingDto, NettingProposalEntity } from './netting.types';

export class NettingDomainRules {
  public static validateProposalDto(dto: ProposeNettingDto): void {
    if (!dto.nettingId || dto.nettingId.trim() === '') {
      throw new Error('NET-RULE-001: Netting ID cannot be empty.');
    }

    if (!dto.initiator || dto.initiator.trim() === '') {
      throw new Error('NET-RULE-002: Initiator party must be specified.');
    }

    if (!dto.counterparty || dto.counterparty.trim() === '') {
      throw new Error('NET-RULE-003: Counterparty must be specified.');
    }

    const initPrefix = dto.initiator.trim().split('::')[0];
    const cpPrefix = dto.counterparty.trim().split('::')[0];
    if (dto.initiator.trim() === dto.counterparty.trim() || initPrefix === cpPrefix) {
      throw new Error('NET-RULE-004: Initiator and counterparty cannot be the same entity.');
    }

    if (!dto.obligationIds || dto.obligationIds.length === 0) {
      throw new Error('NET-RULE-005: Netting set must contain at least one obligation.');
    }

    // Check for duplicate obligation IDs in the proposal set
    const uniqueIds = new Set(dto.obligationIds);
    if (uniqueIds.size !== dto.obligationIds.length) {
      throw new Error('NET-RULE-006: Duplicate obligation IDs detected in netting set.');
    }
  }

  public static validateAccept(proposal: NettingProposalEntity, actorParty: string): void {
    if (proposal.status !== 'NettingProposed') {
      throw new Error(`NET-RULE-007: Netting proposal '${proposal.nettingId}' is in state '${proposal.status}', expected 'NettingProposed'.`);
    }

    const partyMatches = (a: string, b: string) => a === b || a.split('::')[0] === b.split('::')[0];
    if (!partyMatches(proposal.counterparty, actorParty)) {
      throw new Error(`NET-RULE-008: Only counterparty '${proposal.counterparty}' can accept netting proposal '${proposal.nettingId}'.`);
    }
  }

  public static validateExecute(proposal: NettingProposalEntity, actorParty: string): void {
    if (proposal.status !== 'NettingAccepted') {
      throw new Error(`NET-RULE-009: Netting proposal '${proposal.nettingId}' must be 'NettingAccepted' prior to execution (current: ${proposal.status}).`);
    }

    const partyMatches = (a: string, b: string) => a === b || a.split('::')[0] === b.split('::')[0];
    if (!partyMatches(proposal.initiator, actorParty)) {
      throw new Error(`NET-RULE-010: Only initiator '${proposal.initiator}' can execute netting proposal '${proposal.nettingId}'.`);
    }
  }
}
