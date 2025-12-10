import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import pool from '../database/db';
import {
  getInventory,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  adjustStock,
  dispenseMedication,
  getInventoryCategories,
  getLowStockAlerts,
  getExpiringMedications,
  getPayerPricingRules,
  calculatePrice,
  getRevenueSummary,
  getPatientDrugHistory,
} from '../controllers/inventoryController';

// Mock response object
const mockResponse = () => {
  const res: Partial<Response> = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return res as Response;
};

// Mock request object
const mockRequest = (body = {}, params = {}, query = {}, user = { id: 1 }) => {
  return {
    body,
    params,
    query,
    user,
  } as unknown as Request;
};

describe('Inventory Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getInventory', () => {
    it('should return inventory items with stats', async () => {
      const mockInventory = [
        { id: 1, medication_name: 'Paracetamol', quantity_on_hand: 100, reorder_level: 20 },
        { id: 2, medication_name: 'Ibuprofen', quantity_on_hand: 15, reorder_level: 20 },
      ];
      const mockStats = {
        total_items: 2,
        low_stock_count: 1,
        expiring_soon_count: 0,
        expired_count: 0,
        total_stock_value: 150,
      };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: mockInventory } as any)
        .mockResolvedValueOnce({ rows: [mockStats] } as any);

      const req = mockRequest({}, {}, {});
      const res = mockResponse();

      await getInventory(req, res);

      expect(res.json).toHaveBeenCalledWith({
        inventory: mockInventory,
        stats: mockStats,
      });
    });

    it('should filter by low stock when requested', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{}] } as any);

      const req = mockRequest({}, {}, { low_stock: 'true' });
      const res = mockResponse();

      await getInventory(req, res);

      expect(pool.query).toHaveBeenCalled();
      const queryCall = vi.mocked(pool.query).mock.calls[0][0] as string;
      // Query uses i.quantity_on_hand <= i.reorder_level
      expect(queryCall).toContain('quantity_on_hand');
      expect(queryCall).toContain('reorder_level');
    });

    it('should filter by expiring soon when requested', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{}] } as any);

      const req = mockRequest({}, {}, { expiring_soon: 'true' });
      const res = mockResponse();

      await getInventory(req, res);

      expect(pool.query).toHaveBeenCalled();
      const queryCall = vi.mocked(pool.query).mock.calls[0][0] as string;
      expect(queryCall).toContain("expiry_date <= CURRENT_DATE + INTERVAL '90 days'");
    });

    it('should search by medication name', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [{}] } as any);

      const req = mockRequest({}, {}, { search: 'Para' });
      const res = mockResponse();

      await getInventory(req, res);

      expect(pool.query).toHaveBeenCalled();
      const queryCall = vi.mocked(pool.query).mock.calls[0][0] as string;
      expect(queryCall).toContain('medication_name ILIKE');
    });
  });

  describe('getInventoryItem', () => {
    it('should return a single inventory item with transaction history', async () => {
      const mockItem = { id: 1, medication_name: 'Paracetamol', quantity_on_hand: 100 };
      const mockTransactions = [
        { id: 1, transaction_type: 'purchase', quantity: 50 },
      ];

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: mockTransactions } as any);

      const req = mockRequest({}, { id: '1' });
      const res = mockResponse();

      await getInventoryItem(req, res);

      expect(res.json).toHaveBeenCalledWith({
        item: mockItem,
        transactions: mockTransactions,
      });
    });

    it('should return 404 if item not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({}, { id: '999' });
      const res = mockResponse();

      await getInventoryItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Inventory item not found' });
    });
  });

  describe('createInventoryItem', () => {
    it('should create a new inventory item', async () => {
      const newItem = {
        medication_name: 'Amoxicillin',
        generic_name: 'Amoxicillin',
        category: 'Antibiotic',
        unit: 'capsule',
        quantity_on_hand: 100,
        reorder_level: 20,
        unit_cost: 1.5,
        selling_price: 3.0,
      };
      const createdItem = { id: 1, ...newItem };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [createdItem] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest(newItem);
      const res = mockResponse();

      await createInventoryItem(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Inventory item created successfully',
        item: createdItem,
      });
    });
  });

  describe('updateInventoryItem', () => {
    it('should update an existing inventory item', async () => {
      const updatedItem = { id: 1, medication_name: 'Paracetamol Updated', quantity_on_hand: 150 };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [updatedItem] } as any);

      const req = mockRequest({ medication_name: 'Paracetamol Updated' }, { id: '1' });
      const res = mockResponse();

      await updateInventoryItem(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Inventory item updated successfully',
        item: updatedItem,
      });
    });

    it('should return 404 if item not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({ medication_name: 'Test' }, { id: '999' });
      const res = mockResponse();

      await updateInventoryItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('adjustStock', () => {
    it('should adjust stock and log transaction', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ quantity_on_hand: 100 }] }) // Get current stock
          .mockResolvedValueOnce({ rows: [{ id: 1, quantity_on_hand: 150 }] }) // Update stock
          .mockResolvedValueOnce({}) // Log transaction
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      const req = mockRequest(
        { adjustment: 50, transaction_type: 'purchase', notes: 'New stock' },
        { id: '1' }
      );
      const res = mockResponse();

      await adjustStock(req, res);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Stock adjusted successfully',
      }));
    });

    it('should reject adjustment if insufficient stock', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ quantity_on_hand: 10 }] }), // Get current stock
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      const req = mockRequest({ adjustment: -50 }, { id: '1' });
      const res = mockResponse();

      await adjustStock(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient stock for this adjustment' });
    });

    it('should reject if adjustment is zero', async () => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      const req = mockRequest({ adjustment: 0 }, { id: '1' });
      const res = mockResponse();

      await adjustStock(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Adjustment quantity is required' });
    });
  });

  describe('dispenseMedication', () => {
    it('should dispense medication and update pharmacy order', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 1, medication_name: 'Paracetamol', quantity_on_hand: 100 }] })
          .mockResolvedValueOnce({}) // Update stock
          .mockResolvedValueOnce({}) // Log transaction
          .mockResolvedValueOnce({}) // Update pharmacy order
          .mockResolvedValueOnce({}), // COMMIT
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      const req = mockRequest({
        inventory_id: 1,
        quantity: 10,
        pharmacy_order_id: 1,
      });
      const res = mockResponse();

      await dispenseMedication(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Medication dispensed successfully',
        dispensed: expect.objectContaining({
          medication: 'Paracetamol',
          quantity: 10,
          remaining_stock: 90,
        }),
      }));
    });

    it('should reject if insufficient stock', async () => {
      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({}) // BEGIN
          .mockResolvedValueOnce({ rows: [{ id: 1, medication_name: 'Paracetamol', quantity_on_hand: 5 }] }),
        release: vi.fn(),
      };

      vi.mocked(pool.connect).mockResolvedValueOnce(mockClient as any);

      const req = mockRequest({ inventory_id: 1, quantity: 10 });
      const res = mockResponse();

      await dispenseMedication(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient stock',
        available: 5,
        requested: 10,
      });
    });
  });

  describe('getInventoryCategories', () => {
    it('should return unique categories with counts', async () => {
      const mockCategories = [
        { category: 'Antibiotic', count: '5' },
        { category: 'Analgesic', count: '3' },
      ];

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockCategories } as any);

      const req = mockRequest();
      const res = mockResponse();

      await getInventoryCategories(req, res);

      expect(res.json).toHaveBeenCalledWith({ categories: mockCategories });
    });
  });

  describe('getLowStockAlerts', () => {
    it('should return items below reorder level', async () => {
      const mockAlerts = [
        { id: 1, medication_name: 'Test Med', quantity_on_hand: 5, reorder_level: 10 },
      ];

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockAlerts } as any);

      const req = mockRequest();
      const res = mockResponse();

      await getLowStockAlerts(req, res);

      expect(res.json).toHaveBeenCalledWith({ alerts: mockAlerts });
    });
  });

  describe('getExpiringMedications', () => {
    it('should return medications expiring within default 90 days', async () => {
      const mockExpiring = [
        { id: 1, medication_name: 'Test Med', expiry_date: '2025-02-01', days_until_expiry: 30 },
      ];

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockExpiring } as any);

      const req = mockRequest({}, {}, {});
      const res = mockResponse();

      await getExpiringMedications(req, res);

      expect(res.json).toHaveBeenCalledWith({ expiring: mockExpiring });
    });

    it('should accept custom days parameter', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({}, {}, { days: '30' });
      const res = mockResponse();

      await getExpiringMedications(req, res);

      const queryCall = vi.mocked(pool.query).mock.calls[0][0] as string;
      expect(queryCall).toContain("INTERVAL '30 days'");
    });
  });

  describe('getPayerPricingRules', () => {
    it('should return payer pricing rules', async () => {
      const mockRules = [
        { id: 1, payer_type: 'corporate', discount_percentage: 10 },
        { id: 2, payer_type: 'insurance', discount_percentage: 15 },
      ];

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockRules } as any);

      const req = mockRequest();
      const res = mockResponse();

      await getPayerPricingRules(req, res);

      expect(res.json).toHaveBeenCalledWith({ rules: mockRules });
    });
  });

  describe('calculatePrice', () => {
    it('should calculate price with corporate discount', async () => {
      const mockItem = { selling_price: '10.00' };
      const mockRule = { markup_percentage: '0', discount_percentage: '10' };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [mockRule] } as any);

      const req = mockRequest({
        inventory_id: 1,
        quantity: 5,
        payer_type: 'corporate',
      });
      const res = mockResponse();

      await calculatePrice(req, res);

      expect(res.json).toHaveBeenCalledWith({
        base_price: 10,
        quantity: 5,
        subtotal: 50,
        markup_percentage: 0,
        markup_amount: 0,
        discount_percentage: 10,
        discount_amount: 5,
        final_price: 45,
      });
    });

    it('should return 404 if item not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({ inventory_id: 999 });
      const res = mockResponse();

      await calculatePrice(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getRevenueSummary', () => {
    it('should return revenue summary with top medications', async () => {
      const mockDailyRevenue = [{ date: '2025-01-01', orders_count: 5, revenue: 100 }];
      const mockTotals = { total_orders: 50, dispensed_orders: 45 };
      const mockTopMeds = [{ medication_name: 'Paracetamol', order_count: 20 }];

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: mockDailyRevenue } as any)
        .mockResolvedValueOnce({ rows: [mockTotals] } as any)
        .mockResolvedValueOnce({ rows: mockTopMeds } as any);

      const req = mockRequest({}, {}, {});
      const res = mockResponse();

      await getRevenueSummary(req, res);

      expect(res.json).toHaveBeenCalledWith({
        daily_revenue: mockDailyRevenue,
        totals: mockTotals,
        top_medications: mockTopMeds,
      });
    });
  });

  describe('getPatientDrugHistory', () => {
    it('should return patient orders, active medications, and allergies', async () => {
      const mockOrders = [{ id: 1, medication_name: 'Test Med' }];
      const mockActiveMeds = [{ id: 1, medication_name: 'Active Med', status: 'active' }];
      const mockAllergies = [{ id: 1, allergen: 'Penicillin', severity: 'severe' }];

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: mockOrders } as any)
        .mockResolvedValueOnce({ rows: mockActiveMeds } as any)
        .mockResolvedValueOnce({ rows: mockAllergies } as any);

      const req = mockRequest({}, { patient_id: '1' });
      const res = mockResponse();

      await getPatientDrugHistory(req, res);

      expect(res.json).toHaveBeenCalledWith({
        orders: mockOrders,
        active_medications: mockActiveMeds,
        allergies: mockAllergies,
      });
    });

    it('should support date range filtering', async () => {
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest(
        {},
        { patient_id: '1' },
        { start_date: '2025-01-01', end_date: '2025-01-31' }
      );
      const res = mockResponse();

      await getPatientDrugHistory(req, res);

      const queryCall = vi.mocked(pool.query).mock.calls[0][0] as string;
      expect(queryCall).toContain('ordered_date >=');
      expect(queryCall).toContain('ordered_date <=');
    });
  });
});
