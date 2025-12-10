import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import pool from '../database/db';
import { getPayerPricingRules, calculatePrice } from '../controllers/inventoryController';

const mockResponse = () => {
  const res: Partial<Response> = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return res as Response;
};

const mockRequest = (body = {}, params = {}, query = {}) => {
  return {
    body,
    params,
    query,
  } as unknown as Request;
};

describe('Payer Pricing Rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPayerPricingRules', () => {
    it('should return all pricing rules', async () => {
      const mockRules = [
        { id: 1, payer_type: 'self_pay', payer_id: null, category: null, markup_percentage: 0, discount_percentage: 0 },
        { id: 2, payer_type: 'corporate', payer_id: null, category: null, markup_percentage: 0, discount_percentage: 10 },
        { id: 3, payer_type: 'insurance', payer_id: null, category: null, markup_percentage: 0, discount_percentage: 15 },
      ];

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockRules } as any);

      const req = mockRequest();
      const res = mockResponse();

      await getPayerPricingRules(req, res);

      expect(res.json).toHaveBeenCalledWith({ rules: mockRules });
    });

    it('should return rules filtered by payer_type', async () => {
      const mockRules = [
        { id: 2, payer_type: 'corporate', payer_id: null, category: null, markup_percentage: 0, discount_percentage: 10 },
      ];

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockRules } as any);

      const req = mockRequest({}, {}, { payer_type: 'corporate' });
      const res = mockResponse();

      await getPayerPricingRules(req, res);

      expect(res.json).toHaveBeenCalledWith({ rules: mockRules });
    });

    it('should return rules for specific payer_id', async () => {
      const mockRules = [
        { id: 4, payer_type: 'corporate', payer_id: 1, category: 'Antibiotic', markup_percentage: 0, discount_percentage: 15 },
      ];

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: mockRules } as any);

      const req = mockRequest({}, {}, { payer_type: 'corporate', payer_id: '1' });
      const res = mockResponse();

      await getPayerPricingRules(req, res);

      expect(res.json).toHaveBeenCalledWith({ rules: mockRules });
    });
  });

  describe('calculatePrice', () => {
    it('should calculate price for self-pay patient (no discount)', async () => {
      const mockItem = { selling_price: '10.00' };
      const mockRule = { markup_percentage: '0', discount_percentage: '0' };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [mockRule] } as any);

      const req = mockRequest({
        inventory_id: 1,
        quantity: 10,
        payer_type: 'self_pay',
      });
      const res = mockResponse();

      await calculatePrice(req, res);

      expect(res.json).toHaveBeenCalledWith({
        base_price: 10,
        quantity: 10,
        subtotal: 100,
        markup_percentage: 0,
        markup_amount: 0,
        discount_percentage: 0,
        discount_amount: 0,
        final_price: 100,
      });
    });

    it('should calculate price with corporate 10% discount', async () => {
      const mockItem = { selling_price: '20.00' };
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
        base_price: 20,
        quantity: 5,
        subtotal: 100,
        markup_percentage: 0,
        markup_amount: 0,
        discount_percentage: 10,
        discount_amount: 10,
        final_price: 90,
      });
    });

    it('should calculate price with insurance 15% discount', async () => {
      const mockItem = { selling_price: '50.00' };
      const mockRule = { markup_percentage: '0', discount_percentage: '15' };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [mockRule] } as any);

      const req = mockRequest({
        inventory_id: 1,
        quantity: 2,
        payer_type: 'insurance',
      });
      const res = mockResponse();

      await calculatePrice(req, res);

      expect(res.json).toHaveBeenCalledWith({
        base_price: 50,
        quantity: 2,
        subtotal: 100,
        markup_percentage: 0,
        markup_amount: 0,
        discount_percentage: 15,
        discount_amount: 15,
        final_price: 85,
      });
    });

    it('should apply markup and discount together', async () => {
      const mockItem = { selling_price: '10.00' };
      const mockRule = { markup_percentage: '20', discount_percentage: '10' };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [mockRule] } as any);

      const req = mockRequest({
        inventory_id: 1,
        quantity: 10,
        payer_type: 'corporate',
        payer_id: 1,
      });
      const res = mockResponse();

      await calculatePrice(req, res);

      // Base: 10, Quantity: 10, Subtotal: 100
      // Markup 20%: 20 (on subtotal)
      // Discount 10%: 10 (on subtotal)
      // Final: 100 + 20 - 10 = 110
      expect(res.json).toHaveBeenCalledWith({
        base_price: 10,
        quantity: 10,
        subtotal: 100,
        markup_percentage: 20,
        markup_amount: 20,
        discount_percentage: 10,
        discount_amount: 10,
        final_price: 110,
      });
    });

    it('should return 404 if inventory item not found', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({
        inventory_id: 999,
        quantity: 1,
        payer_type: 'self_pay',
      });
      const res = mockResponse();

      await calculatePrice(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Item not found' });
    });

    it('should use default pricing when no rule exists', async () => {
      const mockItem = { selling_price: '25.00' };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [] } as any); // No pricing rule found

      const req = mockRequest({
        inventory_id: 1,
        quantity: 4,
        payer_type: 'unknown_type',
      });
      const res = mockResponse();

      await calculatePrice(req, res);

      expect(res.json).toHaveBeenCalledWith({
        base_price: 25,
        quantity: 4,
        subtotal: 100,
        markup_percentage: 0,
        markup_amount: 0,
        discount_percentage: 0,
        discount_amount: 0,
        final_price: 100,
      });
    });

    it('should handle specific payer_id pricing', async () => {
      const mockItem = { selling_price: '30.00' };
      // Rule for specific corporate client with higher discount
      const mockRule = { markup_percentage: '0', discount_percentage: '20' };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [mockRule] } as any);

      const req = mockRequest({
        inventory_id: 1,
        quantity: 10,
        payer_type: 'corporate',
        payer_id: 1, // Specific corporate client
      });
      const res = mockResponse();

      await calculatePrice(req, res);

      expect(res.json).toHaveBeenCalledWith({
        base_price: 30,
        quantity: 10,
        subtotal: 300,
        markup_percentage: 0,
        markup_amount: 0,
        discount_percentage: 20,
        discount_amount: 60,
        final_price: 240,
      });
    });

    it('should handle category-specific pricing', async () => {
      const mockItem = { selling_price: '15.00', category: 'Antibiotic' };
      const mockRule = { markup_percentage: '5', discount_percentage: '10' };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [mockRule] } as any);

      const req = mockRequest({
        inventory_id: 1,
        quantity: 20,
        payer_type: 'insurance',
        payer_id: 1,
      });
      const res = mockResponse();

      await calculatePrice(req, res);

      // Subtotal: 15 * 20 = 300
      // Markup 5%: 15 (on subtotal)
      // Discount 10%: 30 (on subtotal)
      // Final: 300 + 15 - 30 = 285
      expect(res.json).toHaveBeenCalledWith({
        base_price: 15,
        quantity: 20,
        subtotal: 300,
        markup_percentage: 5,
        markup_amount: 15,
        discount_percentage: 10,
        discount_amount: 30,
        final_price: 285,
      });
    });
  });

  describe('Payer Type Scenarios', () => {
    it('should handle self-pay with zero discount', async () => {
      const mockItem = { selling_price: '100.00' };
      const mockRule = { markup_percentage: '0', discount_percentage: '0' };

      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [mockRule] } as any);

      const req = mockRequest({
        inventory_id: 1,
        quantity: 1,
        payer_type: 'self_pay',
      });
      const res = mockResponse();

      await calculatePrice(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        final_price: 100,
        discount_percentage: 0,
      }));
    });

    it('should differentiate between corporate clients', async () => {
      const mockItem = { selling_price: '50.00' };

      // First client gets 10% discount
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [{ markup_percentage: '0', discount_percentage: '10' }] } as any);

      const req1 = mockRequest({
        inventory_id: 1,
        quantity: 2,
        payer_type: 'corporate',
        payer_id: 1,
      });
      const res1 = mockResponse();

      await calculatePrice(req1, res1);

      expect(res1.json).toHaveBeenCalledWith(expect.objectContaining({
        final_price: 90,
        discount_percentage: 10,
      }));

      vi.clearAllMocks();

      // Second client gets 15% discount
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [{ markup_percentage: '0', discount_percentage: '15' }] } as any);

      const req2 = mockRequest({
        inventory_id: 1,
        quantity: 2,
        payer_type: 'corporate',
        payer_id: 2,
      });
      const res2 = mockResponse();

      await calculatePrice(req2, res2);

      expect(res2.json).toHaveBeenCalledWith(expect.objectContaining({
        final_price: 85,
        discount_percentage: 15,
      }));
    });

    it('should differentiate between insurance providers', async () => {
      const mockItem = { selling_price: '75.00' };

      // Provider 1 gets 15% discount
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [{ markup_percentage: '0', discount_percentage: '15' }] } as any);

      const req1 = mockRequest({
        inventory_id: 1,
        quantity: 4,
        payer_type: 'insurance',
        payer_id: 1,
      });
      const res1 = mockResponse();

      await calculatePrice(req1, res1);

      expect(res1.json).toHaveBeenCalledWith(expect.objectContaining({
        final_price: 255, // 300 - 45
        discount_percentage: 15,
      }));

      vi.clearAllMocks();

      // Provider 2 gets 20% discount
      vi.mocked(pool.query)
        .mockResolvedValueOnce({ rows: [mockItem] } as any)
        .mockResolvedValueOnce({ rows: [{ markup_percentage: '0', discount_percentage: '20' }] } as any);

      const req2 = mockRequest({
        inventory_id: 1,
        quantity: 4,
        payer_type: 'insurance',
        payer_id: 2,
      });
      const res2 = mockResponse();

      await calculatePrice(req2, res2);

      expect(res2.json).toHaveBeenCalledWith(expect.objectContaining({
        final_price: 240, // 300 - 60
        discount_percentage: 20,
      }));
    });
  });
});
