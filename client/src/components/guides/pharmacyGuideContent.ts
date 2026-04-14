import type { GuideSection } from '../DepartmentGuide';

export const pharmacyGuideSections: GuideSection[] = [
  {
    title: 'Orders',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    steps: [
      { title: 'Order Queue', content: 'The Orders tab is your main workspace. Prescriptions from doctors arrive here automatically. The top cards show counts for Pending, In Progress, Dispensed Today, and Low Stock. Orders are grouped by patient encounter.' },
      { title: 'Processing Workflow', content: 'Orders follow a 4-step flow: Pending → In Progress → Ready for Pickup → Dispensed. Use the sub-tabs to switch between each stage. Click "Start" to move a prescription to In Progress, "Mark Ready" when filled, and "Dispense" when the patient picks up.' },
      { title: 'Batch Actions', content: 'You can process all medications for a patient at once using "Start All," "Mark All Ready," or "Dispense All" buttons on the patient group header. Or process individual medications one by one.' },
      { title: 'Edit Prescription', content: 'Click the edit icon on any order to modify the notes, quantity, or instructions before dispensing. Changes are saved to the order record.' },
      { title: 'Print Label', content: 'Click the printer icon to generate a pharmacy label for any medication. The label includes patient name, medication, dosage, frequency, and dispensing instructions.' },
      { title: 'Patient Details', content: 'Click a patient group to see their details in the right sidebar — payer/insurance info, allergies and sensitivities, and current diagnoses. Always check allergies before dispensing.' },
      { title: 'Drug History', content: 'Click the history icon on any patient to view their complete medication history — active medications, past prescriptions, and known allergies. Use this to check for duplications or interactions.' },
      { title: 'Dispensed History', content: 'The "Dispensed" sub-tab shows all completed orders. Use the date range filter to search for specific periods. This is your dispensing audit trail.' },
    ],
  },
  {
    title: 'OTC / Walk-Ins',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    steps: [
      { title: 'Walk-In Queue', content: 'The "OTC / Walk-Ins" tab shows patients routed to the pharmacy for over-the-counter purchases or walk-in prescriptions. These come from the nurse or receptionist routing system.' },
      { title: 'Serving a Walk-In', content: 'Click "Serve" on a pending patient to open the dispensing modal. Search for medications by name, add them to the order with quantity, dosage, and instructions. You can add multiple medications.' },
      { title: 'Prescription Upload', content: 'In the serve modal, you can attach a scanned prescription (photo or PDF). The file is stored in the patient\'s record under Documents → Prescriptions and can be viewed later from any dashboard.' },
      { title: 'Completing the Order', content: 'Click "Complete Order" to dispense all medications, update inventory, and create an invoice. The patient is auto-routed back to the receptionist for payment.' },
    ],
  },
  {
    title: 'Inventory',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    steps: [
      { title: 'Stock Overview', content: 'The Inventory tab shows all medications with current quantity, reorder level, unit price, supplier, and expiry date. Click the stat cards at the top to filter by Low Stock, Expiring Soon, or Expired.' },
      { title: 'Search & Filter', content: 'Search by medication name or generic name. Filter by category using the dropdown. Use the status filter for Low Stock, Expiring, or Expired items.' },
      { title: 'Add New Medication', content: 'Click "Add Item" to create a new inventory entry. Enter the medication name, generic name, category, unit, reorder level, pricing, and supplier.' },
      { title: 'Edit Medication', content: 'Click the edit icon to modify a medication\'s details. The edit modal also shows batch inventory with FEFO (First Expiry First Out) ordering — each batch with its quantity, expiry, and cost.' },
      { title: 'Stock Deductions', content: 'Stock is automatically deducted when you dispense medications through orders or walk-ins. The system uses FEFO to pull from the earliest-expiring batch first.' },
    ],
  },
  {
    title: 'Procurement',
    icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z',
    steps: [
      { title: 'Record Purchase', content: 'Go to the Procurement tab to record incoming stock. Select the medication, enter the quantity received, unit cost, supplier, discount (if any), new selling price, batch/lot number, and expiry date. The system calculates the effective cost and total automatically.' },
      { title: 'Stock Update', content: 'When you record a purchase, the inventory quantity is updated immediately. The batch is tracked separately for FEFO ordering. Cost and selling price are updated if you enter new values.' },
      { title: 'Purchase History', content: 'The bottom of the Procurement tab shows a table of all recent purchases with date, medication, supplier, quantity, unit cost, discount, total, and batch number. Use this for accounting reconciliation and supplier payment tracking.' },
    ],
  },
  {
    title: 'Suppliers',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    steps: [
      { title: 'Manage Suppliers', content: 'The Suppliers tab shows all your medication suppliers — name, contact person, phone, email, and city. Click "Add Supplier" to create a new one.' },
      { title: 'Edit/Delete Supplier', content: 'Use the edit icon to update supplier details, or the delete icon to remove a supplier. Suppliers are referenced in purchase records and inventory items.' },
    ],
  },
  {
    title: 'Pricing',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    steps: [
      { title: 'View Pricing', content: 'The Pricing tab shows all medications with their cost price, selling price, and profit margin. Margins are color-coded: green for healthy margins, yellow for low, red for below-cost.' },
      { title: 'Update Prices', content: 'Click the edit icon on any medication to change its selling price inline. Enter the new price and click save. Cost price is updated through procurement — you can\'t change it directly here.' },
    ],
  },
  {
    title: 'Revenue & Analytics',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    steps: [
      { title: 'Revenue Reports', content: 'The Revenue tab shows dispensing revenue for a selected date range. Set the From/To dates and click "Generate Report" to see total orders, dispensed count, pending count, unique patients, and top 10 medications by volume.' },
      { title: 'Analytics Dashboard', content: 'The Analytics tab provides a visual dashboard of dispensing trends, order volumes, and other pharmacy performance metrics.' },
    ],
  },
];
