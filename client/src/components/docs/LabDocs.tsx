import React, { useState } from 'react';

const LabDocs: React.FC = () => {
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', label: 'Overview', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'workflow', label: 'Lab Workflow', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'orders', label: 'Processing Orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { id: 'results', label: 'Entering Results', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'critical', label: 'Critical Alerts', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
    { id: 'inventory', label: 'Inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { id: 'qc', label: 'Quality Control', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { id: 'analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ];

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sticky top-4">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Lab Documentation
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
          {activeSection === 'workflow' && <WorkflowSection />}
          {activeSection === 'orders' && <OrdersSection />}
          {activeSection === 'results' && <ResultsSection />}
          {activeSection === 'critical' && <CriticalAlertsSection />}
          {activeSection === 'inventory' && <InventorySection />}
          {activeSection === 'qc' && <QCSection />}
          {activeSection === 'analytics' && <AnalyticsSection />}
        </div>
      </div>
    </div>
  );
};

const OverviewSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Lab Dashboard Overview</h2>

    <div className="prose max-w-none">
      <p className="text-gray-600 mb-6">
        The Laboratory Dashboard is the central hub for managing all laboratory operations in MedSys EMR.
        It provides tools for processing lab orders, entering results, managing inventory, quality control,
        and analytics.
      </p>

      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-primary-900 mb-2">Quick Access: lab@medsys.com</h4>
        <p className="text-primary-800 text-sm">Lab technicians log in with their lab credentials to access this dashboard.</p>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Features</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <FeatureCard
          title="Orders Management"
          description="View, process, and complete lab orders from doctors. Track specimen collection and result entry."
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
        <FeatureCard
          title="Critical Alerts"
          description="Immediate notification of critical and panic values requiring urgent clinical attention."
          icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
        <FeatureCard
          title="Inventory Tracking"
          description="Monitor reagents, supplies, and equipment. Get alerts for low stock and expiring items."
          icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
        <FeatureCard
          title="Quality Control"
          description="Run QC samples, track results, and view Levey-Jennings charts for compliance."
          icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Tabs</h3>
      <ul className="space-y-2 text-gray-600">
        <li className="flex items-start gap-2">
          <span className="font-semibold text-gray-900">Orders:</span> View pending and completed lab orders
        </li>
        <li className="flex items-start gap-2">
          <span className="font-semibold text-gray-900">Inventory:</span> Manage lab supplies and reagents
        </li>
        <li className="flex items-start gap-2">
          <span className="font-semibold text-gray-900">Test Catalog:</span> Configure available tests and pricing
        </li>
        <li className="flex items-start gap-2">
          <span className="font-semibold text-gray-900">Quality Control:</span> QC runs and Levey-Jennings charts
        </li>
        <li className="flex items-start gap-2">
          <span className="font-semibold text-gray-900">Analytics:</span> TAT metrics, volume reports, trends
        </li>
        <li className="flex items-start gap-2">
          <span className="font-semibold text-gray-900">Critical Alerts:</span> Urgent results requiring action
        </li>
      </ul>
    </div>
  </div>
);

const WorkflowSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Lab Workflow</h2>

    <div className="prose max-w-none">
      <p className="text-gray-600 mb-6">
        Understanding the complete lab workflow from order placement to result delivery.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Complete Lab Flow</h3>

      <div className="space-y-4 mb-8">
        <WorkflowStep
          number={1}
          title="Doctor Orders Test"
          description="During a patient encounter, the doctor orders lab tests from the Orders section. Each order includes the test name, priority (STAT, Urgent, Routine), and any special instructions."
          role="Doctor"
        />
        <WorkflowStep
          number={2}
          title="Order Appears in Lab Queue"
          description="The lab order immediately appears in the Lab Dashboard's Orders tab under 'Pending & In Progress'. STAT orders are highlighted in red for immediate attention."
          role="Lab Tech"
        />
        <WorkflowStep
          number={3}
          title="Specimen Collection"
          description="Lab technician collects the specimen from the patient. They generate a specimen ID, select specimen type, and record collection time."
          role="Lab Tech"
        />
        <WorkflowStep
          number={4}
          title="Processing & Analysis"
          description="The specimen is processed and analyzed. The order status changes to 'In Progress' during this phase."
          role="Lab Tech"
        />
        <WorkflowStep
          number={5}
          title="Result Entry"
          description="Lab technician enters the test results. The system automatically checks if results are within normal range or if they trigger critical alerts."
          role="Lab Tech"
        />
        <WorkflowStep
          number={6}
          title="Critical Alert (if applicable)"
          description="If results are outside critical thresholds, an alert is automatically created and appears in the Critical Alerts tab. The ordering provider must acknowledge."
          role="System"
        />
        <WorkflowStep
          number={7}
          title="Results Available"
          description="Once completed, results are immediately available to the ordering doctor in the patient's chart under the Labs section."
          role="Doctor"
        />
      </div>

      <div className="bg-warning-50 border border-amber-200 rounded-lg p-4">
        <h4 className="font-semibold text-amber-900 mb-2">Priority Levels</h4>
        <ul className="text-warning-800 text-sm space-y-1">
          <li><span className="font-semibold text-danger-600">STAT:</span> Emergency - process immediately (target: &lt;1 hour)</li>
          <li><span className="font-semibold text-warning-600">Urgent:</span> High priority - process same day (target: &lt;4 hours)</li>
          <li><span className="font-semibold text-gray-600">Routine:</span> Standard processing (target: &lt;24 hours)</li>
        </ul>
      </div>
    </div>
  </div>
);

const OrdersSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Processing Lab Orders</h2>

    <div className="prose max-w-none">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Viewing Orders</h3>
      <p className="text-gray-600 mb-4">
        The Orders tab displays all lab orders in two sub-tabs:
      </p>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li><strong>Pending & In Progress:</strong> Orders that need attention</li>
        <li><strong>Completed:</strong> Finished orders with results</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Filtering Orders</h3>
      <p className="text-gray-600 mb-4">Use the filter bar to narrow down orders:</p>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li><strong>Search:</strong> Find by patient name, patient number, or test name</li>
        <li><strong>Date Range:</strong> Filter by order date</li>
        <li><strong>Priority:</strong> Show only STAT, Urgent, or Routine orders</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Processing an Order</h3>
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <ol className="list-decimal pl-5 text-gray-700 space-y-3">
          <li>Find the order in the pending list</li>
          <li>Click <strong>"Collect Specimen"</strong> to open the specimen collection modal</li>
          <li>The system auto-generates a specimen ID (e.g., SP20260223-ABC123)</li>
          <li>Select the specimen type from the dropdown</li>
          <li>Add any collection notes if needed</li>
          <li>Click <strong>"Collect Specimen"</strong> to confirm</li>
          <li>The order moves to "In Progress" status</li>
        </ol>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Batch Operations</h3>
      <p className="text-gray-600 mb-4">
        For efficiency, you can select multiple orders using the checkboxes and perform batch operations:
      </p>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li><strong>Start All:</strong> Move all selected orders to "In Progress"</li>
        <li>Select orders by clicking the checkbox next to each order</li>
        <li>Use the batch action bar that appears above the list</li>
      </ul>

      <div className="bg-danger-50 border border-red-200 rounded-lg p-4">
        <h4 className="font-semibold text-red-900 mb-2">STAT Orders</h4>
        <p className="text-danger-800 text-sm">
          STAT orders are highlighted with a red border and background. These require immediate attention
          and should be processed before routine orders.
        </p>
      </div>
    </div>
  </div>
);

const ResultsSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Entering Lab Results</h2>

    <div className="prose max-w-none">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Step-by-Step Result Entry</h3>
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <ol className="list-decimal pl-5 text-gray-700 space-y-3">
          <li>Find the order in the "Pending & In Progress" tab (status should be "In Progress")</li>
          <li>Click the <strong>"Enter Results"</strong> button (document icon)</li>
          <li>The Enter Results modal opens with the patient and test information</li>
          <li>Enter the result value in the text field</li>
          <li>Add any additional notes or comments</li>
          <li>Click <strong>"Complete with Results"</strong> to finalize</li>
        </ol>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Result Format Guidelines</h3>
      <p className="text-gray-600 mb-4">
        Enter results in a clear, structured format. Examples:
      </p>
      <div className="bg-gray-100 rounded-lg p-4 mb-6 font-mono text-sm">
        <p className="mb-2"><strong>CBC Example:</strong></p>
        <pre className="text-gray-700">
WBC: 7.5 x10^9/L (4.5-11.0){'\n'}
RBC: 4.8 x10^12/L (4.2-5.4){'\n'}
Hemoglobin: 14.2 g/dL (12.0-16.0){'\n'}
Hematocrit: 42% (36-46){'\n'}
Platelets: 250 x10^9/L (150-400)
        </pre>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Critical Values</h3>
      <p className="text-gray-600 mb-4">
        When entering results that fall outside critical thresholds:
      </p>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li>The system automatically detects critical values</li>
        <li>A critical alert is created and appears in the Alerts tab</li>
        <li>The ordering provider receives a notification</li>
        <li>Critical values must be acknowledged by a clinician</li>
      </ul>

      <div className="bg-warning-50 border border-amber-200 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-amber-900 mb-2">Best Practices</h4>
        <ul className="text-warning-800 text-sm space-y-1">
          <li>Always double-check values before submitting</li>
          <li>Include units with all numeric values</li>
          <li>Note any specimen quality issues in the comments</li>
          <li>For critical values, call the provider immediately in addition to the system alert</li>
        </ul>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Viewing Completed Results</h3>
      <p className="text-gray-600 mb-4">
        After completion:
      </p>
      <ul className="list-disc pl-5 text-gray-600 space-y-2">
        <li>The order moves to the "Completed" sub-tab</li>
        <li>Results are visible in the order details</li>
        <li>Click the print icon to generate a lab report</li>
        <li>Results appear in the patient's chart for the doctor to review</li>
      </ul>
    </div>
  </div>
);

const CriticalAlertsSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Critical Alerts</h2>

    <div className="prose max-w-none">
      <div className="bg-danger-50 border border-red-200 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-red-900 mb-2">Important</h4>
        <p className="text-danger-800 text-sm">
          Critical alerts represent potentially life-threatening results that require immediate clinical attention.
          These must be acknowledged and acted upon promptly.
        </p>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Types of Critical Alerts</h3>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li><strong className="text-danger-600">Critical High:</strong> Value above the critical high threshold</li>
        <li><strong className="text-danger-600">Critical Low:</strong> Value below the critical low threshold</li>
        <li><strong className="text-danger-600">Panic Value:</strong> Extremely abnormal value requiring emergency response</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Alert Workflow</h3>
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <ol className="list-decimal pl-5 text-gray-700 space-y-3">
          <li>Lab tech enters a result that triggers critical thresholds</li>
          <li>System automatically creates an alert in the Critical Alerts tab</li>
          <li>Alert counter on the tab shows unacknowledged alerts</li>
          <li>Lab tech should <strong>immediately call</strong> the ordering provider</li>
          <li>Provider reviews the result and takes clinical action</li>
          <li>Alert is acknowledged with the provider's name and action taken</li>
        </ol>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Acknowledging Alerts</h3>
      <p className="text-gray-600 mb-4">
        To acknowledge a critical alert:
      </p>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li>Go to the Critical Alerts tab</li>
        <li>Find the unacknowledged alert (highlighted in red)</li>
        <li>Click the <strong>"Acknowledge"</strong> button</li>
        <li>The alert is marked as acknowledged with timestamp</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Monitoring Critical Alerts</h3>
      <p className="text-gray-600 mb-4">
        The dashboard header shows:
      </p>
      <ul className="list-disc pl-5 text-gray-600 space-y-2">
        <li><strong>Critical Pending:</strong> Count of unacknowledged alerts</li>
        <li>Click this stat card to jump directly to the Alerts tab</li>
        <li>Alerts refresh automatically every 30 seconds</li>
      </ul>
    </div>
  </div>
);

const InventorySection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Inventory Management</h2>

    <div className="prose max-w-none">
      <p className="text-gray-600 mb-6">
        Track and manage all laboratory supplies, reagents, and equipment from the Inventory tab.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Categories</h3>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li><strong>Reagents:</strong> Chemical substances used in tests</li>
        <li><strong>Supplies:</strong> Consumables like tubes, swabs, gloves</li>
        <li><strong>Equipment:</strong> Lab instruments and machines</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Dashboard Stats</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-sm text-gray-500">Total Items</div>
          <div className="font-bold text-gray-900">All inventory items</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-3">
          <div className="text-sm text-orange-600">Low Stock</div>
          <div className="font-bold text-orange-700">Items below reorder level</div>
        </div>
        <div className="bg-danger-50 rounded-lg p-3">
          <div className="text-sm text-danger-600">Expiring Soon</div>
          <div className="font-bold text-danger-700">Within 30 days</div>
        </div>
        <div className="bg-warning-50 rounded-lg p-3">
          <div className="text-sm text-warning-600">Calibration Due</div>
          <div className="font-bold text-amber-700">Equipment needing calibration</div>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Managing Inventory</h3>
      <p className="text-gray-600 mb-4">
        From the inventory list, you can:
      </p>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li><strong>Search:</strong> Find items by name</li>
        <li><strong>Filter by type:</strong> Reagent, Supply, or Equipment</li>
        <li><strong>Filter by status:</strong> Low Stock, Expiring Soon, Calibration Due</li>
        <li><strong>Adjust quantity:</strong> Update stock levels</li>
        <li><strong>Edit details:</strong> Modify item information</li>
      </ul>

      <div className="bg-warning-50 border border-amber-200 rounded-lg p-4">
        <h4 className="font-semibold text-amber-900 mb-2">Low Stock Alerts</h4>
        <p className="text-warning-800 text-sm">
          Items are marked as low stock when quantity on hand falls below the reorder level.
          The "Low Stock" count on the main dashboard header links directly to filtered view.
        </p>
      </div>
    </div>
  </div>
);

const QCSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Quality Control</h2>

    <div className="prose max-w-none">
      <p className="text-gray-600 mb-6">
        Quality Control ensures accuracy and reliability of lab results through regular testing with known control samples.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Running QC</h3>
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <ol className="list-decimal pl-5 text-gray-700 space-y-3">
          <li>Click <strong>"Run New QC"</strong> button</li>
          <li>Select the test from the dropdown</li>
          <li>Choose control level (Normal, Low, High)</li>
          <li>Enter the lot number of the control material</li>
          <li>Enter target value and standard deviation (from control insert)</li>
          <li>Enter your measured value</li>
          <li>Review the deviation and status preview</li>
          <li>Click <strong>"Save QC Result"</strong></li>
        </ol>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">QC Status</h3>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li><strong className="text-success-600">Within 2SD (OK):</strong> Result is acceptable</li>
        <li><strong className="text-danger-600">Outside 2SD (Out of Control):</strong> Result needs investigation</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Levey-Jennings Charts</h3>
      <p className="text-gray-600 mb-4">
        The Levey-Jennings chart provides a visual representation of QC performance over time:
      </p>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li>Select a test from the dropdown to view its chart</li>
        <li>The chart shows the last 20 QC runs</li>
        <li><strong>Target line:</strong> Center of the chart (mean)</li>
        <li><strong>+/-2SD lines:</strong> Warning limits (orange)</li>
        <li><strong>+/-3SD lines:</strong> Control limits (red)</li>
        <li><strong>Blue dots:</strong> Results within limits</li>
        <li><strong>Red dots:</strong> Results outside limits</li>
      </ul>

      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-primary-900 mb-2">Interpreting QC Results</h4>
        <ul className="text-primary-800 text-sm space-y-1">
          <li><strong>1-2s rule:</strong> One result outside 2SD - warning, may continue</li>
          <li><strong>1-3s rule:</strong> One result outside 3SD - reject run, investigate</li>
          <li><strong>2-2s rule:</strong> Two consecutive results outside same 2SD - reject</li>
          <li><strong>Trend:</strong> 7+ results on same side of mean - investigate</li>
        </ul>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent QC Runs</h3>
      <p className="text-gray-600">
        The table below the chart shows recent QC runs with:
      </p>
      <ul className="list-disc pl-5 text-gray-600 space-y-2">
        <li>Test name and control level</li>
        <li>Measured value vs target</li>
        <li>Deviation from target</li>
        <li>Pass/Fail status</li>
        <li>Who performed the QC and when</li>
      </ul>
    </div>
  </div>
);

const AnalyticsSection: React.FC = () => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-6">Analytics & Reporting</h2>

    <div className="prose max-w-none">
      <p className="text-gray-600 mb-6">
        The Analytics tab provides insights into lab performance, test volumes, and turnaround times.
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Metrics</h3>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-semibold text-gray-900">Total Tests</h4>
          <p className="text-sm text-gray-600">Count of all tests in the period</p>
        </div>
        <div className="bg-secondary-50 rounded-lg p-4">
          <h4 className="font-semibold text-purple-900">Average TAT</h4>
          <p className="text-sm text-secondary-700">Mean turnaround time across all tests</p>
        </div>
        <div className="bg-danger-50 rounded-lg p-4">
          <h4 className="font-semibold text-red-900">STAT Tests</h4>
          <p className="text-sm text-danger-700">Emergency priority test count</p>
        </div>
        <div className="bg-warning-50 rounded-lg p-4">
          <h4 className="font-semibold text-amber-900">Critical Results</h4>
          <p className="text-sm text-amber-700">Results outside critical limits</p>
        </div>
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Turnaround Time by Priority</h3>
      <p className="text-gray-600 mb-4">
        View average TAT broken down by priority level:
      </p>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li><strong className="text-danger-600">STAT TAT:</strong> Should be under 1 hour</li>
        <li><strong className="text-warning-600">Urgent TAT:</strong> Should be under 4 hours</li>
        <li><strong className="text-gray-600">Routine TAT:</strong> Should be under 24 hours</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Volume by Category</h3>
      <p className="text-gray-600 mb-4">
        Breakdown of test orders by category (Hematology, Chemistry, Microbiology, etc.)
      </p>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Most Ordered Tests</h3>
      <p className="text-gray-600 mb-4">
        Shows the most frequently ordered tests with:
      </p>
      <ul className="list-disc pl-5 text-gray-600 mb-6 space-y-2">
        <li>Order count</li>
        <li>Completed count</li>
        <li>Average TAT for each test</li>
      </ul>

      <h3 className="text-lg font-semibold text-gray-900 mb-4">Exporting Reports</h3>
      <p className="text-gray-600 mb-4">
        Click the "Export CSV" button to download reports:
      </p>
      <ul className="list-disc pl-5 text-gray-600 space-y-2">
        <li><strong>Summary Report:</strong> Overview of all metrics</li>
        <li><strong>All Tests:</strong> Complete test listing</li>
        <li><strong>TAT Report:</strong> Turnaround time analysis</li>
        <li><strong>Volume Report:</strong> Test volume breakdown</li>
        <li><strong>Critical Results:</strong> All critical value incidents</li>
      </ul>
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
          role === 'Lab Tech' ? 'bg-primary-100 text-primary-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {role}
        </span>
      </div>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  </div>
);

export default LabDocs;
