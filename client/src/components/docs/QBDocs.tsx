import React, { useState } from 'react';

const QBDocs: React.FC = () => {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', label: 'Overview', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'flow', label: 'How It Works', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'cashsales', label: 'Cash Sales Mode', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'receptionist', label: 'For Receptionists', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'accountant', label: 'For Accountants', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { id: 'qbdata', label: 'QB Data Section', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { id: 'payments', label: 'Recording Payments', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'status', label: 'Sync Status', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
    { id: 'troubleshooting', label: 'Troubleshooting', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ];

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sticky top-4">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            QuickBooks Guide
          </h3>
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeSection === section.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={section.icon} />
                </svg>
                {section.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          {activeSection === 'overview' && <OverviewSection />}
          {activeSection === 'flow' && <FlowSection />}
          {activeSection === 'cashsales' && <CashSalesSection />}
          {activeSection === 'receptionist' && <ReceptionistSection />}
          {activeSection === 'accountant' && <AccountantSection />}
          {activeSection === 'qbdata' && <QBDataSection />}
          {activeSection === 'payments' && <PaymentsSection />}
          {activeSection === 'status' && <StatusSection />}
          {activeSection === 'troubleshooting' && <TroubleshootingSection />}
        </div>
      </div>
    </div>
  );
};

const OverviewSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">QuickBooks Integration Overview</h2>

    <div className="prose max-w-none">
      <p className="text-gray-600 mb-6">
        MedSys integrates directly with QuickBooks Desktop. Patient invoices and payments are
        automatically synced to QuickBooks when patients check out - <strong>no more Excel exports/imports needed</strong>.
      </p>

      <div className="bg-success-50 border border-green-200 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-green-900 mb-2">Key Benefits</h4>
        <ul className="text-success-800 text-sm space-y-1">
          <li>No more manual Excel exports/imports</li>
          <li>Data flows directly to QuickBooks</li>
          <li>Real-time sync of invoices and payments</li>
          <li><strong>Cash Sales Mode:</strong> All invoices go to one "Cash Sales" customer (keeps QB clean)</li>
          <li>Full audit trail in MedSys</li>
        </ul>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">What Gets Synced</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <FeatureCard
          title="Customers (Patients)"
          description="Patient records are synced as QuickBooks customers when they checkout."
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <FeatureCard
          title="Invoices"
          description="All encounter invoices are automatically sent to QuickBooks."
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
        <FeatureCard
          title="Payments"
          description="Payments recorded at checkout sync as QuickBooks ReceivePayments."
          icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
        />
        <FeatureCard
          title="Services"
          description="Charge master items can be synced as QuickBooks service items."
          icon="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Access Points</h3>
      <ul className="space-y-2 text-gray-600">
        <li className="flex items-start gap-2">
          <span className="font-semibold text-gray-900">QB Data:</span> View synced data, record payments, monitor sync status
        </li>
        <li className="flex items-start gap-2">
          <span className="font-semibold text-gray-900">QB Settings:</span> Configure connection, manage Web Connector, view logs
        </li>
      </ul>
    </div>
  </div>
);

const FlowSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">How It Works</h2>

    <div className="prose max-w-none">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">The Automatic Sync Flow</h3>

      <div className="space-y-4 mb-8">
        <WorkflowStep
          number={1}
          title="Patient Visit Complete"
          description="Doctor completes the encounter. Patient appears in receptionist's 'Ready for Checkout' queue."
          role="Doctor"
        />
        <WorkflowStep
          number={2}
          title="Receptionist Prints Invoice"
          description="Receptionist clicks 'Print Invoice' to view the charges. At this point, the patient and invoice are automatically queued for QuickBooks sync."
          role="Receptionist"
        />
        <WorkflowStep
          number={3}
          title="Payment Collection"
          description="Receptionist collects payment and clicks 'Paid'. A payment record is created and automatically queued for QuickBooks."
          role="Receptionist"
        />
        <WorkflowStep
          number={4}
          title="Web Connector Syncs"
          description="QuickBooks Web Connector (running on the accountant's PC) polls MedSys every few minutes and syncs pending items to QuickBooks Desktop."
          role="System"
        />
        <WorkflowStep
          number={5}
          title="Data in QuickBooks"
          description="Customer, invoice, and payment appear in QuickBooks Desktop. The accountant can view sync status in MedSys."
          role="Accountant"
        />
      </div>

      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-primary-900 mb-2">Sync Priority</h4>
        <p className="text-primary-800 text-sm mb-2">Items are synced in this order to ensure dependencies:</p>
        <ol className="text-primary-800 text-sm space-y-1 list-decimal list-inside">
          <li><strong>Patients/Customers</strong> (Priority 10) - Must sync first</li>
          <li><strong>Invoices</strong> (Priority 5) - Needs customer to exist</li>
          <li><strong>Payments</strong> (Priority 5) - Needs invoice to exist</li>
        </ol>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">What's Automatic vs Manual</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-gray-900">Action</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-900">Previously</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-900">Now</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-4 py-2">New patient to QB</td>
              <td className="px-4 py-2 text-gray-500">Manual sync</td>
              <td className="px-4 py-2 text-success-600 font-medium">Automatic at checkout</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Invoice to QB</td>
              <td className="px-4 py-2 text-gray-500">Manual sync / Excel</td>
              <td className="px-4 py-2 text-success-600 font-medium">Automatic at checkout</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Payment to QB</td>
              <td className="px-4 py-2 text-gray-500">Manual entry in QB</td>
              <td className="px-4 py-2 text-success-600 font-medium">Automatic when marked paid</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Pending invoice payments</td>
              <td className="px-4 py-2 text-gray-500">Manual entry</td>
              <td className="px-4 py-2 text-primary-600 font-medium">Record in QB Data tab</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

const CashSalesSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Cash Sales Mode</h2>

    <div className="prose max-w-none">
      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-primary-900 mb-2">What is Cash Sales Mode?</h4>
        <p className="text-primary-800 text-sm">
          Cash Sales Mode allows all patient invoices to be assigned to a single "Cash Sales" customer
          in QuickBooks, instead of creating individual customers for each patient. This keeps your
          QuickBooks customer list clean and consolidated.
        </p>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Why Use Cash Sales Mode?</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-success-50 rounded-lg p-4 border border-green-200">
          <h4 className="font-semibold text-success-800 mb-2">Benefits</h4>
          <ul className="text-sm text-success-700 space-y-1">
            <li>Keeps QB customer list clean (no hundreds of patients)</li>
            <li>All revenue tracked under one customer</li>
            <li>Simpler reporting in QuickBooks</li>
            <li>Still have full patient details in MedSys</li>
          </ul>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="font-semibold text-gray-800 mb-2">Best For</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>Clinics with walk-in patients</li>
            <li>Cash-based practices</li>
            <li>Simplified accounting workflows</li>
            <li>Organizations that don't track A/R by patient in QB</li>
          </ul>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h3>

      <div className="space-y-4 mb-6">
        <WorkflowStep
          number={1}
          title="Create Cash Sales Customer in QuickBooks"
          description="In QuickBooks Desktop, create a customer named 'Cash Sales' (or your preferred name). This only needs to be done once."
          role="Accountant"
        />
        <WorkflowStep
          number={2}
          title="Import Customers from QuickBooks"
          description="In MedSys, go to QuickBooks Settings and click 'Import Customers'. This will pull the Cash Sales customer into MedSys."
          role="Accountant"
        />
        <WorkflowStep
          number={3}
          title="Enable Cash Sales Mode"
          description="In QuickBooks Settings, enable 'Use Cash Sales Customer for All Invoices'. The system will automatically link to your Cash Sales customer."
          role="Accountant"
        />
        <WorkflowStep
          number={4}
          title="Invoices Auto-Assign"
          description="All new invoices will automatically be assigned to the Cash Sales customer when synced to QuickBooks. No action needed from staff."
          role="System"
        />
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Setting Up Cash Sales Mode</h3>

      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <ol className="list-decimal pl-5 text-gray-700 space-y-3">
          <li>
            <strong>In QuickBooks Desktop:</strong> Create a new customer called "Cash Sales"
            <p className="text-sm text-gray-500 mt-1">Customers → New Customer → Name: "Cash Sales"</p>
          </li>
          <li>
            <strong>In MedSys:</strong> Go to <strong>QuickBooks Settings</strong> (sidebar)
          </li>
          <li>
            Click <strong>"Import Customers"</strong> to pull customers from QuickBooks
          </li>
          <li>
            Scroll to <strong>Settings</strong> section at the bottom
          </li>
          <li>
            Enable <strong>"Use Cash Sales Customer for All Invoices"</strong>
          </li>
          <li>
            Verify the customer name matches (default: "Cash Sales")
          </li>
          <li>
            Once linked, you'll see the QB Customer ID displayed
          </li>
        </ol>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">What Changes</h3>

      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border border-gray-200 rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-gray-900">Without Cash Sales Mode</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-900">With Cash Sales Mode</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-4 py-2">Each patient synced as QB customer</td>
              <td className="px-4 py-2 text-success-600">All invoices go to "Cash Sales" customer</td>
            </tr>
            <tr>
              <td className="px-4 py-2">QB customer list grows with each patient</td>
              <td className="px-4 py-2 text-success-600">QB customer list stays clean</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Can track A/R per patient in QB</td>
              <td className="px-4 py-2">A/R tracking done in MedSys only</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Invoice shows patient name as customer</td>
              <td className="px-4 py-2">Invoice shows "Cash Sales" as customer</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-warning-50 border border-amber-200 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-amber-900 mb-2">Important Note</h4>
        <p className="text-warning-800 text-sm">
          Cash Sales Mode is <strong>enabled by default</strong>. If you need individual patient tracking
          in QuickBooks, you can disable it in QuickBooks Settings.
        </p>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Troubleshooting</h3>

      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-danger-600 mb-2">"Cash Sales customer not found"</h4>
        <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
          <li>Make sure you created the "Cash Sales" customer in QuickBooks Desktop</li>
          <li>Click "Import Customers" in QuickBooks Settings to pull the customer</li>
          <li>Check that the customer name in MedSys matches exactly</li>
          <li>The system will auto-link once it finds the matching customer</li>
        </ol>
      </div>
    </div>
  </div>
);

const ReceptionistSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">For Receptionists</h2>

    <div className="prose max-w-none">
      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-primary-900 mb-2">Good News!</h4>
        <p className="text-primary-800 text-sm">
          Your workflow stays exactly the same. The QuickBooks sync happens automatically in the background.
        </p>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Checkout Process</h3>

      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <ol className="list-decimal pl-5 text-gray-700 space-y-3">
          <li>View patients in <strong>"Ready for Checkout"</strong> queue</li>
          <li>Click <strong>"Print Invoice"</strong> to view/print the invoice</li>
          <li>Collect payment from patient</li>
          <li>Click <strong>"Paid"</strong> to mark invoice as paid</li>
          <li>Complete checkout</li>
        </ol>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">What Happens Behind the Scenes</h3>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li>When you print the invoice → Patient & invoice are queued for QuickBooks</li>
        <li>When you click "Paid" → Payment is recorded and queued for QuickBooks</li>
        <li><strong>You don't need to do anything extra for QuickBooks!</strong></li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Options at Checkout</h3>

      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border border-gray-200 rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-gray-900">Option</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-900">When to Use</th>
              <th className="px-4 py-2 text-left font-semibold text-gray-900">What Happens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-4 py-2 font-medium text-success-600">Paid</td>
              <td className="px-4 py-2">Patient pays in full</td>
              <td className="px-4 py-2">Invoice marked paid, syncs to QB</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-medium text-warning-600">Defer Payment</td>
              <td className="px-4 py-2">Patient will pay later</td>
              <td className="px-4 py-2">Moves to "Pending Payments" list</td>
            </tr>
            <tr>
              <td className="px-4 py-2 font-medium text-primary-600">Submit to Payer</td>
              <td className="px-4 py-2">Corporate/Insurance patient</td>
              <td className="px-4 py-2">Submitted for billing, syncs to QB</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-warning-50 border border-amber-200 rounded-lg p-4">
        <h4 className="font-semibold text-amber-900 mb-2">Payment Methods</h4>
        <p className="text-warning-800 text-sm">
          Available payment methods: Cash, Card, Mobile Money (MTN, Vodafone, AirtelTigo),
          Bank Transfer, Cheque, Insurance
        </p>
      </div>
    </div>
  </div>
);

const AccountantSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">For Accountants</h2>

    <div className="prose max-w-none">
      <p className="text-gray-600 mb-6">
        As the accountant, you have access to the <strong>QB Data</strong> section where you can
        monitor sync status, view synced data, and record payments for pending invoices.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Accessing QB Data</h3>
      <p className="text-gray-600 mb-4">
        Click <strong>"QB Data"</strong> in the left sidebar to access the QuickBooks data management section.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Key Tasks</h3>

      <div className="space-y-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-primary-500">
          <h4 className="font-semibold text-gray-900 mb-1">1. Monitor Dashboard</h4>
          <p className="text-sm text-gray-600">Check connection status, pending queue items, and recent sync activity.</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-primary-500">
          <h4 className="font-semibold text-gray-900 mb-1">2. Review Sync Status</h4>
          <p className="text-sm text-gray-600">Check which customers, invoices, and payments have synced successfully.</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-primary-500">
          <h4 className="font-semibold text-gray-900 mb-1">3. Record Pending Payments</h4>
          <p className="text-sm text-gray-600">For deferred payments or bank transfers received later, record them in the Invoices tab.</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-primary-500">
          <h4 className="font-semibold text-gray-900 mb-1">4. Handle Sync Errors</h4>
          <p className="text-sm text-gray-600">Re-sync items that failed and investigate any errors.</p>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">What's Automatic Now</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-success-50 rounded-lg p-3 text-center">
          <div className="text-success-600 font-bold text-lg">Patients</div>
          <div className="text-success-800 text-sm">Auto-sync at checkout</div>
        </div>
        <div className="bg-success-50 rounded-lg p-3 text-center">
          <div className="text-success-600 font-bold text-lg">Invoices</div>
          <div className="text-success-800 text-sm">Auto-sync at checkout</div>
        </div>
        <div className="bg-success-50 rounded-lg p-3 text-center">
          <div className="text-success-600 font-bold text-lg">Payments</div>
          <div className="text-success-800 text-sm">Auto-sync when marked paid</div>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">What You Still Do</h3>
      <ul className="list-disc pl-5 text-gray-600 space-y-2">
        <li><strong>Monitor sync status</strong> - Check Dashboard for errors</li>
        <li><strong>Sync older items</strong> - Click "Sync" on items that weren't auto-synced</li>
        <li><strong>Record late payments</strong> - For bank transfers, deferred payments received later</li>
        <li><strong>Handle sync errors</strong> - Re-sync failed items</li>
        <li><strong>Ensure Web Connector is running</strong> - On the Windows PC with QuickBooks</li>
      </ul>
    </div>
  </div>
);

const QBDataSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">QB Data Section</h2>

    <div className="prose max-w-none">
      <p className="text-gray-600 mb-6">
        The QB Data section provides a complete view of all data synced with QuickBooks.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Tabs</h3>

      <div className="space-y-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded text-xs">Dashboard</span>
          </h4>
          <ul className="text-sm text-gray-600 mt-2 space-y-1">
            <li>Connection status with QuickBooks</li>
            <li>Sync statistics (customers, invoices, payments synced)</li>
            <li>Pending queue items count</li>
            <li>Last sync time</li>
          </ul>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded text-xs">Customers</span>
          </h4>
          <ul className="text-sm text-gray-600 mt-2 space-y-1">
            <li>All patients with QB sync status</li>
            <li>Filter by: All, Synced, Not Synced, Pending</li>
            <li>Click row to expand and see details</li>
            <li>Bulk sync multiple customers</li>
            <li>View outstanding balance per customer</li>
          </ul>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded text-xs">Invoices</span>
          </h4>
          <ul className="text-sm text-gray-600 mt-2 space-y-1">
            <li>All invoices with QB sync status</li>
            <li>Filter by: All, Unpaid, Overdue, Synced, Not Synced</li>
            <li>Click row to expand and see line items</li>
            <li>Click "Pay" to record a payment</li>
            <li>Click "Sync" to push invoice to QB</li>
          </ul>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded text-xs">Payments</span>
          </h4>
          <ul className="text-sm text-gray-600 mt-2 space-y-1">
            <li>All recorded payments with QB sync status</li>
            <li>Filter by: Payment method, Date range, Sync status</li>
            <li>View payment details and linked invoice</li>
            <li>See QB transaction ID once synced</li>
          </ul>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded text-xs">Services</span>
          </h4>
          <ul className="text-sm text-gray-600 mt-2 space-y-1">
            <li>Charge master items with QB sync status</li>
            <li>Filter by: Synced, Not Synced</li>
            <li>Click "Sync" to push service as QB Item</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
);

const PaymentsSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Recording Payments</h2>

    <div className="prose max-w-none">
      <p className="text-gray-600 mb-6">
        There are two ways payments are recorded in MedSys:
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">1. At Checkout (Receptionist)</h3>
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <ol className="list-decimal pl-5 text-gray-700 space-y-2">
          <li>Patient completes encounter</li>
          <li>Receptionist views invoice</li>
          <li>Patient pays at front desk</li>
          <li>Receptionist clicks <strong>"Paid"</strong></li>
          <li>Payment is recorded and auto-queued to QB</li>
        </ol>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">2. For Pending Invoices (Accountant)</h3>
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <ol className="list-decimal pl-5 text-gray-700 space-y-2">
          <li>Go to <strong>QB Data → Invoices</strong></li>
          <li>Find the unpaid invoice (filter by "Unpaid")</li>
          <li>Click the <strong>"Pay"</strong> button</li>
          <li>Enter payment details:
            <ul className="list-disc pl-5 mt-1 text-sm">
              <li>Amount (pre-filled with balance)</li>
              <li>Payment Method</li>
              <li>Reference Number (e.g., bank transfer ref)</li>
              <li>Notes (optional)</li>
            </ul>
          </li>
          <li>Click <strong>"Record Payment"</strong></li>
          <li>Payment is saved and auto-queued to QB</li>
        </ol>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-6">
        <div className="bg-success-50 rounded p-2 text-center text-sm text-success-700">Cash</div>
        <div className="bg-primary-50 rounded p-2 text-center text-sm text-primary-700">Card</div>
        <div className="bg-warning-50 rounded p-2 text-center text-sm text-warning-700">Mobile Money</div>
        <div className="bg-secondary-50 rounded p-2 text-center text-sm text-secondary-700">Bank Transfer</div>
        <div className="bg-gray-100 rounded p-2 text-center text-sm text-gray-700">Cheque</div>
        <div className="bg-accent-50 rounded p-2 text-center text-sm text-accent-700">Insurance</div>
      </div>

      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
        <h4 className="font-semibold text-primary-900 mb-2">Partial Payments</h4>
        <p className="text-primary-800 text-sm">
          You can record partial payments. The invoice status will change to "Partial" and
          the remaining balance will be shown. When fully paid, status changes to "Paid".
        </p>
      </div>
    </div>
  </div>
);

const StatusSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Sync Status Indicators</h2>

    <div className="prose max-w-none">
      <p className="text-gray-600 mb-6">
        Throughout the QB Data section, you'll see status badges indicating the sync state of each item.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Badges</h3>

      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
          <span className="px-3 py-1 bg-success-100 text-success-700 rounded-full text-sm font-medium">Synced</span>
          <span className="text-gray-600">Item exists in QuickBooks and is up to date</span>
        </div>
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
          <span className="px-3 py-1 bg-warning-100 text-warning-700 rounded-full text-sm font-medium">Pending</span>
          <span className="text-gray-600">Item is in the queue, waiting for Web Connector to sync</span>
        </div>
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
          <span className="px-3 py-1 bg-danger-100 text-danger-700 rounded-full text-sm font-medium">Error</span>
          <span className="text-gray-600">Sync failed - needs investigation and re-sync</span>
        </div>
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
          <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">Not Synced</span>
          <span className="text-gray-600">Item has not been queued for sync yet</span>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Connection Status</h3>

      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 bg-success-500 rounded-full"></span>
            <span className="font-medium text-gray-900">Connected</span>
          </span>
          <span className="text-gray-600">Web Connector is active and syncing</span>
        </div>
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 bg-danger-500 rounded-full"></span>
            <span className="font-medium text-gray-900">Disconnected</span>
          </span>
          <span className="text-gray-600">Web Connector is not running or has connection issues</span>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Sync Queue</h3>
      <p className="text-gray-600 mb-4">
        The Dashboard shows the number of pending queue items. These are items waiting for
        the Web Connector to process.
      </p>
      <ul className="list-disc pl-5 text-gray-600 space-y-2">
        <li>Items are processed in priority order (patients first, then invoices, then payments)</li>
        <li>Web Connector polls every few minutes</li>
        <li>Failed items remain in queue for retry</li>
      </ul>
    </div>
  </div>
);

const TroubleshootingSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Troubleshooting</h2>

    <div className="prose max-w-none">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Common Issues</h3>

      <div className="space-y-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-danger-600 mb-2">Invoice Not Syncing</h4>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Check if the patient/customer is synced first (QB needs customer before invoice)</li>
            <li>Go to QB Data → Customers, find the patient, click "Sync"</li>
            <li>Then go to Invoices and click "Sync" on the invoice</li>
            <li>Check QB Settings → Sync Queue for any error messages</li>
          </ol>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-danger-600 mb-2">Payment Not in QuickBooks</h4>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Verify payment was recorded in MedSys (QB Data → Payments)</li>
            <li>Check if Web Connector is running on the Windows PC</li>
            <li>Check QB Data Dashboard for connection status</li>
            <li>Wait for next sync cycle (every few minutes)</li>
          </ol>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-danger-600 mb-2">Web Connector Not Working</h4>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Ensure QuickBooks Desktop is open on the Windows PC</li>
            <li>Restart the Web Connector application</li>
            <li>Check that credentials match (QB Settings → Web Connector section)</li>
            <li>Re-download the .qwc file if needed</li>
          </ol>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-danger-600 mb-2">Dashboard Shows "Disconnected"</h4>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Check internet connection on the Windows PC</li>
            <li>Ensure Web Connector is running</li>
            <li>Try manually running Web Connector sync</li>
            <li>Contact IT if issue persists</li>
          </ol>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-danger-600 mb-2">Sync Errors</h4>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Check the error message in the sync queue</li>
            <li>Common issues: duplicate customer name, missing required fields</li>
            <li>Fix the issue in MedSys if possible</li>
            <li>Click "Retry" or "Sync" again</li>
          </ol>
        </div>
      </div>

      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
        <h4 className="font-semibold text-primary-900 mb-2">Need More Help?</h4>
        <p className="text-primary-800 text-sm">
          For technical issues with the QuickBooks integration, contact IT support.
          Have ready: the item that failed to sync, any error messages, and the time the issue occurred.
        </p>
      </div>
    </div>
  </div>
);

// Helper Components
const FeatureCard: React.FC<{ title: string; description: string; icon: string }> = ({ title, description, icon }) => (
  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
    <div className="flex items-start gap-3">
      <div className="bg-primary-100 p-2 rounded-lg flex-shrink-0">
        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <div>
        <h4 className="font-semibold text-gray-900">{title}</h4>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </div>
    </div>
  </div>
);

const WorkflowStep: React.FC<{ number: number; title: string; description: string; role: string }> = ({ number, title, description, role }) => (
  <div className="flex gap-4">
    <div className="flex-shrink-0">
      <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-sm">
        {number}
      </div>
    </div>
    <div className="flex-1 pb-4 border-b border-gray-200">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          role === 'Doctor' ? 'bg-secondary-100 text-secondary-700' :
          role === 'Receptionist' ? 'bg-success-100 text-success-700' :
          role === 'Accountant' ? 'bg-primary-100 text-primary-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {role}
        </span>
      </div>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  </div>
);

export default QBDocs;
