import { PrismaClient, ObligationStatus as PrismaObligationStatus } from '@prisma/client';
import { DatabaseService } from '../database';
import { ObligationEntity, ObligationStatus } from '../../../domain/obligation/obligation.types';
import { SafeDecimal, Decimal } from '../../../utils/decimal';
import { PaginationHelper, PaginatedResult } from '../../../utils/pagination';

export class ObligationRepository {
  private inMemoryStore: Map<string, ObligationEntity> = new Map();

  private get prisma(): PrismaClient {
    return DatabaseService.getClient();
  }

  public async save(entity: ObligationEntity): Promise<ObligationEntity> {
    if (DatabaseService.connected) {
      try {
        await this.prisma.obligationProjection.upsert({
          where: { obligationId: entity.obligationId },
          create: {
            obligationId: entity.obligationId,
            contractId: entity.contractId || null,
            creditorId: entity.creditor,
            debtorId: entity.debtor,
            description: entity.description,
            amount: entity.amount.toString(),
            currency: entity.currency,
            status: entity.status as PrismaObligationStatus,
            createdDate: entity.createdDate,
            dueDate: entity.dueDate,
            priority: entity.priority,
            version: entity.version,
            sourceSystem: entity.metadata.sourceSystem,
            sourceReference: entity.metadata.sourceReference,
            businessUnit: entity.metadata.businessUnit
          },
          update: {
            contractId: entity.contractId || null,
            status: entity.status as PrismaObligationStatus,
            amount: entity.amount.toString(),
            dueDate: entity.dueDate,
            description: entity.description,
            version: entity.version
          }
        });
      } catch (err: unknown) {
        // Fall back to memory on DB connection errors
        this.inMemoryStore.set(entity.obligationId, { ...entity });
        return entity;
      }
    }

    this.inMemoryStore.set(entity.obligationId, { ...entity });
    return entity;
  }

  public async findByObligationId(obligationId: string): Promise<ObligationEntity | null> {
    if (DatabaseService.connected) {
      try {
        const record = await this.prisma.obligationProjection.findUnique({
          where: { obligationId }
        });
        if (record) {
          return {
            id: record.id,
            contractId: record.contractId || undefined,
            obligationId: record.obligationId,
            creditor: record.creditorId,
            debtor: record.debtorId,
            description: record.description,
            amount: new Decimal(record.amount.toString()),
            currency: record.currency as any,
            status: record.status as ObligationStatus,
            createdDate: record.createdDate,
            dueDate: record.dueDate,
            priority: record.priority as any,
            version: record.version,
            metadata: {
              sourceSystem: record.sourceSystem,
              sourceReference: record.sourceReference,
              businessUnit: record.businessUnit,
              createdBy: record.creditorId,
              createdAt: record.createdAt,
              version: record.version
            }
          };
        }
      } catch (err: unknown) {
        return this.inMemoryStore.get(obligationId) || null;
      }
    }
    return this.inMemoryStore.get(obligationId) || null;
  }

  public async findByContractId(contractId: string): Promise<ObligationEntity | null> {
    for (const item of this.inMemoryStore.values()) {
      if (item.contractId === contractId) return item;
    }
    return null;
  }

  public async updateStatus(
    obligationId: string,
    status: ObligationStatus,
    newContractId?: string
  ): Promise<void> {
    const existing = await this.findByObligationId(obligationId);
    if (existing) {
      existing.status = status;
      existing.version += 1;
      if (newContractId) {
        existing.contractId = newContractId;
      }
      await this.save(existing);
    }
  }

  public async query(
    filters: {
      creditor?: string;
      debtor?: string;
      status?: ObligationStatus;
      currency?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<PaginatedResult<ObligationEntity>> {
    const { page, limit, offset } = PaginationHelper.sanitize({ page: filters.page, limit: filters.limit });
    let items = Array.from(this.inMemoryStore.values());

    if (filters.creditor) {
      items = items.filter(i => i.creditor === filters.creditor);
    }
    if (filters.debtor) {
      items = items.filter(i => i.debtor === filters.debtor);
    }
    if (filters.status) {
      items = items.filter(i => i.status === filters.status);
    }
    if (filters.currency) {
      items = items.filter(i => i.currency === filters.currency);
    }

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);
    return PaginationHelper.paginate(paginated, total, page, limit);
  }
}
