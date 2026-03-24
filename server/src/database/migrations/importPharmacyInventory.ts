import { Pool } from 'pg';
import * as XLSX from 'xlsx';
import * as path from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

interface ExcelRow {
  'Item Name': string;
  'Description'?: string;
  'QOH': number;
  'Purchase Cost': number;
  'Total Purchase Cost': number;
  'Default Selling Price': number;
}

function categorizeItem(itemName: string): { category: string; unit: string; requiresPrescription: boolean } {
  const name = itemName.toLowerCase();

  // Determine unit from item name
  let unit = 'unit';
  if (name.includes('tab') || name.includes('caps') || name.includes('caplet')) {
    unit = 'tablet';
  } else if (name.includes('syr') || name.includes('susp') || name.includes('solution') || name.includes('drops')) {
    unit = 'bottle';
  } else if (name.includes('inj') || name.includes('vial') || name.includes('ampoule') || name.includes('amp')) {
    unit = 'vial';
  } else if (name.includes('cream') || name.includes('ointment') || name.includes('gel')) {
    unit = 'tube';
  } else if (name.includes('sachet') || name.includes('powder')) {
    unit = 'sachet';
  } else if (name.includes('spray') || name.includes('inhaler')) {
    unit = 'unit';
  }

  // Determine category
  let category = 'General';
  if (name.includes('paracetamol') || name.includes('ibuprofen') || name.includes('diclofenac') || name.includes('tramadol') || name.includes('morphine') || name.includes('codeine')) {
    category = 'Analgesic';
  } else if (name.includes('amoxicillin') || name.includes('azithro') || name.includes('cipro') || name.includes('metro') || name.includes('doxycycline') || name.includes('ceftriaxone') || name.includes('augmentin') || name.includes('erythro')) {
    category = 'Antibiotic';
  } else if (name.includes('omeprazole') || name.includes('pantoprazole') || name.includes('antacid') || name.includes('ors') || name.includes('loperamide') || name.includes('metoclo')) {
    category = 'Gastrointestinal';
  } else if (name.includes('amlodipine') || name.includes('atenolol') || name.includes('lisinopril') || name.includes('losartan') || name.includes('furosemide') || name.includes('nifedipine')) {
    category = 'Cardiovascular';
  } else if (name.includes('metformin') || name.includes('glibenclamide') || name.includes('insulin') || name.includes('gliclazide')) {
    category = 'Antidiabetic';
  } else if (name.includes('loratadine') || name.includes('cetirizine') || name.includes('chlorpheniramine') || name.includes('promethazine') || name.includes('piriton')) {
    category = 'Antihistamine';
  } else if (name.includes('salbutamol') || name.includes('prednisolone') || name.includes('hydrocortisone') || name.includes('dexamethasone') || name.includes('beclomethasone')) {
    category = 'Respiratory';
  } else if (name.includes('artesunate') || name.includes('artemether') || name.includes('lumefantrine') || name.includes('quinine') || name.includes('coartem') || name.includes('act ') || name.includes('malaria')) {
    category = 'Antimalarial';
  } else if (name.includes('vitamin') || name.includes('vit ') || name.includes('folic') || name.includes('iron') || name.includes('zinc') || name.includes('calcium') || name.includes('b-co') || name.includes('multivit')) {
    category = 'Vitamins & Supplements';
  } else if (name.includes('eye') || name.includes('ophthalmic') || name.includes('ear')) {
    category = 'Eye/Ear Care';
  } else if (name.includes('cream') || name.includes('ointment') || name.includes('lotion') || name.includes('clotrimazole') || name.includes('miconazole') || name.includes('ketoconazole')) {
    category = 'Dermatological';
  } else if (name.includes('diazepam') || name.includes('amitriptyline') || name.includes('fluoxetine') || name.includes('carbamazepine') || name.includes('phenytoin')) {
    category = 'CNS/Neurological';
  } else if (name.includes('cannula') || name.includes('syringe') || name.includes('glove') || name.includes('cotton') || name.includes('bandage') || name.includes('gauze') || name.includes('plaster')) {
    category = 'Medical Supplies';
  } else if (name.includes('water for injection') || name.includes('normal saline') || name.includes('dextrose') || name.includes('ringer')) {
    category = 'IV Fluids';
  }

  // Determine if prescription required
  let requiresPrescription = true;
  if (category === 'Vitamins & Supplements' || category === 'Medical Supplies') {
    requiresPrescription = false;
  }
  if (name.includes('paracetamol') || name.includes('antacid') || name.includes('ors') || name.includes('loratadine') || name.includes('cetirizine')) {
    requiresPrescription = false;
  }

  return { category, unit, requiresPrescription };
}

async function importPharmacyInventory() {
  const client = await pool.connect();

  try {
    // Read Excel file
    const filePath = path.resolve(process.cwd(), 'MEDICS - INVENTORY.xlsx');
    console.log('Reading Excel file from:', filePath);

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<ExcelRow>(sheet);

    console.log(`Found ${data.length} items in Excel file`);

    await client.query('BEGIN');

    // Mark all existing items as inactive instead of deleting
    const deactivated = await client.query(
      `UPDATE pharmacy_inventory SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE is_active = true`
    );
    console.log(`Deactivated ${deactivated.rowCount} existing inventory items`);

    // Clear existing batches for deactivated items
    await client.query(
      `UPDATE inventory_batches SET is_active = false WHERE inventory_id IN (SELECT id FROM pharmacy_inventory WHERE is_active = false)`
    );

    let imported = 0;
    let skipped = 0;

    for (const row of data) {
      const itemName = row['Item Name'];
      if (!itemName || itemName.trim() === '') {
        skipped++;
        continue;
      }

      const description = row['Description'] || itemName;
      const qoh = Math.max(0, Math.round(row['QOH'] || 0));
      const purchaseCost = Math.max(0, row['Purchase Cost'] || 0);
      const sellingPrice = Math.max(0, row['Default Selling Price'] || 0);

      // Skip items with zero selling price (likely errors)
      if (sellingPrice === 0 && purchaseCost === 0) {
        console.log(`  Skipping ${itemName} - no pricing info`);
        skipped++;
        continue;
      }

      const { category, unit, requiresPrescription } = categorizeItem(itemName);

      // Check if item already exists (by name)
      const existing = await client.query(
        `SELECT id FROM pharmacy_inventory WHERE LOWER(medication_name) = LOWER($1)`,
        [itemName.trim()]
      );

      if (existing.rows.length > 0) {
        // Update existing item
        await client.query(
          `UPDATE pharmacy_inventory SET
            generic_name = $1,
            category = $2,
            unit = $3,
            quantity_on_hand = $4,
            unit_cost = $5,
            selling_price = $6,
            requires_prescription = $7,
            is_active = true,
            location = 'Main Pharmacy',
            reorder_level = CASE WHEN $4 > 50 THEN 20 WHEN $4 > 20 THEN 10 ELSE 5 END,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $8`,
          [description, category, unit, qoh, purchaseCost, sellingPrice, requiresPrescription, existing.rows[0].id]
        );
      } else {
        // Insert new item
        await client.query(
          `INSERT INTO pharmacy_inventory
            (medication_name, generic_name, category, unit, quantity_on_hand, reorder_level, unit_cost, selling_price, location, is_active, requires_prescription)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Main Pharmacy', true, $9)`,
          [
            itemName.trim(),
            description,
            category,
            unit,
            qoh,
            qoh > 50 ? 20 : (qoh > 20 ? 10 : 5), // Dynamic reorder level
            purchaseCost,
            sellingPrice,
            requiresPrescription
          ]
        );
      }

      imported++;
    }

    await client.query('COMMIT');

    // Get final stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE is_active = true) as active_items,
        SUM(CASE WHEN is_active = true THEN quantity_on_hand ELSE 0 END) as total_stock,
        SUM(CASE WHEN is_active = true THEN quantity_on_hand * unit_cost ELSE 0 END) as total_value
      FROM pharmacy_inventory
    `);

    const categoryStats = await pool.query(`
      SELECT category, COUNT(*) as count, SUM(quantity_on_hand) as total_qty
      FROM pharmacy_inventory
      WHERE is_active = true
      GROUP BY category
      ORDER BY count DESC
    `);

    console.log('\n========================================');
    console.log('PHARMACY INVENTORY IMPORT COMPLETE');
    console.log('========================================');
    console.log(`Items imported: ${imported}`);
    console.log(`Items skipped: ${skipped}`);
    console.log(`Total active items: ${stats.rows[0].active_items}`);
    console.log(`Total stock units: ${stats.rows[0].total_stock}`);
    console.log(`Total inventory value: GHS ${parseFloat(stats.rows[0].total_value || 0).toFixed(2)}`);
    console.log('\nBy Category:');
    categoryStats.rows.forEach(cat => {
      console.log(`  ${cat.category}: ${cat.count} items (${cat.total_qty} units)`);
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Import failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

importPharmacyInventory().catch(console.error);
