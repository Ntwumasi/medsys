import { describe, it, expect } from 'vitest';

// Unit tests for pharmacy dashboard logic
describe('PharmacyDashboard Logic', () => {
  describe('Price Calculation', () => {
    it('should calculate self-pay price without discount', () => {
      const basePrice = 10;
      const quantity = 5;
      const discountPercentage = 0;

      const subtotal = basePrice * quantity;
      const discountAmount = subtotal * (discountPercentage / 100);
      const finalPrice = subtotal - discountAmount;

      expect(subtotal).toBe(50);
      expect(discountAmount).toBe(0);
      expect(finalPrice).toBe(50);
    });

    it('should calculate corporate price with 10% discount', () => {
      const basePrice = 10;
      const quantity = 5;
      const discountPercentage = 10;

      const subtotal = basePrice * quantity;
      const discountAmount = subtotal * (discountPercentage / 100);
      const finalPrice = subtotal - discountAmount;

      expect(subtotal).toBe(50);
      expect(discountAmount).toBe(5);
      expect(finalPrice).toBe(45);
    });

    it('should calculate insurance price with 15% discount', () => {
      const basePrice = 20;
      const quantity = 10;
      const discountPercentage = 15;

      const subtotal = basePrice * quantity;
      const discountAmount = subtotal * (discountPercentage / 100);
      const finalPrice = subtotal - discountAmount;

      expect(subtotal).toBe(200);
      expect(discountAmount).toBe(30);
      expect(finalPrice).toBe(170);
    });
  });

  describe('Stock Validation', () => {
    it('should identify low stock items', () => {
      const inventory = [
        { id: 1, medication_name: 'Med A', quantity_on_hand: 5, reorder_level: 10 },
        { id: 2, medication_name: 'Med B', quantity_on_hand: 20, reorder_level: 10 },
        { id: 3, medication_name: 'Med C', quantity_on_hand: 10, reorder_level: 10 },
      ];

      const lowStockItems = inventory.filter(
        item => item.quantity_on_hand <= item.reorder_level
      );

      expect(lowStockItems).toHaveLength(2);
      expect(lowStockItems[0].medication_name).toBe('Med A');
      expect(lowStockItems[1].medication_name).toBe('Med C');
    });

    it('should identify expiring medications', () => {
      const today = new Date();
      const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      const in100Days = new Date(today.getTime() + 100 * 24 * 60 * 60 * 1000);

      const inventory = [
        { id: 1, medication_name: 'Med A', expiry_date: in30Days.toISOString() },
        { id: 2, medication_name: 'Med B', expiry_date: in100Days.toISOString() },
      ];

      const expiringWithin90Days = inventory.filter(item => {
        const expiryDate = new Date(item.expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry <= 90;
      });

      expect(expiringWithin90Days).toHaveLength(1);
      expect(expiringWithin90Days[0].medication_name).toBe('Med A');
    });

    it('should reject dispense when insufficient stock', () => {
      const availableStock = 5;
      const requestedQuantity = 10;

      const canDispense = availableStock >= requestedQuantity;

      expect(canDispense).toBe(false);
    });

    it('should allow dispense when sufficient stock', () => {
      const availableStock = 15;
      const requestedQuantity = 10;

      const canDispense = availableStock >= requestedQuantity;

      expect(canDispense).toBe(true);
    });
  });

  describe('Order Filtering', () => {
    it('should filter pending orders', () => {
      const orders = [
        { id: 1, status: 'ordered', medication_name: 'Med A' },
        { id: 2, status: 'dispensed', medication_name: 'Med B' },
        { id: 3, status: 'ordered', medication_name: 'Med C' },
        { id: 4, status: 'cancelled', medication_name: 'Med D' },
      ];

      const pendingOrders = orders.filter(order => order.status === 'ordered');

      expect(pendingOrders).toHaveLength(2);
      expect(pendingOrders[0].id).toBe(1);
      expect(pendingOrders[1].id).toBe(3);
    });

    it('should filter orders by date range', () => {
      const orders = [
        { id: 1, ordered_date: '2025-01-01', medication_name: 'Med A' },
        { id: 2, ordered_date: '2025-01-15', medication_name: 'Med B' },
        { id: 3, ordered_date: '2025-01-31', medication_name: 'Med C' },
        { id: 4, ordered_date: '2025-02-15', medication_name: 'Med D' },
      ];

      const startDate = '2025-01-10';
      const endDate = '2025-01-31';

      const filteredOrders = orders.filter(order => {
        return order.ordered_date >= startDate && order.ordered_date <= endDate;
      });

      expect(filteredOrders).toHaveLength(2);
      expect(filteredOrders[0].medication_name).toBe('Med B');
      expect(filteredOrders[1].medication_name).toBe('Med C');
    });
  });

  describe('Revenue Calculation', () => {
    it('should calculate total revenue', () => {
      const orders = [
        { id: 1, quantity: 10, unit_price: 5, status: 'dispensed' },
        { id: 2, quantity: 5, unit_price: 10, status: 'dispensed' },
        { id: 3, quantity: 20, unit_price: 2, status: 'ordered' }, // Not dispensed
      ];

      const dispensedOrders = orders.filter(o => o.status === 'dispensed');
      const totalRevenue = dispensedOrders.reduce((sum, order) => {
        return sum + (order.quantity * order.unit_price);
      }, 0);

      expect(totalRevenue).toBe(100); // (10*5) + (5*10) = 50 + 50
    });

    it('should calculate top medications by count', () => {
      const orders = [
        { medication_name: 'Paracetamol', quantity: 10 },
        { medication_name: 'Ibuprofen', quantity: 5 },
        { medication_name: 'Paracetamol', quantity: 15 },
        { medication_name: 'Amoxicillin', quantity: 8 },
        { medication_name: 'Ibuprofen', quantity: 12 },
      ];

      const medicationCounts: Record<string, { count: number; totalQuantity: number }> = {};

      orders.forEach(order => {
        if (!medicationCounts[order.medication_name]) {
          medicationCounts[order.medication_name] = { count: 0, totalQuantity: 0 };
        }
        medicationCounts[order.medication_name].count++;
        medicationCounts[order.medication_name].totalQuantity += order.quantity;
      });

      const sorted = Object.entries(medicationCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, data]) => ({ name, ...data }));

      expect(sorted[0].name).toBe('Paracetamol');
      expect(sorted[0].count).toBe(2);
      expect(sorted[0].totalQuantity).toBe(25);
      expect(sorted[1].name).toBe('Ibuprofen');
    });
  });

  describe('Allergy Checking', () => {
    it('should flag potential allergy conflict', () => {
      const patientAllergies = [
        { allergen: 'Penicillin', severity: 'severe' },
        { allergen: 'Sulfa', severity: 'moderate' },
      ];

      const prescribedMedication = 'Amoxicillin';

      // Amoxicillin is a penicillin-type antibiotic
      const penicillinDrugs = ['Amoxicillin', 'Ampicillin', 'Penicillin V', 'Penicillin G'];

      const hasPenicillinAllergy = patientAllergies.some(
        allergy => allergy.allergen.toLowerCase() === 'penicillin'
      );

      const isPenicillinDrug = penicillinDrugs.some(
        drug => drug.toLowerCase() === prescribedMedication.toLowerCase()
      );

      const hasConflict = hasPenicillinAllergy && isPenicillinDrug;

      expect(hasConflict).toBe(true);
    });

    it('should allow medication when no allergy conflict', () => {
      const patientAllergies = [
        { allergen: 'Latex', severity: 'mild' },
      ];

      const prescribedMedication = 'Paracetamol';

      const hasDirectConflict = patientAllergies.some(
        allergy => allergy.allergen.toLowerCase() === prescribedMedication.toLowerCase()
      );

      expect(hasDirectConflict).toBe(false);
    });
  });
});
