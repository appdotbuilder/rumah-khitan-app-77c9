import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { transactionsTable, patientsTable } from '../db/schema';
import { type TransactionSearchInput } from '../schema';
import { 
  getTransactions, 
  getTransactionById, 
  getTodayTransactions, 
  getPendingTransactions 
} from '../handlers/get_transactions';

describe('Transaction Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create a test patient
  async function createTestPatient() {
    const patientResult = await db.insert(patientsTable)
      .values({
        name: 'Test Patient',
        date_of_birth: '1990-01-01',
        gender: 'Laki-laki',
        phone: '08123456789',
        address: 'Test Address',
        emergency_contact: '08987654321',
        medical_notes: 'Test notes'
      })
      .returning()
      .execute();
    return patientResult[0].id;
  }

  // Helper function to create test transactions
  async function createTestTransaction(patientId: number, overrides: any = {}) {
    const defaultValues = {
      patient_id: patientId,
      total_amount: '150000',
      payment_method: 'tunai' as const,
      payment_status: 'paid' as const,
      notes: 'Test transaction'
    };
    
    const values = { ...defaultValues, ...overrides };
    
    const result = await db.insert(transactionsTable)
      .values(values)
      .returning()
      .execute();
    return result[0];
  }

  describe('getTransactions', () => {
    it('should get all transactions with default pagination', async () => {
      const patientId = await createTestPatient();
      await createTestTransaction(patientId, { total_amount: '100000' });
      await createTestTransaction(patientId, { total_amount: '200000' });

      const result = await getTransactions();

      expect(result).toHaveLength(2);
      expect(result[0].total_amount).toBe(200000); // Should be newest first
      expect(result[1].total_amount).toBe(100000);
      expect(typeof result[0].total_amount).toBe('number');
    });

    it('should filter transactions by patient_id', async () => {
      const patientId1 = await createTestPatient();
      const patientId2 = await createTestPatient();
      
      await createTestTransaction(patientId1);
      await createTestTransaction(patientId2);

      const input: TransactionSearchInput = {
        patient_id: patientId1,
        limit: 10,
        offset: 0
      };

      const result = await getTransactions(input);

      expect(result).toHaveLength(1);
      expect(result[0].patient_id).toBe(patientId1);
    });

    it('should filter transactions by payment_status', async () => {
      const patientId = await createTestPatient();
      await createTestTransaction(patientId, { payment_status: 'pending' });
      await createTestTransaction(patientId, { payment_status: 'paid' });
      await createTestTransaction(patientId, { payment_status: 'cancelled' });

      const input: TransactionSearchInput = {
        payment_status: 'pending',
        limit: 10,
        offset: 0
      };

      const result = await getTransactions(input);

      expect(result).toHaveLength(1);
      expect(result[0].payment_status).toBe('pending');
    });

    it('should filter transactions by date range', async () => {
      const patientId = await createTestPatient();
      
      // Create transactions with specific dates using direct DB inserts
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const today = new Date();
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.insert(transactionsTable)
        .values({
          patient_id: patientId,
          total_amount: '100000',
          payment_method: 'tunai',
          payment_status: 'paid',
          notes: 'Yesterday transaction',
          created_at: yesterday,
          updated_at: yesterday
        })
        .execute();

      await db.insert(transactionsTable)
        .values({
          patient_id: patientId,
          total_amount: '200000',
          payment_method: 'tunai',
          payment_status: 'paid',
          notes: 'Today transaction',
          created_at: today,
          updated_at: today
        })
        .execute();

      await db.insert(transactionsTable)
        .values({
          patient_id: patientId,
          total_amount: '300000',
          payment_method: 'tunai',
          payment_status: 'paid',
          notes: 'Tomorrow transaction',
          created_at: tomorrow,
          updated_at: tomorrow
        })
        .execute();

      const input: TransactionSearchInput = {
        start_date: today,
        end_date: tomorrow,
        limit: 10,
        offset: 0
      };

      const result = await getTransactions(input);

      expect(result).toHaveLength(2);
      result.forEach(transaction => {
        expect(transaction.created_at >= today).toBe(true);
        expect(transaction.created_at <= tomorrow).toBe(true);
      });
    });

    it('should apply pagination correctly', async () => {
      const patientId = await createTestPatient();
      
      // Create 5 transactions
      for (let i = 0; i < 5; i++) {
        await createTestTransaction(patientId, { total_amount: `${100000 + i * 10000}` });
      }

      const input: TransactionSearchInput = {
        limit: 2,
        offset: 1
      };

      const result = await getTransactions(input);

      expect(result).toHaveLength(2);
      // Should skip the first (newest) transaction
      expect(result[0].total_amount).toBe(130000);
      expect(result[1].total_amount).toBe(120000);
    });

    it('should handle multiple filters simultaneously', async () => {
      const patientId1 = await createTestPatient();
      const patientId2 = await createTestPatient();
      
      const today = new Date();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Patient 1 - pending today
      await db.insert(transactionsTable)
        .values({
          patient_id: patientId1,
          total_amount: '150000',
          payment_method: 'tunai',
          payment_status: 'pending',
          notes: 'Test transaction',
          created_at: today,
          updated_at: today
        })
        .execute();
      
      // Patient 1 - paid today
      await db.insert(transactionsTable)
        .values({
          patient_id: patientId1,
          total_amount: '150000',
          payment_method: 'tunai',
          payment_status: 'paid',
          notes: 'Test transaction',
          created_at: today,
          updated_at: today
        })
        .execute();
      
      // Patient 2 - pending today
      await db.insert(transactionsTable)
        .values({
          patient_id: patientId2,
          total_amount: '150000',
          payment_method: 'tunai',
          payment_status: 'pending',
          notes: 'Test transaction',
          created_at: today,
          updated_at: today
        })
        .execute();
      
      // Patient 1 - pending yesterday
      await db.insert(transactionsTable)
        .values({
          patient_id: patientId1,
          total_amount: '150000',
          payment_method: 'tunai',
          payment_status: 'pending',
          notes: 'Test transaction',
          created_at: yesterday,
          updated_at: yesterday
        })
        .execute();

      const input: TransactionSearchInput = {
        patient_id: patientId1,
        payment_status: 'pending',
        start_date: today,
        limit: 10,
        offset: 0
      };

      const result = await getTransactions(input);

      expect(result).toHaveLength(1);
      expect(result[0].patient_id).toBe(patientId1);
      expect(result[0].payment_status).toBe('pending');
      expect(result[0].created_at >= today).toBe(true);
    });

    it('should return empty array when no transactions match filters', async () => {
      const patientId = await createTestPatient();
      await createTestTransaction(patientId, { payment_status: 'paid' });

      const input: TransactionSearchInput = {
        payment_status: 'cancelled',
        limit: 10,
        offset: 0
      };

      const result = await getTransactions(input);

      expect(result).toHaveLength(0);
    });
  });

  describe('getTransactionById', () => {
    it('should get transaction by id', async () => {
      const patientId = await createTestPatient();
      const transaction = await createTestTransaction(patientId, { 
        total_amount: '175000'
      });

      const result = await getTransactionById(transaction.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(transaction.id);
      expect(result!.patient_id).toBe(patientId);
      expect(result!.total_amount).toBe(175000);
      expect(typeof result!.total_amount).toBe('number');
    });

    it('should return null for non-existent transaction', async () => {
      const result = await getTransactionById(999);

      expect(result).toBeNull();
    });

    it('should handle all transaction fields correctly', async () => {
      const patientId = await createTestPatient();
      const transaction = await createTestTransaction(patientId, {
        total_amount: '250000',
        payment_method: 'transfer',
        payment_status: 'pending',
        notes: 'Test notes for transaction'
      });

      const result = await getTransactionById(transaction.id);

      expect(result).not.toBeNull();
      expect(result!.total_amount).toBe(250000);
      expect(result!.payment_method).toBe('transfer');
      expect(result!.payment_status).toBe('pending');
      expect(result!.notes).toBe('Test notes for transaction');
      expect(result!.created_at).toBeInstanceOf(Date);
      expect(result!.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('getTodayTransactions', () => {
    it('should get transactions created today only', async () => {
      const patientId = await createTestPatient();
      
      // Create transaction from yesterday by directly inserting with timestamp
      await db.insert(transactionsTable)
        .values({
          patient_id: patientId,
          total_amount: '100000',
          payment_method: 'tunai',
          payment_status: 'paid',
          notes: 'Yesterday transaction',
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
          updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000)
        })
        .execute();

      // Create transactions for today (use default created_at)
      await createTestTransaction(patientId, { 
        total_amount: '200000'
      });
      
      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await createTestTransaction(patientId, { 
        total_amount: '300000'
      });

      const result = await getTodayTransactions();

      expect(result).toHaveLength(2);
      expect(result[0].total_amount).toBe(300000); // Newest first
      expect(result[1].total_amount).toBe(200000);
      
      // All should be from today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      result.forEach(transaction => {
        expect(transaction.created_at >= todayStart).toBe(true);
        expect(transaction.created_at <= todayEnd).toBe(true);
      });
    });

    it('should return empty array when no transactions today', async () => {
      const patientId = await createTestPatient();
      
      // Create transaction from yesterday by directly inserting with timestamp
      await db.insert(transactionsTable)
        .values({
          patient_id: patientId,
          total_amount: '100000',
          payment_method: 'tunai',
          payment_status: 'paid',
          notes: 'Yesterday transaction',
          created_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
          updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000)
        })
        .execute();

      const result = await getTodayTransactions();

      expect(result).toHaveLength(0);
    });

    it('should order results by creation date descending', async () => {
      const patientId = await createTestPatient();
      
      // Create multiple transactions today with small delays
      await createTestTransaction(patientId, { total_amount: '100000' });
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      await createTestTransaction(patientId, { total_amount: '200000' });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await createTestTransaction(patientId, { total_amount: '300000' });

      const result = await getTodayTransactions();

      expect(result).toHaveLength(3);
      expect(result[0].total_amount).toBe(300000); // Most recent
      expect(result[1].total_amount).toBe(200000);
      expect(result[2].total_amount).toBe(100000); // Oldest
    });
  });

  describe('getPendingTransactions', () => {
    it('should get only pending transactions', async () => {
      const patientId = await createTestPatient();
      
      await createTestTransaction(patientId, { 
        payment_status: 'pending',
        total_amount: '100000'
      });
      await createTestTransaction(patientId, { 
        payment_status: 'paid',
        total_amount: '200000'
      });
      await createTestTransaction(patientId, { 
        payment_status: 'cancelled',
        total_amount: '300000'
      });
      await createTestTransaction(patientId, { 
        payment_status: 'pending',
        total_amount: '400000'
      });

      const result = await getPendingTransactions();

      expect(result).toHaveLength(2);
      result.forEach(transaction => {
        expect(transaction.payment_status).toBe('pending');
      });
      
      // Should be ordered by creation date descending
      expect(result[0].total_amount).toBe(400000); // Newest pending
      expect(result[1].total_amount).toBe(100000); // Oldest pending
    });

    it('should return empty array when no pending transactions', async () => {
      const patientId = await createTestPatient();
      
      await createTestTransaction(patientId, { payment_status: 'paid' });
      await createTestTransaction(patientId, { payment_status: 'cancelled' });

      const result = await getPendingTransactions();

      expect(result).toHaveLength(0);
    });

    it('should convert numeric fields correctly', async () => {
      const patientId = await createTestPatient();
      
      await createTestTransaction(patientId, { 
        payment_status: 'pending',
        total_amount: '125000'
      });

      const result = await getPendingTransactions();

      expect(result).toHaveLength(1);
      expect(result[0].total_amount).toBe(125000);
      expect(typeof result[0].total_amount).toBe('number');
    });

    it('should order results by creation date descending', async () => {
      const patientId = await createTestPatient();
      
      // Create multiple pending transactions with delays
      await createTestTransaction(patientId, { 
        payment_status: 'pending',
        total_amount: '100000'
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await createTestTransaction(patientId, { 
        payment_status: 'pending',
        total_amount: '200000'
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await createTestTransaction(patientId, { 
        payment_status: 'pending',
        total_amount: '300000'
      });

      const result = await getPendingTransactions();

      expect(result).toHaveLength(3);
      expect(result[0].total_amount).toBe(300000); // Most recent
      expect(result[1].total_amount).toBe(200000);
      expect(result[2].total_amount).toBe(100000); // Oldest
    });
  });
});