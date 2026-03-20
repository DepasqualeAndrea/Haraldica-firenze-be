import { EntityManager, UpdateResult } from 'typeorm';

export class TypeOrmHelper {
  static async updateSafe<T>(
    manager: EntityManager,
    entityClass: new () => T,
    id: string,
    updateData: Partial<T>
  ): Promise<UpdateResult> {
    return manager.update(entityClass, id, updateData as any);
  }

  static async updateManySafe<T>(
    manager: EntityManager,
    entityClass: new () => T,
    criteria: any,
    updateData: Partial<T>
  ): Promise<UpdateResult> {
    return manager.update(entityClass, criteria, updateData as any);
  }
}