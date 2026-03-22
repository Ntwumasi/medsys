import pool from '../db';

const addMarch22Updates = async () => {
  const updates = [
    {
      title: 'Accountant Dashboard',
      description: 'New Accountant Portal with financial overview, invoices management, aging reports, and Excel export capabilities. Includes summary cards for total billed, collected, and outstanding amounts.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Quick Period Filters',
      description: 'Added quick time period filters (Today, This Week, This Month, This Year, All Time) to Accountant Dashboard for fast date range selection.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Financial Charts',
      description: 'Added visual charts to Accountant Dashboard: Revenue Trend line chart, Revenue by Category pie chart, and Payment Methods bar chart for better financial insights.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'LANCET Price List Integration',
      description: 'Integrated MDS-LANCET standard price list for lab and imaging services. All charges now pulled from the charge master ensuring consistent pricing.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Insurance Claims Workflow',
      description: 'Full insurance claims process with doctor vetting. Claims track coverage limits, used-to-date amounts, and remaining coverage. Doctors review and approve/reject claims before submission. Supports PDF claim form generation for private insurers.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Payment Reminders',
      description: 'New Payment Reminders tab in Accountant Dashboard to track outstanding bills by aging bucket (0-30, 31-60, 61-90, 90+ days). Ability to send reminders to patients with outstanding balances.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Department Finances',
      description: 'Each department (Lab, Pharmacy, Imaging, Nursing) now has a Finances tab in their sidebar showing department-specific revenue with daily/weekly/monthly/yearly views, summary cards, and trend charts.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Revenue Drill-Down',
      description: 'Click any top revenue item in Department Finances to see all individual transactions including patient name, invoice number, date, quantity, and amount.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Loading Skeletons',
      description: 'Replaced loading spinners with smooth skeleton animations across Accountant Dashboard and Department Finances for better user experience during data loading.',
      category: 'improvement',
      status: 'completed',
      version: '1.4.0',
    },
    {
      title: 'Excel Export',
      description: 'Export invoices and financial reports to Excel format directly from the Accountant Dashboard for offline analysis and record keeping.',
      category: 'feature',
      status: 'completed',
      version: '1.4.0',
    },
  ];

  const today = new Date().toISOString().split('T')[0];

  try {
    for (const update of updates) {
      await pool.query(
        `INSERT INTO system_updates (title, description, category, status, version, update_date, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT DO NOTHING`,
        [update.title, update.description, update.category, update.status, update.version, today]
      );
      console.log(`Added: ${update.title}`);
    }
    console.log('\nAll updates added successfully!');
  } catch (error) {
    console.error('Error adding updates:', error);
  } finally {
    await pool.end();
  }
};

addMarch22Updates();
