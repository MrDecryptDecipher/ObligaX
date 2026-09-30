import { CantonContractRecord } from '../../types/canton.types';

export class CantonQueries {
  public static filterByTemplate<T>(
    contracts: CantonContractRecord<T>[],
    templateId: string
  ): CantonContractRecord<T>[] {
    return contracts.filter(c => c.templateId === templateId);
  }

  public static findByContractId<T>(
    contracts: CantonContractRecord<T>[],
    contractId: string
  ): CantonContractRecord<T> | undefined {
    return contracts.find(c => c.contractId === contractId);
  }

  public static findObligationById(
    contracts: CantonContractRecord<Record<string, unknown>>[],
    obligationId: string
  ): CantonContractRecord<Record<string, unknown>> | undefined {
    return contracts.find(c => c.payload && c.payload['obligationId'] === obligationId);
  }
}
