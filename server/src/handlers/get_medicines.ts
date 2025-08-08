import { db } from '../db';
import { medicinesTable } from '../db/schema';
import { type Medicine, type MedicineSearchInput } from '../schema';
import { eq, lte, ilike, and, desc, SQL } from 'drizzle-orm';

export async function getMedicines(input?: MedicineSearchInput): Promise<Medicine[]> {
  try {
    // If no input or no filters, return all medicines
    if (!input || (!input.query && !input.low_stock_only && !input.expired_only)) {
      let query = db.select().from(medicinesTable).orderBy(medicinesTable.name);
      
      if (input?.limit) {
        query = query.limit(input.limit) as typeof query;
      }
      if (input?.offset) {
        query = query.offset(input.offset) as typeof query;
      }
      
      const results = await query.execute();
      return results.map(medicine => ({
        ...medicine,
        price_per_unit: parseFloat(medicine.price_per_unit),
        expiry_date: medicine.expiry_date ? new Date(medicine.expiry_date) : null,
        created_at: new Date(medicine.created_at),
        updated_at: new Date(medicine.updated_at)
      }));
    }

    // Build conditions
    const conditions: SQL<unknown>[] = [];

    // Search by name (case-insensitive)
    if (input.query) {
      conditions.push(ilike(medicinesTable.name, `%${input.query}%`));
    }

    // Filter for low stock medicines
    if (input.low_stock_only) {
      conditions.push(lte(medicinesTable.stock_quantity, medicinesTable.minimum_stock));
    }

    // Filter for expired medicines
    if (input.expired_only) {
      const today = new Date().toISOString().split('T')[0];
      conditions.push(lte(medicinesTable.expiry_date, today));
    }

    // Build query with conditions
    let query = db.select().from(medicinesTable);
    
    if (conditions.length === 1) {
      query = query.where(conditions[0]) as typeof query;
    } else if (conditions.length > 1) {
      query = query.where(and(...conditions)) as typeof query;
    }

    query = query.orderBy(medicinesTable.name) as typeof query;

    // Apply pagination
    if (input.limit) {
      query = query.limit(input.limit) as typeof query;
    }
    if (input.offset) {
      query = query.offset(input.offset) as typeof query;
    }

    const results = await query.execute();

    return results.map(medicine => ({
      ...medicine,
      price_per_unit: parseFloat(medicine.price_per_unit),
      expiry_date: medicine.expiry_date ? new Date(medicine.expiry_date) : null,
      created_at: new Date(medicine.created_at),
      updated_at: new Date(medicine.updated_at)
    }));
  } catch (error) {
    console.error('Failed to get medicines:', error);
    throw error;
  }
}

export async function getMedicineById(id: number): Promise<Medicine | null> {
  try {
    const results = await db.select()
      .from(medicinesTable)
      .where(eq(medicinesTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const medicine = results[0];
    return {
      ...medicine,
      price_per_unit: parseFloat(medicine.price_per_unit),
      expiry_date: medicine.expiry_date ? new Date(medicine.expiry_date) : null,
      created_at: new Date(medicine.created_at),
      updated_at: new Date(medicine.updated_at)
    };
  } catch (error) {
    console.error('Failed to get medicine by ID:', error);
    throw error;
  }
}

export async function getLowStockMedicines(): Promise<Medicine[]> {
  try {
    const results = await db.select()
      .from(medicinesTable)
      .where(lte(medicinesTable.stock_quantity, medicinesTable.minimum_stock))
      .orderBy(desc(medicinesTable.minimum_stock), medicinesTable.name)
      .execute();

    return results.map(medicine => ({
      ...medicine,
      price_per_unit: parseFloat(medicine.price_per_unit),
      expiry_date: medicine.expiry_date ? new Date(medicine.expiry_date) : null,
      created_at: new Date(medicine.created_at),
      updated_at: new Date(medicine.updated_at)
    }));
  } catch (error) {
    console.error('Failed to get low stock medicines:', error);
    throw error;
  }
}

export async function getExpiredMedicines(): Promise<Medicine[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const results = await db.select()
      .from(medicinesTable)
      .where(lte(medicinesTable.expiry_date, today))
      .orderBy(medicinesTable.expiry_date, medicinesTable.name)
      .execute();

    return results.map(medicine => ({
      ...medicine,
      price_per_unit: parseFloat(medicine.price_per_unit),
      expiry_date: medicine.expiry_date ? new Date(medicine.expiry_date) : null,
      created_at: new Date(medicine.created_at),
      updated_at: new Date(medicine.updated_at)
    }));
  } catch (error) {
    console.error('Failed to get expired medicines:', error);
    throw error;
  }
}