import { ObligationStatus } from './obligation.types';

export class ObligationStateMachine {
  private static readonly VALID_TRANSITIONS: Record<ObligationStatus, ObligationStatus[]> = {
    Proposed: ['Accepted', 'Cancelled'],
    Accepted: ['Confirmed', 'Cancelled'],
    Confirmed: [
      'AmendmentPending',
      'Disputed',
      'NettingPending',
      'SettlementPending',
      'Cancelled'
    ],
    AmendmentPending: ['Confirmed', 'Cancelled'],
    Disputed: ['Confirmed'],
    NettingPending: ['Netted', 'Confirmed'],
    SettlementPending: ['Settled', 'Confirmed'],
    Settled: [], // Terminal
    Netted: [],  // Terminal
    Cancelled: [] // Terminal
  };

  /**
   * Determine if a transition is valid according to Canton/DAML lifecycle rules
   */
  public static canTransition(current: ObligationStatus, target: ObligationStatus): boolean {
    const allowed = this.VALID_TRANSITIONS[current] || [];
    return allowed.includes(target);
  }

  /**
   * Assert valid transition or throw institutional domain error
   */
  public static assertTransition(current: ObligationStatus, target: ObligationStatus, obligationId: string): void {
    if (!this.canTransition(current, target)) {
      throw new Error(
        `OBL-SM-001: Invalid obligation lifecycle transition from '${current}' to '${target}' for obligation '${obligationId}'.`
      );
    }
  }

  /**
   * Check if state is terminal
   */
  public static isTerminal(status: ObligationStatus): boolean {
    return status === 'Settled' || status === 'Netted' || status === 'Cancelled';
  }

  /**
   * Get valid next states
   */
  public static getNextAllowedStates(current: ObligationStatus): ObligationStatus[] {
    return this.VALID_TRANSITIONS[current] || [];
  }
}
