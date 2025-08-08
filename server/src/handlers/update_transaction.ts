import { db } from '../db';
import { 
  transactionsTable, 
  stockMovementsTable, 
  medicinesTable,
  transactionMedicinesTable 
} from '../db/schema';
import { type Transaction } from '../schema';
import { eq } from 'drizzle-orm';

export async function updateTransactionStatus(
  id: number, 
  paymentStatus: 'pending' | 'paid' | 'cancelled'
): Promise<Transaction> {
  try {
    // Start a transaction to ensure data consistency
    const result = await db.transaction(async (tx) => {
      // First, get the current transaction to check its status
      const currentTransactionResult = await tx.select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, id))
        .execute();

      if (currentTransactionResult.length === 0) {
        throw new Error('Transaction not found');
      }

      const currentTransaction = currentTransactionResult[0];

      // If changing from any status to 'cancelled', we need to reverse stock movements
      if (paymentStatus === 'cancelled' && currentTransaction.payment_status !== 'cancelled') {
        // Get all stock movements associated with this transaction
        const stockMovements = await tx.select()
          .from(stockMovementsTable)
          .where(eq(stockMovementsTable.reference_id, id))
          .execute();

        // Reverse each stock movement by adding back the quantities
        for (const movement of stockMovements) {
          if (movement.movement_type === 'keluar') {
            // Get current stock quantity first
            const currentMedicineResult = await tx.select()
              .from(medicinesTable)
              .where(eq(medicinesTable.id, movement.medicine_id))
              .execute();

            if (currentMedicineResult.length === 0) {
              throw new Error(`Medicine with ID ${movement.medicine_id} not found`);
            }

            const currentMedicine = currentMedicineResult[0];

            // For outgoing movements, add the quantity back to stock
            const newStockQuantity = currentMedicine.stock_quantity + movement.quantity;
            await tx.update(medicinesTable)
              .set({
                stock_quantity: newStockQuantity,
                updated_at: new Date()
              })
              .where(eq(medicinesTable.id, movement.medicine_id))
              .execute();

            // Create a reverse stock movement record for audit trail
            await tx.insert(stockMovementsTable)
              .values({
                medicine_id: movement.medicine_id,
                movement_type: 'masuk',
                quantity: movement.quantity,
                reference_id: id,
                notes: `Pembatalan transaksi #${id} - pemulihan stok`
              })
              .execute();
          }
        }
      }

      // If changing from 'cancelled' to 'paid' or 'pending', we need to re-deduct stock
      if (currentTransaction.payment_status === 'cancelled' && paymentStatus !== 'cancelled') {
        // Get transaction medicines to re-deduct stock
        const transactionMedicines = await tx.select()
          .from(transactionMedicinesTable)
          .where(eq(transactionMedicinesTable.transaction_id, id))
          .execute();

        // Re-deduct stock for each medicine
        for (const item of transactionMedicines) {
          // Check if sufficient stock is available
          const medicineResult = await tx.select()
            .from(medicinesTable)
            .where(eq(medicinesTable.id, item.medicine_id))
            .execute();

          if (medicineResult.length === 0) {
            throw new Error(`Medicine with ID ${item.medicine_id} not found`);
          }

          const medicine = medicineResult[0];

          if (medicine.stock_quantity < item.quantity) {
            throw new Error(`Insufficient stock for medicine ID ${item.medicine_id}`);
          }

          // Deduct stock
          const newStockQuantity = medicine.stock_quantity - item.quantity;
          await tx.update(medicinesTable)
            .set({
              stock_quantity: newStockQuantity,
              updated_at: new Date()
            })
            .where(eq(medicinesTable.id, item.medicine_id))
            .execute();

          // Create stock movement record
          await tx.insert(stockMovementsTable)
            .values({
              medicine_id: item.medicine_id,
              movement_type: 'keluar',
              quantity: item.quantity,
              reference_id: id,
              notes: `Reaktivasi transaksi #${id} - pengurangan stok`
            })
            .execute();
        }
      }

      // Update the transaction status
      const updatedTransactionResult = await tx.update(transactionsTable)
        .set({
          payment_status: paymentStatus,
          updated_at: new Date()
        })
        .where(eq(transactionsTable.id, id))
        .returning()
        .execute();

      if (updatedTransactionResult.length === 0) {
        throw new Error('Failed to update transaction');
      }

      return updatedTransactionResult[0];
    });

    // Convert numeric fields back to numbers
    return {
      ...result,
      total_amount: parseFloat(result.total_amount)
    };
  } catch (error) {
    console.error('Failed to update transaction status:', error);
    throw error;
  }
}

export async function addTransactionNotes(id: number, notes: string): Promise<Transaction> {
  try {
    // Update the transaction notes
    const result = await db.update(transactionsTable)
      .set({
        notes: notes,
        updated_at: new Date()
      })
      .where(eq(transactionsTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Transaction not found');
    }

    // Convert numeric fields back to numbers
    return {
      ...result[0],
      total_amount: parseFloat(result[0].total_amount)
    };
  } catch (error) {
    console.error('Failed to add transaction notes:', error);
    throw error;
  }
}