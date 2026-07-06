import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Appointment, ApiError } from '../types';
import { format } from 'date-fns';
import apiClient from '../api/client';
import PrintableInvoice from '../components/PrintableInvoice';
import SystemUpdates from '../components/SystemUpdates';
import AppLayout from '../components/AppLayout';
import DoctorRevenuePanel from '../components/DoctorRevenuePanel';
import LoginActivityPanel from '../components/LoginActivityPanel';
import DashboardHeader from '../components/DashboardHeader';
import AppSelect from '../components/ui/AppSelect';
import NumberTicker from '../components/ui/NumberTicker';
import InsightCard from '../components/ui/InsightCard';
import Sparkline, { type SparkPoint } from '../components/ui/Sparkline';
import Delta from '../components/ui/Delta';
import LabDocs from '../components/docs/LabDocs';
import QBDocs from '../components/docs/QBDocs';
import { useNotification } from '../context/NotificationContext';
import { useDialog } from '../context/DialogContext';
import { TableRowSkeleton } from '../components/Skeleton';
import {
  summarizeAudit,
  buildAuditChangeSet,
  auditChangePreview,
} from '../utils/audit';
import {
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  Box,
  Chip,
  TextField,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  Clear as ClearIcon,
  Search as SearchIcon,
} from '@mui/icons-material';

interface CorporateClient {
  id: number;
  name: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  assigned_doctor_id?: number;
  assigned_doctor_name?: string;
}

interface InsuranceProvider {
  id: number;
  name: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
}

interface DashboardInvoice {
  id: number;
  invoice_number: string;
  encounter_id: number;
  total_amount: number;
  status: string;
  created_at: string;
  invoice_date?: string;
  chief_complaint?: string;
  total?: string;
}

interface DashboardPatient {
  id: number;
  patient_number: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

interface DashboardInvoiceData {
  id: number;
  invoice_number: string;
  invoice_date: string;
  patient_number: string;
  patient_name: string;
  patient_email?: string;
  patient_phone?: string;
  patient_address?: string;
  patient_city?: string;
  patient_state?: string;
  subtotal: number;
  tax: number;
  total_amount: number;
  amount_paid: number;
  status: string;
  chief_complaint?: string;
  encounter_date?: string;
}

interface DashboardInvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface DashboardPayerSource {
  id: number;
  payer_type: string;
  corporate_client_name?: string;
  insurance_provider_name?: string;
  is_primary: boolean;
}

interface Doctor {
  id: number;
  first_name: string;
  last_name: string;
  role?: string;
}

interface StaffMember {
  id: number;
  username: string;
  email?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: string;
  is_active: boolean;
  created_at?: string;
}

interface StaffFormData {
  email: string;
  password: string;
  role: string;
  first_name: string;
  last_name: string;
  phone: string;
  clinic?: string;
}

interface PastPatientEncounter {
  id: number;
  patient_name: string;
  patient_number: string;
  gender?: string;
  encounter_number: string;
  encounter_date: string;
  clinic?: string;
  provider_name?: string;
}

// Single style for every stat card on the admin landing. Color is
// reserved for the number itself — surface stays neutral so the cards
// read as data, not decoration.
type AdminStatAccent = 'neutral' | 'primary' | 'warning' | 'danger' | 'success';
const ADMIN_ACCENT: Record<AdminStatAccent, { num: string; ring: string; iconBg: string; iconFg: string; chip: string }> = {
  neutral: { num: 'text-text-primary', ring: 'ring-gray-200/60', iconBg: 'bg-gray-100', iconFg: 'text-gray-500', chip: 'bg-gray-100 text-gray-600' },
  primary: { num: 'text-primary-700', ring: 'ring-primary-200/60', iconBg: 'bg-primary-100', iconFg: 'text-primary-600', chip: 'bg-primary-100 text-primary-700' },
  warning: { num: 'text-warning-700', ring: 'ring-warning-200/60', iconBg: 'bg-warning-100', iconFg: 'text-warning-600', chip: 'bg-warning-100 text-warning-700' },
  danger:  { num: 'text-danger-700',  ring: 'ring-danger-200/60',  iconBg: 'bg-danger-100',  iconFg: 'text-danger-600',  chip: 'bg-danger-100 text-danger-700'  },
  success: { num: 'text-success-700', ring: 'ring-success-200/60', iconBg: 'bg-success-100', iconFg: 'text-success-600', chip: 'bg-success-100 text-success-700' },
};

interface AdminStatCardProps {
  label: string;
  value: number;
  accent: AdminStatAccent;
  hint?: string;
  icon: React.ReactNode;
  onClick: () => void;
  series?: SparkPoint[];
  trendDirection?: 'up-is-good' | 'up-is-bad';
}

const AdminStatCard: React.FC<AdminStatCardProps> = ({ label, value, accent, hint, icon, onClick, series, trendDirection = 'up-is-good' }) => {
  const a = ADMIN_ACCENT[accent];
  return (
    <button
      onClick={onClick}
      className={`group text-left bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:ring-1 transition-all p-4 ${a.ring}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">{label}</span>
        <span className={`w-9 h-9 rounded-lg ${a.iconBg} ${a.iconFg} flex items-center justify-center`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
        </span>
      </div>
      <div className={`text-3xl font-bold tabular-nums ${a.num}`}>
        <NumberTicker value={value} />
      </div>
      {series && series.length > 1 && (
        <div className={`flex items-center gap-2 mt-1.5 ${a.num}`}>
          <Sparkline data={series} />
          <Delta series={series.map((p) => p.value)} direction={trendDirection} />
        </div>
      )}
      {hint && <p className="text-xs text-text-secondary mt-1">{hint}</p>}
    </button>
  );
};

const Dashboard: React.FC = () => {
  const { user, impersonateUser, impersonation, activeRole } = useAuth();
  // Office Manager = curated admin view: hides system/oversight sections
  // (audit, login records, system updates, docs). Triggered by the super-admin
  // "Office Manager" switcher or a real admin-role user labelled Office Manager.
  const effectiveRole = user?.is_super_admin && activeRole ? activeRole : user?.role;
  // Office Manager is now a real role with the SAME permissions and view as admin —
  // only the label differs. (It used to be a curated subset; that's been dropped.)
  const isOfficeManager = effectiveRole === 'office_manager';
  // A super admin viewing the admin role is technically logged in as the
  // demo admin user, so user.is_super_admin is false here. Fall back to the
  // original session's flag so the "Login As" affordance still appears
  // (same pattern as SuperAdminRoleSwitcher).
  const canImpersonate =
    user?.is_super_admin || impersonation.originalUser?.is_super_admin;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useNotification();
  const { confirm: confirmDialog } = useDialog();
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPastAppointments, setLoadingPastAppointments] = useState(false);
  type AdminTab = 'appointments' | 'corporate' | 'insurance' | 'invoices' | 'staff' | 'updates' | 'pastPatients' | 'docs' | 'audit' | 'logins' | 'charges' | 'revenue' | 'tasks' | 'reports';
  const [activeTab, setActiveTab] = useState<AdminTab>('tasks');

  // Staff activity report (super-admin only)
  const [reportPeriod, setReportPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportAiLoading, setReportAiLoading] = useState(false);

  const fetchStaffReport = async (withAi = false) => {
    if (withAi) setReportAiLoading(true); else setReportLoading(true);
    try {
      const res = await apiClient.get(`/admin/reports/staff-activity?period=${reportPeriod}&date=${reportDate}${withAi ? '&ai=1' : ''}`);
      setReportData(res.data);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to load report', 'error');
    } finally {
      setReportLoading(false); setReportAiLoading(false);
    }
  };

  // Refetch the report when the period/date changes (while the tab is open)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeTab === 'reports') fetchStaffReport(false); }, [reportPeriod, reportDate]);

  // Sidebar nav items deep-link into a tab via /dashboard?view=<tab>.
  // Reacting here lets the left nav drive the activeTab without each
  // sidebar entry needing its own page route.
  useEffect(() => {
    const view = searchParams.get('view');
    const validTabs: AdminTab[] = [
      'appointments', 'corporate', 'insurance', 'invoices', 'staff',
      'updates', 'pastPatients', 'docs', 'audit', 'logins', 'charges',
      'revenue', 'tasks',
    ];
    if (view && (validTabs as string[]).includes(view)) {
      setActiveTab(view as AdminTab);
    }
  }, [searchParams]);

  // ---- Admin clinic-ops Tasks state ----
  interface AdminTask {
    id: number;
    category: string;
    task: string;
    contact_person: string | null;
    responsibility: string | null;
    status: 'pending' | 'in_progress' | 'complete' | 'blocked';
    remarks: string | null;
    cost: string | null;
    due_date: string | null;
  }
  const [adminTasks, setAdminTasks] = useState<AdminTask[]>([]);
  const [adminTasksCounts, setAdminTasksCounts] = useState<Record<string, number>>({});

  // 30-day trends for the admin stat cards' sparklines.
  const [adminTrends, setAdminTrends] = useState<{
    tasks_created: SparkPoint[];
    tasks_completed: SparkPoint[];
    appointments: SparkPoint[];
  } | null>(null);

  useEffect(() => {
    apiClient
      .get('/admin/trends?days=30')
      .then((res) => {
        const s = res.data.series;
        const map = (arr: Array<{ day: string; value: number }>): SparkPoint[] =>
          arr.map((p) => ({ label: p.day, value: p.value }));
        setAdminTrends({
          tasks_created: map(s.tasks_created),
          tasks_completed: map(s.tasks_completed),
          appointments: map(s.appointments),
        });
      })
      .catch((err) => console.error('Failed to load admin trends:', err));
  }, []);

  const [adminTasksLoading, setAdminTasksLoading] = useState(false);
  const [adminTasksStatusFilter, setAdminTasksStatusFilter] = useState<string>('all');
  const [editingTask, setEditingTask] = useState<AdminTask | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const blankTaskForm = {
    category: '',
    task: '',
    contact_person: '',
    responsibility: '',
    status: 'pending' as AdminTask['status'],
    remarks: '',
    cost: '',
    due_date: '',
  };
  const [taskForm, setTaskForm] = useState<typeof blankTaskForm>(blankTaskForm);

  const loadAdminTasks = async () => {
    setAdminTasksLoading(true);
    try {
      const params = adminTasksStatusFilter !== 'all' ? { status: adminTasksStatusFilter } : {};
      const res = await apiClient.get('/admin/tasks', { params });
      setAdminTasks(res.data.tasks || []);
      setAdminTasksCounts(res.data.counts || {});
    } catch (err) {
      console.error('Error loading admin tasks:', err);
    } finally {
      setAdminTasksLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'tasks') loadAdminTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, adminTasksStatusFilter]);

  const openCreateTask = () => {
    setEditingTask(null);
    setTaskForm(blankTaskForm);
    setShowTaskModal(true);
  };
  const openEditTask = (t: AdminTask) => {
    setEditingTask(t);
    setTaskForm({
      category: t.category,
      task: t.task,
      contact_person: t.contact_person || '',
      responsibility: t.responsibility || '',
      status: t.status,
      remarks: t.remarks || '',
      cost: t.cost || '',
      due_date: t.due_date ? t.due_date.slice(0, 10) : '',
    });
    setShowTaskModal(true);
  };

  const saveTask = async () => {
    if (!taskForm.category || !taskForm.task) {
      alert('Category and Task are required.');
      return;
    }
    const payload = {
      ...taskForm,
      // backend treats '' as null
      contact_person: taskForm.contact_person || null,
      responsibility: taskForm.responsibility || null,
      remarks: taskForm.remarks || null,
      cost: taskForm.cost || null,
      due_date: taskForm.due_date || null,
    };
    try {
      if (editingTask) {
        await apiClient.put(`/admin/tasks/${editingTask.id}`, payload);
      } else {
        await apiClient.post('/admin/tasks', payload);
      }
      setShowTaskModal(false);
      loadAdminTasks();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save task');
    }
  };

  const inlineUpdateStatus = async (taskId: number, status: AdminTask['status']) => {
    try {
      await apiClient.put(`/admin/tasks/${taskId}`, { status });
      loadAdminTasks();
    } catch (_) { /* ignore */ }
  };

  const inlineUpdateDueDate = async (taskId: number, due_date: string) => {
    try {
      await apiClient.put(`/admin/tasks/${taskId}`, { due_date: due_date || null });
      loadAdminTasks();
    } catch (_) { /* ignore */ }
  };

  const deleteTask = async (taskId: number) => {
    if (!(await confirmDialog({ title: 'Delete task?', message: 'This cannot be undone.', variant: 'warning', confirmLabel: 'Delete', cancelLabel: 'Cancel' }))) return;
    try {
      await apiClient.delete(`/admin/tasks/${taskId}`);
      loadAdminTasks();
    } catch (_) { /* ignore */ }
  };

  // ---- Single flat list: per-column filters + sortable headers ----
  // Tasks render as one big list (no category sections). Default ordering puts
  // the soonest deadline on top; completed tasks always sink to the bottom.
  type TaskSortKey = 'task' | 'category' | 'contact_person' | 'responsibility' | 'status' | 'cost' | 'due_date' | 'remarks';
  const blankTaskFilters = { task: '', category: '', contact_person: '', responsibility: '', status: '', cost: '', remarks: '' };
  const [taskFilters, setTaskFilters] = useState<typeof blankTaskFilters>(blankTaskFilters);
  // null sort = default smart ordering (deadline asc, completed last)
  const [taskSort, setTaskSort] = useState<{ key: TaskSortKey; dir: 'asc' | 'desc' } | null>(null);

  const cycleTaskSort = (key: TaskSortKey) => {
    setTaskSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null; // third click clears back to default
    });
  };

  const displayedTasks = useMemo(() => {
    const f = taskFilters;
    const matches = (val: string | null, q: string) => (val || '').toLowerCase().includes(q.toLowerCase());
    const list = adminTasks.filter(t => (
      (!f.task || matches(t.task, f.task)) &&
      (!f.category || matches(t.category, f.category)) &&
      (!f.contact_person || matches(t.contact_person, f.contact_person)) &&
      (!f.responsibility || matches(t.responsibility, f.responsibility)) &&
      (!f.cost || matches(t.cost, f.cost)) &&
      (!f.remarks || matches(t.remarks, f.remarks)) &&
      (!f.status || t.status === f.status)
    ));
    const dateKey = (t: AdminTask) => (t.due_date ? t.due_date.slice(0, 10) : '');
    return [...list].sort((a, b) => {
      // Completed always sinks to the bottom, regardless of sort.
      const ac = a.status === 'complete' ? 1 : 0;
      const bc = b.status === 'complete' ? 1 : 0;
      if (ac !== bc) return ac - bc;

      if (taskSort) {
        const { key, dir } = taskSort;
        const mul = dir === 'asc' ? 1 : -1;
        if (key === 'due_date') {
          const ad = dateKey(a), bd = dateKey(b);
          if (!ad && bd) return 1;        // blanks always last
          if (ad && !bd) return -1;
          if (ad !== bd) return ad.localeCompare(bd) * mul;
        } else {
          const av = (a[key] || '').toString().toLowerCase();
          const bv = (b[key] || '').toString().toLowerCase();
          if (av !== bv) return av.localeCompare(bv) * mul;
        }
        return a.id - b.id;
      }

      // Default: soonest deadline first, blanks last, then by id.
      const ad = dateKey(a), bd = dateKey(b);
      if (!ad && bd) return 1;
      if (ad && !bd) return -1;
      if (ad !== bd) return ad.localeCompare(bd);
      return a.id - b.id;
    });
  }, [adminTasks, taskFilters, taskSort]);

  const taskFiltersActive = Object.values(taskFilters).some(Boolean);

  const [charges, setCharges] = useState<Array<{ id: number; service_name: string; service_code: string; category: string; price: string; description: string; is_active: boolean; payer_price?: string | null; payer_excluded?: boolean }>>([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargeSearch, setChargeSearch] = useState('');
  const [chargeCategoryFilter, setChargeCategoryFilter] = useState('all');
  const [editingCharge, setEditingCharge] = useState<typeof charges[0] | null>(null);
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [newCharge, setNewCharge] = useState({ service_name: '', service_code: '', category: 'consultation', price: '', description: '' });
  const [chargesPage, setChargesPage] = useState(1);
  const chargesPerPage = 20;
  const [payers, setPayers] = useState<Array<{ id: number; name: string; payer_type: string }>>([]);
  const [selectedPayerFilter, setSelectedPayerFilter] = useState('cash');
  const [editPayerPrices, setEditPayerPrices] = useState<Array<{ payer_type: string; insurance_provider_id?: number; corporate_client_id?: number; name: string; price: string; is_excluded: boolean }>>([]);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<Array<{
    id: number;
    user_id: number;
    user_name: string;
    user_role: string;
    action: string;
    entity_type: string;
    entity_id: number;
    old_values: any;
    new_values: any;
    created_at: string;
    ip_address?: string | null;
    user_agent?: string | null;
  }>>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditTotalCount, setAuditTotalCount] = useState(0);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [auditEntityFilter, setAuditEntityFilter] = useState<string>('all');
  const [selectedAuditLog, setSelectedAuditLog] = useState<typeof auditLogs[0] | null>(null);
  const auditItemsPerPage = 25;
  const [appointmentsSubTab, setAppointmentsSubTab] = useState<'current' | 'future' | 'past'>('current');
  const [futureAppointments, setFutureAppointments] = useState<Appointment[]>([]);
  const [loadingFutureAppointments, setLoadingFutureAppointments] = useState(false);

  // Invoice state
  const [invoices, setInvoices] = useState<DashboardInvoice[]>([]);
  const [patients, setPatients] = useState<DashboardPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceData, setInvoiceData] = useState<DashboardInvoiceData | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<DashboardInvoiceItem[]>([]);
  const [invoicePayerSources, setInvoicePayerSources] = useState<DashboardPayerSource[]>([]);

  // Corporate clients state
  const [corporateClients, setCorporateClients] = useState<CorporateClient[]>([]);
  const [loadingCorporateClients, setLoadingCorporateClients] = useState(true);
  const [showCorporateForm, setShowCorporateForm] = useState(false);
  const [corporateForm, setCorporateForm] = useState({ name: '', contact_person: '', contact_email: '', contact_phone: '', assigned_doctor_id: '' });

  // Doctors state
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  // Insurance providers state
  const [insuranceProviders, setInsuranceProviders] = useState<InsuranceProvider[]>([]);
  const [loadingInsuranceProviders, setLoadingInsuranceProviders] = useState(true);
  const [showInsuranceForm, setShowInsuranceForm] = useState(false);
  const [insuranceForm, setInsuranceForm] = useState({ name: '', contact_person: '', contact_email: '', contact_phone: '' });
  // --- Per-insurer tariff editor ---
  interface TariffRow { id: number; service_name: string; service_code: string; category: string; cash_price: string | number; payer_price: string | number | null; is_excluded: boolean; }
  const [tariffPayer, setTariffPayer] = useState<{ id: number; name: string; payer_type: 'insurance' | 'corporate' } | null>(null);
  const [tariffRows, setTariffRows] = useState<TariffRow[]>([]);
  const [tariffEdits, setTariffEdits] = useState<Record<number, { price: string; is_excluded: boolean }>>({});
  const [tariffLoading, setTariffLoading] = useState(false);
  const [tariffSaving, setTariffSaving] = useState(false);
  const [tariffSearch, setTariffSearch] = useState('');
  const [tariffCategory, setTariffCategory] = useState('');
  const [tariffImportMsg, setTariffImportMsg] = useState('');

  // Staff management state
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffForm, setStaffForm] = useState({
    email: '',
    password: '',
    role: 'doctor',
    first_name: '',
    last_name: '',
    phone: '',
    clinic: '', // only relevant when role === 'doctor'
    display_title: '', // optional per-user dashboard/role label override
  });

  // Staff filtering, sorting, and pagination state
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>('all');
  const [staffStatusFilter, setStaffStatusFilter] = useState<string>('all');
  const [staffSortBy, setStaffSortBy] = useState<'name' | 'username' | 'role'>('name');
  const [staffSortOrder, setStaffSortOrder] = useState<'asc' | 'desc'>('asc');
  const [staffPage, setStaffPage] = useState(1);
  const staffItemsPerPage = 10;
  const [selectedStaff, setSelectedStaff] = useState<Set<number>>(new Set());
  // Temporary-password credentials shown after a reset. Kept in a persistent
  // modal (not a toast) so the admin can actually read/copy and hand them over.
  const [resetPwResult, setResetPwResult] = useState<
    { name: string; username: string; temporary_password: string }[] | null
  >(null);

  // Past Patients state
  const [pastPatients, setPastPatients] = useState<PastPatientEncounter[]>([]);
  const [pastPatientsSearchTerm, setPastPatientsSearchTerm] = useState('');
  const [pastPatientsDateFrom, setPastPatientsDateFrom] = useState('');
  const [pastPatientsDateTo, setPastPatientsDateTo] = useState('');
  const [pastPatientsPage, setPastPatientsPage] = useState(1);
  const [pastPatientsTotalPages, setPastPatientsTotalPages] = useState(1);
  const [loadingPastPatients, setLoadingPastPatients] = useState(false);
  const [pastPatientsSortField, setPastPatientsSortField] = useState<string>('encounter_date');
  const [pastPatientsSortOrder, setPastPatientsSortOrder] = useState<'asc' | 'desc'>('desc');
  const pastPatientsPerPage = 15;

  useEffect(() => {
    loadTodayAppointments();
    loadCorporateClients();
    loadInsuranceProviders();
    loadPatients();
    loadDoctors();
    loadStaff();
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      loadInvoicesByPatient(selectedPatientId);
    }
  }, [selectedPatientId]);

  const loadTodayAppointments = async () => {
    try {
      // Admin sees all appointments, not filtered by user
      const response = await apiClient.get('/appointments/today');
      setTodayAppointments(response.data.appointments || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFutureAppointments = async () => {
    try {
      setLoadingFutureAppointments(true);
      const response = await apiClient.get('/appointments', {
        params: {
          future: true,
          limit: 100,
        },
      });
      setFutureAppointments(response.data.appointments || []);
    } catch (error) {
      console.error('Error loading future appointments:', error);
      setFutureAppointments([]);
    } finally {
      setLoadingFutureAppointments(false);
    }
  };

  const loadPastAppointments = async () => {
    try {
      setLoadingPastAppointments(true);
      const response = await apiClient.get('/appointments', {
        params: {
          status: 'completed',
          limit: 100,
        },
      });
      setPastAppointments(response.data.appointments || []);
    } catch (error) {
      console.error('Error loading past appointments:', error);
      setPastAppointments([]);
    } finally {
      setLoadingPastAppointments(false);
    }
  };

  // Load appointments when the subtab changes
  useEffect(() => {
    if (activeTab === 'appointments') {
      if (appointmentsSubTab === 'past') {
        loadPastAppointments();
      } else if (appointmentsSubTab === 'future') {
        loadFutureAppointments();
      }
    }
  }, [activeTab, appointmentsSubTab]);

  const loadCorporateClients = async () => {
    setLoadingCorporateClients(true);
    try {
      const response = await apiClient.get('/payer-sources/corporate-clients');
      setCorporateClients(response.data.corporate_clients || []);
    } catch (error) {
      console.error('Error loading corporate clients:', error);
    } finally {
      setLoadingCorporateClients(false);
    }
  };

  const loadInsuranceProviders = async () => {
    setLoadingInsuranceProviders(true);
    try {
      const response = await apiClient.get('/payer-sources/insurance-providers');
      setInsuranceProviders(response.data.insurance_providers || []);
    } catch (error) {
      console.error('Error loading insurance providers:', error);
    } finally {
      setLoadingInsuranceProviders(false);
    }
  };

  const loadDoctors = async () => {
    try {
      const response = await apiClient.get('/users?role=doctor');
      const doctorsList = response.data.users || [];
      setDoctors(doctorsList);
    } catch (error) {
      console.error('Error loading doctors:', error);
      setDoctors([]);
    }
  };

  const loadStaff = async () => {
    setLoadingStaff(true);
    try {
      const response = await apiClient.get('/users');
      setStaff(response.data.users || []);
    } catch (error) {
      console.error('Error loading staff:', error);
    } finally {
      setLoadingStaff(false);
    }
  };

  // Filter, sort, and paginate staff data
  const getFilteredAndSortedStaff = () => {
    let filteredStaff = [...staff];

    // Apply search filter
    if (staffSearchTerm) {
      const searchLower = staffSearchTerm.toLowerCase();
      filteredStaff = filteredStaff.filter(
        (member) =>
          member.first_name?.toLowerCase().includes(searchLower) ||
          member.last_name?.toLowerCase().includes(searchLower) ||
          member.username?.toLowerCase().includes(searchLower)
      );
    }

    // Apply role filter
    if (staffRoleFilter !== 'all') {
      filteredStaff = filteredStaff.filter((member) => member.role === staffRoleFilter);
    }

    // Apply status filter
    if (staffStatusFilter !== 'all') {
      const isActive = staffStatusFilter === 'active';
      filteredStaff = filteredStaff.filter((member) => member.is_active === isActive);
    }

    // Apply sorting
    filteredStaff.sort((a, b) => {
      let compareA = '';
      let compareB = '';

      if (staffSortBy === 'name') {
        compareA = `${a.first_name} ${a.last_name}`.toLowerCase();
        compareB = `${b.first_name} ${b.last_name}`.toLowerCase();
      } else if (staffSortBy === 'username') {
        compareA = a.username?.toLowerCase() || '';
        compareB = b.username?.toLowerCase() || '';
      } else if (staffSortBy === 'role') {
        compareA = a.role?.toLowerCase() || '';
        compareB = b.role?.toLowerCase() || '';
      }

      if (compareA < compareB) return staffSortOrder === 'asc' ? -1 : 1;
      if (compareA > compareB) return staffSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filteredStaff;
  };

  const getPaginatedStaff = () => {
    const filteredStaff = getFilteredAndSortedStaff();
    const startIndex = (staffPage - 1) * staffItemsPerPage;
    const endIndex = startIndex + staffItemsPerPage;
    return filteredStaff.slice(startIndex, endIndex);
  };

  const getTotalStaffPages = () => {
    const filteredStaff = getFilteredAndSortedStaff();
    return Math.ceil(filteredStaff.length / staffItemsPerPage);
  };

  const handleStaffSort = (column: 'name' | 'username' | 'role') => {
    if (staffSortBy === column) {
      // Toggle sort order
      setStaffSortOrder(staffSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setStaffSortBy(column);
      setStaffSortOrder('asc');
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!editingStaff && !staffForm.password) {
        showToast('Password is required for new staff members', 'warning');
        return;
      }

      if (editingStaff) {
        // Update existing staff
        const updateData: StaffFormData = { ...staffForm };
        if (!staffForm.password) {
          // Don't include password if not provided
          const dataWithoutPassword = { ...updateData };
          delete (dataWithoutPassword as { password?: string }).password;
          await apiClient.put(`/users/${editingStaff.id}`, dataWithoutPassword);
        } else {
          await apiClient.put(`/users/${editingStaff.id}`, updateData);
        }
        showToast('Staff member updated successfully!', 'success');
      } else {
        // Create new staff
        await apiClient.post('/users', staffForm);
        showToast('Staff member created successfully!', 'success');
      }

      setStaffForm({ email: '', password: '', role: 'doctor', first_name: '', last_name: '', phone: '', clinic: '', display_title: '' });
      setShowStaffForm(false);
      setEditingStaff(null);
      loadStaff();
    } catch (err) {
      const error = err as ApiError;
      const errorMessage = error.response?.data?.error || 'Failed to save staff member';
      showToast(`Error: ${errorMessage}`, 'error');
    }
  };

  const handleEditStaff = (staffMember: StaffMember) => {
    setEditingStaff(staffMember);
    setStaffForm({
      email: staffMember.email || '',
      password: '', // Don't populate password for security
      role: staffMember.role,
      first_name: staffMember.first_name,
      last_name: staffMember.last_name,
      phone: staffMember.phone || '',
      clinic: (staffMember as any).clinic || '',
      display_title: (staffMember as any).display_title || '',
    });
    setShowStaffForm(true);
    // Scroll to form so the user sees it
    setTimeout(() => {
      document.querySelector('form[class*="mb-6"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleToggleStaffStatus = async (id: number, currentStatus: boolean) => {
    try {
      if (currentStatus) {
        // Deactivate
        if (!(await confirmDialog({ title: 'Deactivate staff member?', message: 'Are you sure you want to deactivate this staff member?', variant: 'warning', confirmLabel: 'Deactivate' }))) return;
        await apiClient.delete(`/users/${id}`);
        showToast('Staff member deactivated successfully!', 'success');
      } else {
        // Activate
        if (!(await confirmDialog({ title: 'Activate staff member?', message: 'Are you sure you want to activate this staff member?', confirmLabel: 'Activate' }))) return;
        await apiClient.post(`/users/${id}/activate`);
        showToast('Staff member activated successfully!', 'success');
      }
      loadStaff();
    } catch (err) {
      const error = err as ApiError;
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to update staff member status';
      showToast(errorMessage, 'error');
    }
  };

  const handleResetPassword = async (member: StaffMember) => {
    if (!(await confirmDialog({
      title: 'Reset password?',
      message: `Reset password for ${member.first_name} ${member.last_name}? A temporary password will be generated and they will be required to change it on next login.`,
      variant: 'warning',
      confirmLabel: 'Reset password',
    }))) {
      return;
    }

    try {
      const response = await apiClient.post(`/users/${member.id}/reset-password`);
      const creds = response.data?.credentials;
      if (creds?.temporary_password) {
        setResetPwResult([{
          name: `${member.first_name} ${member.last_name}`,
          username: creds.username || member.username,
          temporary_password: creds.temporary_password,
        }]);
      } else {
        showToast('Password was reset, but the temporary password was not returned. Please reset again.', 'warning');
      }
    } catch (err) {
      const error = err as ApiError;
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to reset password';
      showToast(errorMessage, 'error');
    }
  };

  const handleImpersonate = async (member: StaffMember) => {
    if (!(await confirmDialog({
      title: 'Log in as user?',
      message: `Log in as ${member.first_name} ${member.last_name} (${member.role})? You will be redirected to their dashboard.`,
      confirmLabel: 'Log in as',
    }))) {
      return;
    }

    try {
      await impersonateUser(member.id);
      showToast(`Now logged in as ${member.first_name} ${member.last_name}`, 'success');
      // Navigate to the appropriate dashboard based on role
      const roleRoutes: Record<string, string> = {
        admin: '/dashboard',
        doctor: '/doctor',
        nurse: '/nurse',
        receptionist: '/receptionist',
        lab: '/lab',
        pharmacy: '/pharmacy',
        pharmacist: '/pharmacy',
        pharmacy_tech: '/pharmacy',
        imaging: '/imaging',
        accountant: '/dashboard',
        patient: '/patient-portal',
      };
      navigate(roleRoutes[member.role] || '/dashboard');
    } catch (err) {
      const error = err as ApiError;
      const errorMessage = error.response?.data?.error || 'Failed to impersonate user';
      showToast(errorMessage, 'error');
    }
  };

  // Bulk staff actions
  const handleSelectAllStaff = (checked: boolean) => {
    if (checked) {
      const currentPageStaff = getPaginatedStaff();
      setSelectedStaff(new Set(currentPageStaff.map(s => s.id)));
    } else {
      setSelectedStaff(new Set());
    }
  };

  const handleSelectStaff = (staffId: number, checked: boolean) => {
    const newSelected = new Set(selectedStaff);
    if (checked) {
      newSelected.add(staffId);
    } else {
      newSelected.delete(staffId);
    }
    setSelectedStaff(newSelected);
  };

  const handleBulkDeactivate = async () => {
    if (selectedStaff.size === 0) return;

    const count = selectedStaff.size;
    if (!(await confirmDialog({ title: 'Deactivate staff?', message: `Deactivate ${count} selected staff member${count > 1 ? 's' : ''}?`, variant: 'warning', confirmLabel: 'Deactivate' }))) {
      return;
    }

    try {
      const promises = Array.from(selectedStaff).map(id =>
        apiClient.delete(`/users/${id}`)
      );
      await Promise.all(promises);
      showToast(`${count} staff member${count > 1 ? 's' : ''} deactivated`, 'success');
      setSelectedStaff(new Set());
      loadStaff();
    } catch (err) {
      showToast('Failed to deactivate some staff members', 'error');
    }
  };

  const handleBulkActivate = async () => {
    if (selectedStaff.size === 0) return;

    const count = selectedStaff.size;
    if (!(await confirmDialog({ title: 'Activate staff?', message: `Activate ${count} selected staff member${count > 1 ? 's' : ''}?`, confirmLabel: 'Activate' }))) {
      return;
    }

    try {
      const promises = Array.from(selectedStaff).map(id =>
        apiClient.post(`/users/${id}/activate`)
      );
      await Promise.all(promises);
      showToast(`${count} staff member${count > 1 ? 's' : ''} activated`, 'success');
      setSelectedStaff(new Set());
      loadStaff();
    } catch (err) {
      showToast('Failed to activate some staff members', 'error');
    }
  };

  const handleBulkResetPassword = async () => {
    if (selectedStaff.size === 0) return;

    const count = selectedStaff.size;
    if (!(await confirmDialog({ title: 'Reset passwords?', message: `Reset passwords for ${count} selected staff member${count > 1 ? 's' : ''}? Each gets a unique temporary password, which will be shown so you can hand them out.`, variant: 'warning', confirmLabel: 'Reset' }))) {
      return;
    }

    try {
      const selectedIds = Array.from(selectedStaff);
      const results = await Promise.all(
        selectedIds.map(id => apiClient.post(`/users/${id}/reset-password`))
      );
      const creds = results
        .map((r, i) => {
          const c = r.data?.credentials;
          if (!c?.temporary_password) return null;
          const member = staff.find(s => s.id === selectedIds[i]);
          return {
            name: member ? `${member.first_name} ${member.last_name}` : (c.username || 'Staff'),
            username: c.username || member?.username || '',
            temporary_password: c.temporary_password,
          };
        })
        .filter((c): c is { name: string; username: string; temporary_password: string } => c !== null);
      if (creds.length > 0) {
        setResetPwResult(creds);
      }
      if (creds.length < count) {
        showToast(`${count - creds.length} password(s) reset but not returned — reset those individually.`, 'warning');
      }
      setSelectedStaff(new Set());
    } catch (err) {
      showToast('Failed to reset some passwords', 'error');
    }
  };

  const handleCreateCorporateClient = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!corporateForm.name.trim()) {
      showToast('Company name is required', 'error');
      return;
    }
    if (!corporateForm.assigned_doctor_id) {
      showToast('Assigned doctor is required', 'error');
      return;
    }

    try {
      const payload = {
        ...corporateForm,
        assigned_doctor_id: Number(corporateForm.assigned_doctor_id),
      };
      await apiClient.post('/payer-sources/corporate-clients', payload);
      setCorporateForm({ name: '', contact_person: '', contact_email: '', contact_phone: '', assigned_doctor_id: '' });
      setShowCorporateForm(false);
      loadCorporateClients();
      showToast('Corporate client added successfully!', 'success');
    } catch (err) {
      const error = err as ApiError;
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to add corporate client';
      showToast(`Error: ${errorMessage}`, 'error');
    }
  };

  const handleCreateInsuranceProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/payer-sources/insurance-providers', insuranceForm);
      setInsuranceForm({ name: '', contact_person: '', contact_email: '', contact_phone: '' });
      setShowInsuranceForm(false);
      loadInsuranceProviders();
      showToast('Insurance provider added successfully!', 'success');
    } catch (err) {
      const error = err as ApiError;
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to add insurance provider';
      showToast(`Error: ${errorMessage}`, 'error');
    }
  };

  const handleDeleteCorporateClient = async (id: number) => {
    if (!(await confirmDialog({ title: 'Deactivate corporate client?', message: 'Are you sure you want to deactivate this corporate client?', variant: 'warning', confirmLabel: 'Deactivate' }))) return;
    try {
      await apiClient.delete(`/payer-sources/corporate-clients/${id}`);
      loadCorporateClients();
      showToast('Corporate client deactivated successfully!', 'success');
    } catch (err) {
      const error = err as ApiError;
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to deactivate corporate client';
      showToast(errorMessage, 'error');
    }
  };

  // Open the tariff editor for one payer: load every service + this payer's
  // current override price, seed the editable grid.
  const openTariffEditor = async (payer: { id: number; name: string }, payerType: 'insurance' | 'corporate' = 'insurance') => {
    setTariffPayer({ id: payer.id, name: payer.name, payer_type: payerType });
    setTariffRows([]); setTariffEdits({}); setTariffSearch(''); setTariffCategory(''); setTariffImportMsg('');
    setTariffLoading(true);
    try {
      const res = await apiClient.get(`/charge-master/payer-schedule/${payerType}/${payer.id}`);
      const rows: TariffRow[] = res.data.schedule || [];
      setTariffRows(rows);
      const seed: Record<number, { price: string; is_excluded: boolean }> = {};
      rows.forEach(r => {
        seed[r.id] = {
          price: r.payer_price !== null && r.payer_price !== undefined ? String(r.payer_price) : '',
          is_excluded: !!r.is_excluded,
        };
      });
      setTariffEdits(seed);
    } catch {
      showToast('Failed to load tariff', 'error');
      setTariffPayer(null);
    } finally {
      setTariffLoading(false);
    }
  };

  const saveTariff = async () => {
    if (!tariffPayer) return;
    setTariffSaving(true);
    try {
      const items = tariffRows.map(r => ({
        charge_master_id: r.id,
        price: tariffEdits[r.id]?.price ?? '',
        is_excluded: tariffEdits[r.id]?.is_excluded ?? false,
      }));
      const res = await apiClient.put(`/charge-master/payer-schedule/${tariffPayer.payer_type}/${tariffPayer.id}`, { items });
      showToast(`Tariff saved — ${res.data.updated} priced${res.data.cleared ? `, ${res.data.cleared} cleared` : ''}`, 'success');
      setTariffPayer(null);
    } catch (err) {
      const error = err as ApiError;
      showToast(error.response?.data?.error || 'Failed to save tariff', 'error');
    } finally {
      setTariffSaving(false);
    }
  };

  // CSV upload: simple format with a service_code (or service_name) column, a
  // price column, and optional excluded column. Matches rows into the grid for
  // review before saving; reports anything it couldn't match.
  const handleTariffCsv = async (file: File) => {
    setTariffImportMsg('');
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { setTariffImportMsg('File looks empty.'); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const codeIdx = headers.findIndex(h => h.includes('code'));
      const nameIdx = headers.findIndex(h => h.includes('service') || h.includes('name') || h.includes('description'));
      const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('tariff') || h.includes('rate') || h.includes('amount'));
      const exclIdx = headers.findIndex(h => h.includes('exclud') || h.includes('not covered'));
      if (priceIdx === -1 || (codeIdx === -1 && nameIdx === -1)) {
        setTariffImportMsg('Need a price column and a service code or name column. Headers found: ' + headers.join(', '));
        return;
      }
      const byCode = new Map(tariffRows.map(r => [String(r.service_code).toLowerCase(), r.id]));
      const byName = new Map(tariffRows.map(r => [String(r.service_name).toLowerCase().trim(), r.id]));
      let matched = 0; const unmatched: string[] = [];
      const next = { ...tariffEdits };
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const key = codeIdx !== -1 ? cols[codeIdx]?.toLowerCase() : '';
        const nameKey = nameIdx !== -1 ? cols[nameIdx]?.toLowerCase().trim() : '';
        const id = (key && byCode.get(key)) || (nameKey && byName.get(nameKey));
        if (!id) { unmatched.push(cols[codeIdx] || cols[nameIdx] || `row ${i + 1}`); continue; }
        const rawPrice = (cols[priceIdx] || '').replace(/[^0-9.]/g, '');
        const excluded = exclIdx !== -1 ? /^(y|yes|true|1|x)$/i.test(cols[exclIdx] || '') : false;
        next[id] = { price: excluded ? '' : rawPrice, is_excluded: excluded };
        matched++;
      }
      setTariffEdits(next);
      setTariffImportMsg(`Matched ${matched} service${matched === 1 ? '' : 's'}.` + (unmatched.length ? ` Couldn't match ${unmatched.length}: ${unmatched.slice(0, 8).join(', ')}${unmatched.length > 8 ? '…' : ''}. Review then Save.` : ' Review then Save.'));
    } catch {
      setTariffImportMsg('Could not read that file. Use a CSV with headers.');
    }
  };

  const handleDeleteInsuranceProvider = async (id: number) => {
    if (!(await confirmDialog({ title: 'Deactivate insurance provider?', message: 'Are you sure you want to deactivate this insurance provider?', variant: 'warning', confirmLabel: 'Deactivate' }))) return;
    try {
      await apiClient.delete(`/payer-sources/insurance-providers/${id}`);
      loadInsuranceProviders();
      showToast('Insurance provider deactivated successfully!', 'success');
    } catch (err) {
      const error = err as ApiError;
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to deactivate insurance provider';
      showToast(errorMessage, 'error');
    }
  };

  const loadPatients = async () => {
    try {
      const response = await apiClient.get('/patients');
      setPatients(response.data.patients || []);
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const loadInvoicesByPatient = async (patientId: number) => {
    try {
      const response = await apiClient.get(`/invoices/patient/${patientId}`);
      setInvoices(response.data.invoices || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
      setInvoices([]);
    }
  };

  const handleViewInvoice = async (invoiceId: number) => {
    try {
      const response = await apiClient.get(`/invoices/${invoiceId}`);
      setInvoiceData(response.data.invoice);
      setInvoiceItems(response.data.items || []);
      setInvoicePayerSources(response.data.payer_sources || []);
      setShowInvoice(true);
    } catch (err) {
      const error = err as ApiError;
      console.error('Error loading invoice:', error);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to load invoice';
      showToast(errorMessage, 'error');
    }
  };

  // Load past patients (completed encounters)
  const loadPastPatients = async () => {
    try {
      setLoadingPastPatients(true);
      const params: Record<string, string | number> = {
        page: pastPatientsPage,
        limit: pastPatientsPerPage,
        sort_field: pastPatientsSortField,
        sort_order: pastPatientsSortOrder,
      };

      if (pastPatientsSearchTerm) {
        params.search = pastPatientsSearchTerm;
      }
      if (pastPatientsDateFrom) {
        params.date_from = pastPatientsDateFrom;
      }
      if (pastPatientsDateTo) {
        params.date_to = pastPatientsDateTo;
      }

      const response = await apiClient.get('/workflow/completed-encounters', { params });
      setPastPatients(response.data.encounters || []);
      setPastPatientsTotalPages(response.data.totalPages || 1);
    } catch (error) {
      console.error('Error loading past patients:', error);
      setPastPatients([]);
    } finally {
      setLoadingPastPatients(false);
    }
  };

  // Handle sorting for past patients table
  const handlePastPatientsSort = (field: string) => {
    if (pastPatientsSortField === field) {
      setPastPatientsSortOrder(pastPatientsSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setPastPatientsSortField(field);
      setPastPatientsSortOrder('asc');
    }
    setPastPatientsPage(1);
  };

  // Load past patients when tab is active or filters change
  useEffect(() => {
    if (activeTab === 'pastPatients') {
      loadPastPatients();
    }
  }, [activeTab, pastPatientsPage, pastPatientsSearchTerm, pastPatientsDateFrom, pastPatientsDateTo, pastPatientsSortField, pastPatientsSortOrder]);

  // Fetch audit logs with pagination
  const fetchAuditLogs = async (page: number = 1) => {
    setAuditLoading(true);
    try {
      const offset = (page - 1) * auditItemsPerPage;
      let url = `/audit/recent?limit=${auditItemsPerPage}&offset=${offset}`;
      if (auditActionFilter !== 'all') {
        url += `&action=${auditActionFilter}`;
      }
      if (auditEntityFilter !== 'all') {
        url += `&entity_type=${auditEntityFilter}`;
      }
      const response = await apiClient.get(url);
      setAuditLogs(response.data.logs || []);
      setAuditTotalCount(response.data.total || response.data.logs?.length || 0);
      setAuditTotalPages(Math.ceil((response.data.total || response.data.logs?.length || 0) / auditItemsPerPage));
      setAuditPage(page);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setAuditLoading(false);
    }
  };

  // Export audit logs to CSV
  const exportAuditLogs = async (format: 'csv' | 'json') => {
    try {
      // Fetch all logs for export (up to 1000)
      let url = '/audit/recent?limit=1000';
      if (auditActionFilter !== 'all') {
        url += `&action=${auditActionFilter}`;
      }
      if (auditEntityFilter !== 'all') {
        url += `&entity_type=${auditEntityFilter}`;
      }
      const response = await apiClient.get(url);
      const logs = response.data.logs || [];

      if (format === 'csv') {
        const headers = ['Timestamp', 'User', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Details'];
        const csvRows = logs.map((log: any) => [
          new Date(log.created_at).toISOString(),
          log.user_name || 'System',
          log.user_role || 'N/A',
          log.action,
          log.entity_type,
          log.entity_id,
          JSON.stringify(log.new_values || {}).replace(/"/g, '""')
        ].map(field => `"${field}"`).join(','));

        const csvContent = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${format === 'csv' ? new Date().toISOString().split('T')[0] : ''}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        const jsonContent = JSON.stringify(logs, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
      showToast(`Audit logs exported as ${format.toUpperCase()}`, 'success');
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      showToast('Failed to export audit logs', 'error');
    }
  };

  // Load audit logs when tab is active or filters change
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs(1);
    }
  }, [activeTab, auditActionFilter, auditEntityFilter]);

  // Fetch payers list
  const fetchPayers = async () => {
    try {
      const response = await apiClient.get('/charge-master/payers');
      setPayers(response.data.payers || []);
    } catch (error) {
      console.error('Error fetching payers:', error);
    }
  };

  // Fetch service charges (with optional payer filter)
  const fetchCharges = async (payerFilter?: string) => {
    setChargesLoading(true);
    try {
      const filter = payerFilter ?? selectedPayerFilter;
      let url = '/charge-master';
      if (filter !== 'cash') {
        const [type, id] = filter.split(':');
        url += `?payer_type=${type}&payer_id=${id}`;
      }
      const response = await apiClient.get(url);
      // Lab prices live in lab_test_catalog (single source, shared with the Lab
      // Dashboard). Everything else comes from charge_master.
      const nonLab = (response.data.charges || []).filter((c: any) => c.category !== 'lab');
      let labAsCharges: any[] = [];
      try {
        const labRes = await apiClient.get('/lab/test-catalog');
        labAsCharges = (labRes.data.tests || []).map((t: any) => ({
          id: t.id,
          service_name: t.test_name,
          service_code: t.test_code,
          category: 'lab',
          price: String(t.base_price ?? 0),
          description: t.category || null,
          is_active: t.is_active,
        }));
      } catch { /* lab catalog optional */ }
      setCharges([...nonLab, ...labAsCharges]);
    } catch (error) {
      console.error('Error fetching charges:', error);
    } finally {
      setChargesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'charges') {
      fetchCharges();
      fetchPayers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'charges') {
      fetchCharges(selectedPayerFilter);
    }
  }, [selectedPayerFilter]);

  // Load payer prices when editing a charge
  const loadPayerPricesForEdit = async (chargeId: number) => {
    try {
      const [payerPricesRes, payersRes] = await Promise.all([
        apiClient.get(`/charge-master/${chargeId}/payer-prices`),
        payers.length > 0 ? Promise.resolve({ data: { payers } }) : apiClient.get('/charge-master/payers'),
      ]);

      const existingPrices = payerPricesRes.data.payer_prices || [];
      const allPayers = payersRes.data.payers || [];

      const priceMap = new Map<string, { price: string; is_excluded: boolean }>();
      for (const ep of existingPrices) {
        const key = ep.insurance_provider_id
          ? `insurance:${ep.insurance_provider_id}`
          : `corporate:${ep.corporate_client_id}`;
        priceMap.set(key, { price: ep.price ? String(ep.price) : '', is_excluded: ep.is_excluded });
      }

      const prices = allPayers.map((p: { id: number; name: string; payer_type: string }) => {
        const key = `${p.payer_type}:${p.id}`;
        const existing = priceMap.get(key);
        return {
          payer_type: p.payer_type,
          insurance_provider_id: p.payer_type === 'insurance' ? p.id : undefined,
          corporate_client_id: p.payer_type === 'corporate' ? p.id : undefined,
          name: p.name,
          price: existing?.price || '',
          is_excluded: existing?.is_excluded || false,
        };
      });

      setEditPayerPrices(prices);
    } catch (error) {
      console.error('Error loading payer prices:', error);
    }
  };

  const handleSavePayerPrices = async (chargeId: number) => {
    try {
      const payer_prices = editPayerPrices
        .filter(pp => pp.price || pp.is_excluded)
        .map(pp => ({
          payer_type: pp.payer_type,
          insurance_provider_id: pp.insurance_provider_id,
          corporate_client_id: pp.corporate_client_id,
          price: pp.is_excluded ? null : parseFloat(pp.price),
          is_excluded: pp.is_excluded,
        }));

      await apiClient.put(`/charge-master/${chargeId}/payer-prices`, { payer_prices });
      showToast('Payer prices updated', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to save payer prices', 'error');
    }
  };

  const handleSaveCharge = async (charge: typeof newCharge, id?: number) => {
    try {
      const isLab = charge.category === 'lab';
      if (id) {
        if (isLab) {
          // Lab prices are stored in lab_test_catalog (reflects on the Lab Dashboard too)
          await apiClient.put(`/lab/test-catalog/${id}`, {
            test_name: charge.service_name,
            test_code: charge.service_code,
            base_price: parseFloat(charge.price),
          });
        } else {
          await apiClient.put(`/charge-master/${id}`, charge);
        }
        showToast('Service charge updated', 'success');
      } else {
        if (isLab) {
          await apiClient.post('/lab/test-catalog', {
            test_name: charge.service_name,
            test_code: charge.service_code,
            base_price: parseFloat(charge.price),
            category: 'Lab',
          });
        } else {
          await apiClient.post('/charge-master', charge);
        }
        showToast('Service charge added', 'success');
      }
      setEditingCharge(null);
      setShowAddCharge(false);
      setNewCharge({ service_name: '', service_code: '', category: 'consultation', price: '', description: '' });
      fetchCharges();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to save', 'error');
    }
  };

  const chargeCategories = [...new Set(charges.map(c => c.category))].sort();
  const filteredCharges = charges.filter(c => {
    if (chargeCategoryFilter !== 'all' && c.category !== chargeCategoryFilter) return false;
    if (chargeSearch) {
      const s = chargeSearch.toLowerCase();
      return c.service_name.toLowerCase().includes(s) || c.service_code.toLowerCase().includes(s) || c.description?.toLowerCase().includes(s);
    }
    return true;
  });
  const chargesTotalPages = Math.ceil(filteredCharges.length / chargesPerPage);
  const paginatedCharges = filteredCharges.slice((chargesPage - 1) * chargesPerPage, chargesPage * chargesPerPage);


  const openTaskCount = (adminTasksCounts.pending || 0) + (adminTasksCounts.in_progress || 0);
  const blockedTaskCount = adminTasksCounts.blocked || 0;
  const completeTaskCount = adminTasksCounts.complete || 0;
  const todayAppointmentsCount = todayAppointments.length;

  return (
    <AppLayout>
      <DashboardHeader title={isOfficeManager ? 'Office Manager Dashboard' : user?.display_title ? `${user.display_title} Dashboard` : 'Admin Dashboard'} />
      {/* Summary cards — refined number-first style. Color carries signal,
          not decoration. NumberTicker gives a subtle count-up on load. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <AdminStatCard
          label="Open Tasks"
          value={openTaskCount}
          accent={openTaskCount > 0 ? 'warning' : 'neutral'}
          hint="Pending + In Progress"
          series={adminTrends?.tasks_created}
          trendDirection="up-is-bad"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          }
          onClick={() => { setActiveTab('tasks'); setAdminTasksStatusFilter('all'); }}
        />
        <AdminStatCard
          label="Blocked Tasks"
          value={blockedTaskCount}
          accent={blockedTaskCount > 0 ? 'danger' : 'neutral'}
          hint="Needs attention"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          }
          onClick={() => { setActiveTab('tasks'); setAdminTasksStatusFilter('blocked'); }}
        />
        <AdminStatCard
          label="Completed Tasks"
          value={completeTaskCount}
          accent="success"
          hint="Done"
          series={adminTrends?.tasks_completed}
          trendDirection="up-is-good"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 13l4 4L19 7" />
          }
          onClick={() => { setActiveTab('tasks'); setAdminTasksStatusFilter('complete'); }}
        />
        <AdminStatCard
          label="Today's Appointments"
          value={todayAppointmentsCount}
          accent="primary"
          hint="Scheduled for today"
          series={adminTrends?.appointments}
          trendDirection="up-is-good"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          }
          onClick={() => setActiveTab('appointments')}
        />
      </div>

      {/* Auto-derived insight — uses already-loaded data, no extra fetch. */}
      {(() => {
        const blockedShare = openTaskCount + blockedTaskCount > 0
          ? (blockedTaskCount / (openTaskCount + blockedTaskCount)) * 100
          : 0;
        if (blockedTaskCount >= 3) {
          return (
            <div className="mb-4">
              <InsightCard
                tone="warning"
                title={`${blockedTaskCount} blocked tasks need unblocking`}
                body={`Blocked items are ${blockedShare.toFixed(0)}% of the active workload. Review the blocked list and identify what's stalling them.`}
                action={{ label: 'View blocked tasks', onClick: () => { setActiveTab('tasks'); setAdminTasksStatusFilter('blocked'); } }}
              />
            </div>
          );
        }
        if (openTaskCount === 0 && completeTaskCount > 0) {
          return (
            <div className="mb-4">
              <InsightCard
                tone="positive"
                title="All tasks complete"
                body={`Nice work — ${completeTaskCount} task${completeTaskCount === 1 ? '' : 's'} closed and nothing currently open or blocked.`}
              />
            </div>
          );
        }
        return null;
      })()}

      {/* Tabs */}
        <div className="border-b border-gray-200 mb-6 bg-white rounded-t-xl shadow-lg">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('tasks')}
              className={`${
                activeTab === 'tasks'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Tasks
              {(adminTasksCounts.pending || 0) + (adminTasksCounts.in_progress || 0) > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs bg-warning-100 text-warning-700 rounded-full font-bold">
                  {(adminTasksCounts.pending || 0) + (adminTasksCounts.in_progress || 0)}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={`${
                activeTab === 'staff'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Staff Management
            </button>
            <button
              onClick={() => setActiveTab('appointments')}
              className={`${
                activeTab === 'appointments'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Appointments
            </button>
            <button
              onClick={() => setActiveTab('corporate')}
              className={`${
                activeTab === 'corporate'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Corporate Clients
            </button>
            <button
              onClick={() => setActiveTab('insurance')}
              className={`${
                activeTab === 'insurance'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Insurance Providers
            </button>
            <button
              onClick={() => setActiveTab('charges')}
              className={`${
                activeTab === 'charges'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Service Charges
            </button>
            <button
              onClick={() => navigate('/price-list')}
              className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2"
              title="Full price list: service + lab prices and per-payer tariffs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Price List
            </button>
            <button
              onClick={() => setActiveTab('revenue')}
              className={`${
                activeTab === 'revenue'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Doctor Revenue
            </button>
            {canImpersonate && (
              <button
                onClick={() => { setActiveTab('reports'); if (!reportData) fetchStaffReport(false); }}
                className={`${
                  activeTab === 'reports'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Reports
              </button>
            )}
                <button
                  onClick={() => setActiveTab('audit')}
                  className={`${
                    activeTab === 'audit'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Audit Logs
                </button>
                <button
                  onClick={() => setActiveTab('logins')}
                  className={`${
                    activeTab === 'logins'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Login Records
                </button>
          </nav>
        </div>

        {/* Appointments Tab */}
        {activeTab === 'appointments' && (
          <Paper elevation={3} sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f8fafc' }}>
              <Tabs
                value={appointmentsSubTab}
                onChange={(_, newValue) => setAppointmentsSubTab(newValue)}
                sx={{
                  px: 3,
                  '& .MuiTab-root': {
                    textTransform: 'none',
                    fontSize: '1rem',
                    fontWeight: 600,
                    minHeight: 64,
                  },
                }}
              >
                <Tab label="Today's Appointments" value="current" />
                <Tab label="Future Appointments" value="future" />
                <Tab label="Past Appointments" value="past" />
              </Tabs>
            </Box>

            <Box sx={{ p: 3 }}>
              {appointmentsSubTab === 'current' && (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" fontWeight={600}>
                      Today's Appointments
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {format(new Date(), 'EEEE, MMMM d, yyyy')}
                    </Typography>
                  </Box>

                  {loading ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
                      <CircularProgress size={40} />
                      <Typography sx={{ mt: 2 }} color="text.secondary">
                        Loading appointments...
                      </Typography>
                    </Box>
                  ) : todayAppointments.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                      <Typography color="text.secondary">No appointments scheduled for today</Typography>
                    </Box>
                  ) : (
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#f8fafc' }}>
                            <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Patient</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {todayAppointments.map((appointment) => (
                            <TableRow key={appointment.id} hover>
                              <TableCell>{format(new Date(appointment.appointment_date), 'h:mm a')}</TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>
                                  {appointment.patient_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {appointment.patient_number}
                                </Typography>
                              </TableCell>
                              <TableCell>{appointment.appointment_type || 'General'}</TableCell>
                              <TableCell>
                                <Chip
                                  label={appointment.status}
                                  size="small"
                                  color={
                                    appointment.status === 'completed'
                                      ? 'success'
                                      : appointment.status === 'scheduled'
                                      ? 'info'
                                      : appointment.status === 'cancelled'
                                      ? 'error'
                                      : 'default'
                                  }
                                  sx={{ fontWeight: 600 }}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  component={Link}
                                  to={`/patients/${appointment.patient_id}`}
                                  variant="text"
                                  size="small"
                                >
                                  View Patient
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}

              {appointmentsSubTab === 'future' && (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" fontWeight={600}>
                      Future Appointments
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Upcoming scheduled appointments
                    </Typography>
                  </Box>

                  {loadingFutureAppointments ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
                      <CircularProgress size={40} />
                      <Typography sx={{ mt: 2 }} color="text.secondary">
                        Loading future appointments...
                      </Typography>
                    </Box>
                  ) : futureAppointments.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                      <Typography color="text.secondary">No future appointments scheduled</Typography>
                    </Box>
                  ) : (
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#f8fafc' }}>
                            <TableCell sx={{ fontWeight: 600 }}>Date & Time</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Patient</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Provider</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {futureAppointments.map((appointment) => (
                            <TableRow key={appointment.id} hover>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>
                                  {format(new Date(appointment.appointment_date), 'MMM d, yyyy')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {format(new Date(appointment.appointment_date), 'h:mm a')}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>
                                  {appointment.patient_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {appointment.patient_number}
                                </Typography>
                              </TableCell>
                              <TableCell>{appointment.appointment_type || 'General'}</TableCell>
                              <TableCell>{appointment.provider_name || '-'}</TableCell>
                              <TableCell>
                                <Chip
                                  label={appointment.status}
                                  size="small"
                                  color={
                                    appointment.status === 'confirmed'
                                      ? 'success'
                                      : appointment.status === 'scheduled'
                                      ? 'info'
                                      : 'default'
                                  }
                                  sx={{ fontWeight: 600 }}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  component={Link}
                                  to={`/patients/${appointment.patient_id}`}
                                  variant="text"
                                  size="small"
                                >
                                  View Patient
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}

              {appointmentsSubTab === 'past' && (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" fontWeight={600}>
                      Past Appointments
                    </Typography>
                  </Box>

                  {loadingPastAppointments ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
                      <CircularProgress size={40} />
                      <Typography sx={{ mt: 2 }} color="text.secondary">
                        Loading past appointments...
                      </Typography>
                    </Box>
                  ) : pastAppointments.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                      <Typography color="text.secondary">No past appointments found</Typography>
                    </Box>
                  ) : (
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#f8fafc' }}>
                            <TableCell sx={{ fontWeight: 600 }}>Date & Time</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Patient</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Provider</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {pastAppointments.map((appointment) => (
                            <TableRow key={appointment.id} hover>
                              <TableCell>
                                <Typography variant="body2">
                                  {format(new Date(appointment.appointment_date), 'MMM d, yyyy')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {format(new Date(appointment.appointment_date), 'h:mm a')}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>
                                  {appointment.patient_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {appointment.patient_number}
                                </Typography>
                              </TableCell>
                              <TableCell>{appointment.appointment_type || 'General'}</TableCell>
                              <TableCell>{appointment.provider_name || 'N/A'}</TableCell>
                              <TableCell>
                                <Chip label={appointment.status} size="small" color="default" sx={{ fontWeight: 600 }} />
                              </TableCell>
                              <TableCell>
                                <Button
                                  component={Link}
                                  to={`/patients/${appointment.patient_id}`}
                                  variant="text"
                                  size="small"
                                >
                                  View Patient
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}
            </Box>
          </Paper>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Patient Invoices</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Patient Selection */}
              <div>
                <AppSelect
                  label="Select Patient"
                  value={selectedPatientId || ''}
                  onChange={(val) => setSelectedPatientId(val ? Number(val) : null)}
                  placeholder="-- Select a Patient --"
                  options={patients.map((patient) => ({
                    value: patient.id,
                    label: `${patient.first_name} ${patient.last_name} (${patient.patient_number})`,
                  }))}
                />
              </div>
            </div>

            {/* Invoices List */}
            {selectedPatientId && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoices for Selected Patient</h3>
                {invoices.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No invoices found for this patient</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Invoice #
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Today's Visit
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {invoices.map((invoice) => (
                          <tr key={invoice.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {invoice.invoice_number}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'MMM dd, yyyy') : 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {invoice.chief_complaint || 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              ${parseFloat(invoice.total || '0').toFixed(2)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  invoice.status === 'paid'
                                    ? 'bg-success-100 text-success-800'
                                    : invoice.status === 'pending'
                                    ? 'bg-warning-100 text-warning-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {invoice.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={() => handleViewInvoice(invoice.id)}
                                className="text-primary-600 hover:text-primary-900 flex items-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Corporate Clients Tab */}
        {activeTab === 'corporate' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Corporate Clients</h2>
              <button
                onClick={() => setShowCorporateForm(!showCorporateForm)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                {showCorporateForm ? 'Cancel' : 'Add New Client'}
              </button>
            </div>

            {showCorporateForm && (
              <form onSubmit={handleCreateCorporateClient} className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      value={corporateForm.name}
                      onChange={(e) => setCorporateForm({ ...corporateForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Person
                    </label>
                    <input
                      type="text"
                      value={corporateForm.contact_person}
                      onChange={(e) => setCorporateForm({ ...corporateForm, contact_person: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={corporateForm.contact_email}
                      onChange={(e) => setCorporateForm({ ...corporateForm, contact_email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      value={corporateForm.contact_phone}
                      onChange={(e) => setCorporateForm({ ...corporateForm, contact_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <AppSelect
                      label="Assigned Doctor *"
                      value={corporateForm.assigned_doctor_id}
                      onChange={(val) => setCorporateForm({ ...corporateForm, assigned_doctor_id: val })}
                      placeholder="Select Doctor"
                      required
                      options={doctors.map((doctor) => ({
                        value: doctor.id,
                        label: `Dr. ${doctor.first_name} ${doctor.last_name}`,
                      }))}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    className="px-6 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors"
                  >
                    Save Corporate Client
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact Person
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned Doctor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loadingCorporateClients ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRowSkeleton key={i} columns={6} />
                    ))
                  ) : corporateClients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {client.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {client.contact_person || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {client.contact_email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {client.contact_phone || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {client.assigned_doctor_name ? (
                          <span className="font-medium text-primary-600">
                            Dr. {client.assigned_doctor_name}
                          </span>
                        ) : (
                          <span className="text-gray-400">Not Assigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleDeleteCorporateClient(client.id)}
                          className="text-danger-600 hover:text-danger-900"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Insurance Providers Tab */}
        {activeTab === 'insurance' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Insurance Providers</h2>
              <button
                onClick={() => setShowInsuranceForm(!showInsuranceForm)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                {showInsuranceForm ? 'Cancel' : 'Add New Provider'}
              </button>
            </div>

            {showInsuranceForm && (
              <form onSubmit={handleCreateInsuranceProvider} className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provider Name *
                    </label>
                    <input
                      type="text"
                      value={insuranceForm.name}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Person
                    </label>
                    <input
                      type="text"
                      value={insuranceForm.contact_person}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, contact_person: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={insuranceForm.contact_email}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, contact_email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      value={insuranceForm.contact_phone}
                      onChange={(e) => setInsuranceForm({ ...insuranceForm, contact_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    className="px-6 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors"
                  >
                    Save Insurance Provider
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Provider Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact Person
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loadingInsuranceProviders ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRowSkeleton key={i} columns={5} />
                    ))
                  ) : insuranceProviders.map((provider) => (
                    <tr key={provider.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {provider.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {provider.contact_person || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {provider.contact_email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {provider.contact_phone || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-4">
                        <button
                          onClick={() => openTariffEditor(provider)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          Tariffs
                        </button>
                        <button
                          onClick={() => handleDeleteInsuranceProvider(provider.id)}
                          className="text-danger-600 hover:text-danger-900"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Per-insurer Tariff editor modal */}
        {tariffPayer && (() => {
          const categories = Array.from(new Set(tariffRows.map(r => r.category).filter(Boolean)));
          const visible = tariffRows.filter(r => {
            if (tariffCategory && r.category !== tariffCategory) return false;
            if (tariffSearch) {
              const q = tariffSearch.toLowerCase();
              if (!r.service_name?.toLowerCase().includes(q) && !r.service_code?.toLowerCase().includes(q)) return false;
            }
            return true;
          });
          const pricedCount = tariffRows.filter(r => {
            const e = tariffEdits[r.id];
            return e && (e.is_excluded || (e.price !== '' && !isNaN(Number(e.price))));
          }).length;
          return (
            <div className="fixed inset-0 z-50 overflow-y-auto">
              <div className="flex items-start justify-center min-h-screen pt-10 px-4 pb-10">
                <div className="fixed inset-0 bg-black/50" onClick={() => setTariffPayer(null)} />
                <div className="relative bg-white rounded-xl shadow-xl max-w-4xl w-full z-10 flex flex-col max-h-[85vh]">
                  <div className="px-6 py-4 border-b flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Tariffs — {tariffPayer.name}</h3>
                      <p className="text-xs text-gray-500">Set this insurer's negotiated price per service. Leave blank to use the cash price; tick Excluded if the service isn't covered. {pricedCount} of {tariffRows.length} set.</p>
                    </div>
                    <button onClick={() => setTariffPayer(null)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div className="px-6 py-3 border-b flex flex-wrap items-center gap-3">
                    <input
                      type="text" placeholder="Search service…" value={tariffSearch}
                      onChange={(e) => setTariffSearch(e.target.value)}
                      className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="w-44">
                      <AppSelect
                        value={tariffCategory}
                        onChange={(val) => setTariffCategory(val)}
                        options={[{ value: '', label: 'All Categories' }, ...categories.map(c => ({ value: c, label: c }))]}
                      />
                    </div>
                    <label className="px-3 py-2 text-sm bg-white text-primary-700 border border-primary-300 rounded-lg hover:bg-primary-50 cursor-pointer font-medium">
                      Upload CSV
                      <input type="file" accept=".csv,text/csv" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTariffCsv(f); e.target.value = ''; }} />
                    </label>
                  </div>
                  {tariffImportMsg && (
                    <div className="px-6 py-2 bg-blue-50 text-blue-800 text-xs border-b border-blue-100">{tariffImportMsg}</div>
                  )}

                  <div className="overflow-y-auto flex-1">
                    {tariffLoading ? (
                      <div className="py-12 text-center text-gray-500">Loading services…</div>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cash</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Tariff (GH₵)</th>
                            <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Excluded</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {visible.map(r => {
                            const e = tariffEdits[r.id] || { price: '', is_excluded: false };
                            return (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2">
                                  <div className="font-medium text-gray-900">{r.service_name}</div>
                                  <div className="text-xs text-gray-400">{r.service_code}</div>
                                </td>
                                <td className="px-4 py-2 text-gray-600 capitalize">{r.category}</td>
                                <td className="px-4 py-2 text-right text-gray-500">{Number(r.cash_price).toFixed(2)}</td>
                                <td className="px-4 py-2 text-center">
                                  <input
                                    type="number" min="0" step="0.01"
                                    disabled={e.is_excluded}
                                    value={e.price}
                                    onChange={(ev) => setTariffEdits(prev => ({ ...prev, [r.id]: { price: ev.target.value, is_excluded: prev[r.id]?.is_excluded || false } }))}
                                    placeholder="cash"
                                    className="w-24 px-2 py-1 text-right border border-gray-300 rounded disabled:bg-gray-100 disabled:text-gray-400"
                                  />
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={e.is_excluded}
                                    onChange={(ev) => setTariffEdits(prev => ({ ...prev, [r.id]: { price: prev[r.id]?.price || '', is_excluded: ev.target.checked } }))}
                                    className="w-4 h-4"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                          {visible.length === 0 && (
                            <tr><td colSpan={5} className="py-8 text-center text-gray-400">No services match.</td></tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="px-6 py-4 border-t flex justify-end gap-3">
                    <button onClick={() => setTariffPayer(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button onClick={saveTariff} disabled={tariffSaving || tariffLoading}
                      className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium">
                      {tariffSaving ? 'Saving…' : 'Save Tariff'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Staff Management Tab */}
        {activeTab === 'staff' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Staff Management</h2>
              <div className="flex items-center gap-3">
                {selectedStaff.size > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">{selectedStaff.size} selected</span>
                    <button
                      onClick={handleBulkActivate}
                      className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Activate
                    </button>
                    <button
                      onClick={handleBulkDeactivate}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Deactivate
                    </button>
                    <button
                      onClick={handleBulkResetPassword}
                      className="px-2 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700"
                    >
                      Reset Passwords
                    </button>
                    <button
                      onClick={() => setSelectedStaff(new Set())}
                      className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                      Clear
                    </button>
                  </div>
                )}
                <button
                  onClick={() => {
                    setShowStaffForm(!showStaffForm);
                    if (showStaffForm) {
                      setEditingStaff(null);
                      setStaffForm({ email: '', password: '', role: 'doctor', first_name: '', last_name: '', phone: '', clinic: '', display_title: '' });
                    }
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  {showStaffForm ? 'Cancel' : 'Add New Staff Member'}
                </button>
              </div>
            </div>

            {/* Filter and Search Controls */}
            <Box sx={{ mb: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
              <TextField
                fullWidth
                label="Search"
                placeholder="Name or username..."
                value={staffSearchTerm}
                onChange={(e) => {
                  setStaffSearchTerm(e.target.value);
                  setStaffPage(1);
                }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
                size="medium"
              />

              <FormControl fullWidth size="medium">
                <InputLabel>Role / Department</InputLabel>
                <Select
                  value={staffRoleFilter}
                  label="Role / Department"
                  onChange={(e) => {
                    setStaffRoleFilter(e.target.value);
                    setStaffPage(1);
                  }}
                >
                  <MenuItem value="all">All Roles</MenuItem>
                  <MenuItem value="doctor">Doctor</MenuItem>
                  <MenuItem value="nurse">Nurse</MenuItem>
                  <MenuItem value="receptionist">Receptionist</MenuItem>
                  <MenuItem value="lab">Lab Technician</MenuItem>
                  <MenuItem value="pharmacy">Pharmacy</MenuItem>
                  <MenuItem value="imaging">Imaging/Radiology</MenuItem>
                  <MenuItem value="admin">Administrator</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth size="medium">
                <InputLabel>Status</InputLabel>
                <Select
                  value={staffStatusFilter}
                  label="Status"
                  onChange={(e) => {
                    setStaffStatusFilter(e.target.value);
                    setStaffPage(1);
                  }}
                >
                  <MenuItem value="all">All Status</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>

              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {(staffSearchTerm || staffRoleFilter !== 'all' || staffStatusFilter !== 'all') && (
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<ClearIcon />}
                    onClick={() => {
                      setStaffSearchTerm('');
                      setStaffRoleFilter('all');
                      setStaffStatusFilter('all');
                      setStaffPage(1);
                    }}
                    sx={{ height: '56px' }}
                  >
                    Clear Filters
                  </Button>
                )}
              </Box>
            </Box>

            {showStaffForm && (
              <form onSubmit={handleCreateStaff} className="mb-6 p-6 bg-gray-50 rounded-lg border-2 border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {editingStaff ? 'Edit Staff Member' : 'New Staff Member'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={staffForm.first_name}
                      onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={staffForm.last_name}
                      onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={staffForm.email}
                      onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={staffForm.phone}
                      onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <AppSelect
                      label="Role / Department *"
                      value={staffForm.role}
                      onChange={(val) => setStaffForm({ ...staffForm, role: val, clinic: val === 'doctor' ? staffForm.clinic : '' })}
                      required
                      options={[
                        { value: 'doctor', label: 'Doctor' },
                        { value: 'nurse', label: 'Nurse' },
                        { value: 'receptionist', label: 'Receptionist' },
                        { value: 'lab', label: 'Lab Technician' },
                        { value: 'pharmacy', label: 'Pharmacy' },
                        { value: 'imaging', label: 'Imaging/Radiology' },
                        { value: 'admin', label: 'Administrator' },
                        { value: 'office_manager', label: 'Office Manager' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Title
                    </label>
                    <input
                      type="text"
                      value={staffForm.display_title}
                      onChange={(e) => setStaffForm({ ...staffForm, display_title: e.target.value })}
                      placeholder="e.g. Office Manager (leave blank for role default)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Optional label shown on their dashboard instead of the role name. Does not change permissions.</p>
                  </div>
                  {staffForm.role === 'doctor' && (
                    <div>
                      <AppSelect
                        label="Clinic / Specialty"
                        value={staffForm.clinic}
                        onChange={(val) => setStaffForm({ ...staffForm, clinic: val })}
                        placeholder="— Select clinic —"
                        options={[
                          { value: 'General Practice', label: 'General Practice' },
                          { value: 'ENT (Ear, Nose & Throat)', label: 'ENT (Ear, Nose & Throat)' },
                          { value: 'Urology', label: 'Urology' },
                          { value: 'Cardiology', label: 'Cardiology' },
                          { value: 'Dermatology', label: 'Dermatology' },
                          { value: 'Gastroenterology', label: 'Gastroenterology' },
                          { value: 'Neurology', label: 'Neurology' },
                          { value: 'Obstetrics & Gynecology', label: 'Obstetrics & Gynecology' },
                          { value: 'Ophthalmology', label: 'Ophthalmology' },
                          { value: 'Orthopedics', label: 'Orthopedics' },
                          { value: 'Pediatrics', label: 'Pediatrics' },
                          { value: 'Psychiatry', label: 'Psychiatry' },
                          { value: 'Pulmonology', label: 'Pulmonology' },
                          { value: 'Rheumatology', label: 'Rheumatology' },
                          { value: 'Endocrinology', label: 'Endocrinology' },
                        ]}
                      />
                      <p className="text-xs text-gray-500 mt-1">Which clinic this doctor practices in.</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password {editingStaff ? '(leave blank to keep current)' : '*'}
                    </label>
                    <input
                      type="password"
                      value={staffForm.password}
                      onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      required={!editingStaff}
                      placeholder={editingStaff ? 'Leave blank to keep current password' : ''}
                    />
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="submit"
                    className="px-6 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors font-semibold"
                  >
                    {editingStaff ? 'Update Staff Member' : 'Create Staff Member'}
                  </button>
                  {editingStaff && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStaff(null);
                        setStaffForm({ email: '', password: '', role: 'doctor', first_name: '', last_name: '', phone: '', clinic: '', display_title: '' });
                        setShowStaffForm(false);
                      }}
                      className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={getPaginatedStaff().length > 0 && getPaginatedStaff().every(s => selectedStaff.has(s.id))}
                        onChange={(e) => handleSelectAllStaff(e.target.checked)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    </th>
                    <th
                      onClick={() => handleStaffSort('name')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    >
                      <div className="flex items-center gap-2">
                        Name
                        {staffSortBy === 'name' && (
                          <svg className={`w-4 h-4 transition-transform ${staffSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleStaffSort('username')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    >
                      <div className="flex items-center gap-2">
                        Username
                        {staffSortBy === 'username' && (
                          <svg className={`w-4 h-4 transition-transform ${staffSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleStaffSort('role')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    >
                      <div className="flex items-center gap-2">
                        Role / Department
                        {staffSortBy === 'role' && (
                          <svg className={`w-4 h-4 transition-transform ${staffSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loadingStaff ? (
                    // Skeleton loading rows
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRowSkeleton key={i} columns={7} />
                    ))
                  ) : getPaginatedStaff().map((member) => (
                    <tr key={member.id} className={`${member.is_active ? '' : 'bg-gray-50 opacity-60'} ${selectedStaff.has(member.id) ? 'bg-primary-50' : ''}`}>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedStaff.has(member.id)}
                          onChange={(e) => handleSelectStaff(member.id, e.target.checked)}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {member.first_name} {member.last_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{member.username}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          member.role === 'doctor' ? 'bg-primary-100 text-primary-800' :
                          member.role === 'nurse' ? 'bg-success-100 text-success-800' :
                          member.role === 'receptionist' ? 'bg-secondary-100 text-secondary-800' :
                          member.role === 'lab' ? 'bg-warning-100 text-warning-800' :
                          member.role === 'pharmacy' ? 'bg-success-100 text-success-800' :
                          member.role === 'imaging' ? 'bg-secondary-100 text-secondary-800' :
                          member.role === 'admin' ? 'bg-danger-100 text-danger-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">{member.phone || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          member.is_active ? 'bg-success-100 text-success-800' : 'bg-danger-100 text-danger-800'
                        }`}>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                        <button
                          onClick={() => handleEditStaff(member)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleResetPassword(member)}
                          className="text-warning-600 hover:text-warning-700"
                        >
                          Reset PW
                        </button>
                        {canImpersonate && member.is_active && member.role !== 'admin' && (
                          <button
                            onClick={() => handleImpersonate(member)}
                            className="text-secondary-600 hover:text-purple-900"
                          >
                            Login As
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleStaffStatus(member.id, member.is_active)}
                          className={member.is_active ? 'text-danger-600 hover:text-danger-900' : 'text-success-600 hover:text-green-900'}
                        >
                          {member.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {getFilteredAndSortedStaff().length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {staff.length === 0 ? (
                    <div>
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <p className="text-lg font-medium text-gray-900">No staff members found</p>
                      <p className="text-sm text-gray-500 mt-1">Click "Add New Staff Member" to get started.</p>
                    </div>
                  ) : (
                    <div>
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <p className="text-lg font-medium text-gray-900">No matching staff members</p>
                      <p className="text-sm text-gray-500 mt-1">Try adjusting your search or filters</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            {getFilteredAndSortedStaff().length > 0 && getTotalStaffPages() > 1 && (
              <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                <div className="text-sm text-gray-700">
                  Showing {((staffPage - 1) * staffItemsPerPage) + 1} to {Math.min(staffPage * staffItemsPerPage, getFilteredAndSortedStaff().length)} of {getFilteredAndSortedStaff().length} staff members
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStaffPage(staffPage - 1)}
                    disabled={staffPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>

                  {/* Page numbers */}
                  <div className="flex gap-1">
                    {Array.from({ length: getTotalStaffPages() }, (_, i) => i + 1).map((pageNum) => {
                      // Show first page, last page, current page, and pages around current
                      const shouldShow =
                        pageNum === 1 ||
                        pageNum === getTotalStaffPages() ||
                        (pageNum >= staffPage - 1 && pageNum <= staffPage + 1);

                      const shouldShowEllipsis =
                        (pageNum === staffPage - 2 && staffPage > 3) ||
                        (pageNum === staffPage + 2 && staffPage < getTotalStaffPages() - 2);

                      if (shouldShowEllipsis) {
                        return <span key={pageNum} className="px-3 py-2 text-gray-500">...</span>;
                      }

                      if (!shouldShow) return null;

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setStaffPage(pageNum)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            pageNum === staffPage
                              ? 'bg-primary-600 text-white'
                              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setStaffPage(staffPage + 1)}
                    disabled={staffPage === getTotalStaffPages()}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tasks Tab — clinic operations tracker */}
        {activeTab === 'tasks' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Tasks</h2>
                <p className="text-sm text-gray-600 mt-1">Clinic operations — one list, soonest deadline first. Click a column to sort, use the row below the headers to filter.</p>
              </div>
              <button
                onClick={openCreateTask}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                + Add Task
              </button>
            </div>

            {/* Status filter chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(['all', 'pending', 'in_progress', 'blocked', 'complete'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setAdminTasksStatusFilter(s)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    adminTasksStatusFilter === s
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                  {s !== 'all' && adminTasksCounts[s] !== undefined && (
                    <span className="ml-2 text-xs opacity-75">{adminTasksCounts[s]}</span>
                  )}
                </button>
              ))}
            </div>

            {adminTasksLoading ? (
              <div className="py-8 text-center text-gray-500 text-sm">Loading...</div>
            ) : adminTasks.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm">No tasks match this filter.</div>
            ) : (() => {
              const today = new Date().toISOString().slice(0, 10);
              const sortArrow = (key: TaskSortKey) =>
                taskSort?.key === key ? (taskSort.dir === 'asc' ? '▲' : '▼') : '';
              const columns: Array<{ key: TaskSortKey; label: string }> = [
                { key: 'task', label: 'Task' },
                { key: 'category', label: 'Category' },
                { key: 'contact_person', label: 'Contact' },
                { key: 'responsibility', label: 'Responsibility' },
                { key: 'status', label: 'Status' },
                { key: 'cost', label: 'Cost' },
                { key: 'due_date', label: 'Deadline' },
                { key: 'remarks', label: 'Remarks' },
              ];
              const filterInput = (key: keyof typeof blankTaskFilters, placeholder = 'Filter…') => (
                <input
                  type="text"
                  value={taskFilters[key]}
                  onChange={(e) => setTaskFilters({ ...taskFilters, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white font-normal"
                />
              );
              return (
                <div>
                  <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                    <span>
                      Showing {displayedTasks.length} of {adminTasks.length} task{adminTasks.length === 1 ? '' : 's'}
                      {taskSort ? '' : ' · sorted by soonest deadline (completed last)'}
                    </span>
                    {(taskFiltersActive || taskSort) && (
                      <button
                        onClick={() => { setTaskFilters(blankTaskFilters); setTaskSort(null); }}
                        className="text-primary-600 hover:underline"
                      >
                        Clear filters &amp; sorting
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {columns.map(c => (
                            <th key={c.key} className="text-left px-3 py-2 font-semibold text-gray-700">
                              <button
                                type="button"
                                onClick={() => cycleTaskSort(c.key)}
                                className="inline-flex items-center gap-1 hover:text-primary-600"
                                title="Click to sort"
                              >
                                {c.label}
                                <span className="text-primary-600 text-[10px] w-2">{sortArrow(c.key)}</span>
                              </button>
                            </th>
                          ))}
                          <th className="text-right px-3 py-2 font-semibold text-gray-700">Actions</th>
                        </tr>
                        <tr className="bg-white border-t border-gray-200">
                          <th className="px-3 py-1.5">{filterInput('task')}</th>
                          <th className="px-3 py-1.5">{filterInput('category')}</th>
                          <th className="px-3 py-1.5">{filterInput('contact_person')}</th>
                          <th className="px-3 py-1.5">{filterInput('responsibility')}</th>
                          <th className="px-3 py-1.5">
                            <select
                              value={taskFilters.status}
                              onChange={(e) => setTaskFilters({ ...taskFilters, status: e.target.value })}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white font-normal"
                            >
                              <option value="">All</option>
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="blocked">Blocked</option>
                              <option value="complete">Complete</option>
                            </select>
                          </th>
                          <th className="px-3 py-1.5">{filterInput('cost')}</th>
                          <th className="px-3 py-1.5"></th>
                          <th className="px-3 py-1.5">{filterInput('remarks')}</th>
                          <th className="px-3 py-1.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedTasks.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-8 text-center text-gray-500 text-sm">
                              No tasks match these filters.
                            </td>
                          </tr>
                        ) : displayedTasks.map(t => {
                          const dd = t.due_date ? t.due_date.slice(0, 10) : '';
                          const done = t.status === 'complete';
                          const overdue = dd && !done && dd < today;
                          return (
                            <tr key={t.id} className={`border-t border-gray-100 hover:bg-gray-50 ${done ? 'bg-gray-50/60' : ''}`}>
                              <td className={`px-3 py-2 ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.task}</td>
                              <td className="px-3 py-2 text-gray-500 text-xs">{t.category}</td>
                              <td className="px-3 py-2 text-gray-700">{t.contact_person || '—'}</td>
                              <td className="px-3 py-2 text-gray-700">{t.responsibility || '—'}</td>
                              <td className="px-3 py-2">
                                <AppSelect
                                  value={t.status}
                                  onChange={(val) => inlineUpdateStatus(t.id, val as AdminTask['status'])}
                                  className="text-xs cursor-pointer"
                                  options={[
                                    { value: 'pending', label: 'Pending' },
                                    { value: 'in_progress', label: 'In Progress' },
                                    { value: 'blocked', label: 'Blocked' },
                                    { value: 'complete', label: 'Complete' },
                                  ]}
                                />
                              </td>
                              <td className="px-3 py-2 text-gray-700 text-xs">{t.cost || '—'}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  value={dd}
                                  onChange={(e) => inlineUpdateDueDate(t.id, e.target.value)}
                                  className={`text-xs px-2 py-1 rounded border bg-white ${overdue ? 'border-danger-400 text-danger-700 font-semibold' : 'border-gray-300 text-gray-700'}`}
                                  title={overdue ? 'Overdue' : 'Set deadline'}
                                />
                                {overdue && <span className="ml-1 text-[10px] font-semibold text-danger-600 uppercase">Overdue</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-600 text-xs max-w-xs truncate" title={t.remarks || ''}>{t.remarks || '—'}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                <button onClick={() => openEditTask(t)} className="text-primary-600 hover:underline text-xs mr-3">Edit</button>
                                <button onClick={() => deleteTask(t.id)} className="text-danger-600 hover:underline text-xs">Delete</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Add/Edit Task modal */}
        {showTaskModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">{editingTask ? 'Edit Task' : 'Add Task'}</h3>
                <button onClick={() => setShowTaskModal(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
              </div>
              <div className="p-6 overflow-y-auto space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
                  <input
                    type="text"
                    list="adminTaskCategories"
                    value={taskForm.category}
                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                    placeholder="e.g. Facility Needs, Marketing, IT"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <datalist id="adminTaskCategories">
                    {[...new Set(adminTasks.map(t => t.category))].map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Task *</label>
                  <input
                    type="text"
                    value={taskForm.task}
                    onChange={(e) => setTaskForm({ ...taskForm, task: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Contact Person</label>
                    <input
                      type="text"
                      value={taskForm.contact_person}
                      onChange={(e) => setTaskForm({ ...taskForm, contact_person: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Responsibility</label>
                    <input
                      type="text"
                      value={taskForm.responsibility}
                      onChange={(e) => setTaskForm({ ...taskForm, responsibility: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <AppSelect
                      label="Status"
                      value={taskForm.status}
                      onChange={(val) => setTaskForm({ ...taskForm, status: val as AdminTask['status'] })}
                      options={[
                        { value: 'pending', label: 'Pending' },
                        { value: 'in_progress', label: 'In Progress' },
                        { value: 'blocked', label: 'Blocked' },
                        { value: 'complete', label: 'Complete' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={taskForm.due_date}
                      onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cost</label>
                  <input
                    type="text"
                    value={taskForm.cost}
                    onChange={(e) => setTaskForm({ ...taskForm, cost: e.target.value })}
                    placeholder="e.g. GHS 1,200 or GHS 1,200 / head"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Remarks</label>
                  <textarea
                    value={taskForm.remarks}
                    onChange={(e) => setTaskForm({ ...taskForm, remarks: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end gap-2">
                <button onClick={() => setShowTaskModal(false)} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={saveTask} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                  {editingTask ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Doctor Revenue Tab */}
        {activeTab === 'revenue' && (
          <DoctorRevenuePanel />
        )}

        {/* Login Activity Tab */}
        {activeTab === 'logins' && (
          <LoginActivityPanel />
        )}

        {/* Past Patients Tab */}
        {activeTab === 'pastPatients' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-gray-100 p-2 rounded-lg">
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Past Patients</h2>
                <p className="text-sm text-gray-500">View completed encounter history</p>
              </div>
            </div>

            {/* Search and Filter Controls */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search
                </label>
                <input
                  type="text"
                  value={pastPatientsSearchTerm}
                  onChange={(e) => {
                    setPastPatientsSearchTerm(e.target.value);
                    setPastPatientsPage(1);
                  }}
                  placeholder="Patient name, number, or encounter..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  From Date
                </label>
                <input
                  type="date"
                  value={pastPatientsDateFrom}
                  onChange={(e) => {
                    setPastPatientsDateFrom(e.target.value);
                    setPastPatientsPage(1);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  To Date
                </label>
                <input
                  type="date"
                  value={pastPatientsDateTo}
                  onChange={(e) => {
                    setPastPatientsDateTo(e.target.value);
                    setPastPatientsPage(1);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-end">
                {(pastPatientsSearchTerm || pastPatientsDateFrom || pastPatientsDateTo) && (
                  <button
                    onClick={() => {
                      setPastPatientsSearchTerm('');
                      setPastPatientsDateFrom('');
                      setPastPatientsDateTo('');
                      setPastPatientsPage(1);
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Loading State */}
            {loadingPastPatients && (
              <div className="text-center py-12">
                <CircularProgress size={40} />
                <p className="mt-4 text-gray-600">Loading past patients...</p>
              </div>
            )}

            {/* Past Patients Table */}
            {!loadingPastPatients && pastPatients.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handlePastPatientsSort('patient_name')}
                      >
                        <div className="flex items-center gap-1">
                          Patient
                          {pastPatientsSortField === 'patient_name' && (
                            <svg className={`w-4 h-4 transition-transform ${pastPatientsSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handlePastPatientsSort('gender')}
                      >
                        <div className="flex items-center gap-1">
                          Gender
                          {pastPatientsSortField === 'gender' && (
                            <svg className={`w-4 h-4 transition-transform ${pastPatientsSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Encounter #
                      </th>
                      <th
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handlePastPatientsSort('encounter_date')}
                      >
                        <div className="flex items-center gap-1">
                          Date
                          {pastPatientsSortField === 'encounter_date' && (
                            <svg className={`w-4 h-4 transition-transform ${pastPatientsSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handlePastPatientsSort('clinic')}
                      >
                        <div className="flex items-center gap-1">
                          Clinic
                          {pastPatientsSortField === 'clinic' && (
                            <svg className={`w-4 h-4 transition-transform ${pastPatientsSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        onClick={() => handlePastPatientsSort('provider_name')}
                      >
                        <div className="flex items-center gap-1">
                          Physician
                          {pastPatientsSortField === 'provider_name' && (
                            <svg className={`w-4 h-4 transition-transform ${pastPatientsSortOrder === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pastPatients.map((encounter) => (
                      <tr key={encounter.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {encounter.patient_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {encounter.patient_number}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {encounter.gender || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {encounter.encounter_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {encounter.encounter_date ? format(new Date(encounter.encounter_date), 'MM/dd/yyyy') : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {encounter.clinic || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {encounter.provider_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => navigate(`/patients/${encounter.id}`)}
                            className="text-primary-600 hover:text-primary-900 font-medium"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Empty State */}
            {!loadingPastPatients && pastPatients.length === 0 && (
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="mt-2 text-lg font-medium text-gray-900">No past patients found</p>
                <p className="mt-1 text-sm text-gray-500">
                  {pastPatientsSearchTerm || pastPatientsDateFrom || pastPatientsDateTo
                    ? 'Try adjusting your search or filters'
                    : 'Completed encounters will appear here'}
                </p>
              </div>
            )}

            {/* Pagination Controls */}
            {!loadingPastPatients && pastPatients.length > 0 && pastPatientsTotalPages > 1 && (
              <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                <div className="text-sm text-gray-700">
                  Page {pastPatientsPage} of {pastPatientsTotalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPastPatientsPage(pastPatientsPage - 1)}
                    disabled={pastPatientsPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPastPatientsPage(pastPatientsPage + 1)}
                    disabled={pastPatientsPage === pastPatientsTotalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* System Updates Tab */}
        {activeTab === 'updates' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-primary-100 p-2 rounded-lg">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">System Updates & Roadmap</h2>
                <p className="text-sm text-gray-500">Track all system changes, features, and planned updates</p>
              </div>
            </div>
            <SystemUpdates />
          </div>
        )}

        {/* Audit Logs Tab */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Staff Activity Report</h2>
                  <p className="text-sm text-gray-500">What each employee did in the app — by day, week, or month.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    {(['day', 'week', 'month'] as const).map((p) => (
                      <button key={p} onClick={() => setReportPeriod(p)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize ${reportPeriod === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                  <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none" />
                </div>
              </div>
              {reportData && (
                <p className="text-xs text-gray-400">
                  {new Date(reportData.start).toLocaleDateString()} – {new Date(new Date(reportData.end).getTime() - 1).toLocaleDateString()} · {reportData.employees?.length || 0} active staff
                </p>
              )}
            </div>

            {/* AI summary */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  AI Summary
                </h3>
                <button onClick={() => fetchStaffReport(true)} disabled={reportAiLoading || !reportData?.ai_available}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {reportAiLoading ? 'Generating…' : 'Generate AI summary'}
                </button>
              </div>
              {reportData?.ai_summary ? (
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{reportData.ai_summary}</div>
              ) : reportData && !reportData.ai_available ? (
                <p className="text-sm text-gray-400">AI summaries need OpenAI configured (set OPENAI_API_KEY). The activity breakdown below is always available.</p>
              ) : (
                <p className="text-sm text-gray-400">Click “Generate AI summary” for a narrative of the period’s activity.</p>
              )}
            </div>

            {/* Per-employee breakdown */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              {reportLoading ? (
                <div className="py-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" /></div>
              ) : !reportData?.employees?.length ? (
                <div className="py-12 text-center text-gray-500">No recorded activity for this period.</div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Logins</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Top activity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last active</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.employees.map((e: any) => (
                      <tr key={e.user_id} className="hover:bg-gray-50">
                        <td className="px-6 py-3">
                          <div className="font-medium text-gray-900">{e.name}</div>
                          <div className="text-xs text-gray-500 capitalize">{e.role?.replace('_', ' ')}</div>
                        </td>
                        <td className="px-6 py-3 text-center font-semibold text-gray-900">{e.total_actions}</td>
                        <td className="px-6 py-3 text-center text-gray-600">{e.logins}</td>
                        <td className="px-6 py-3">
                          <div className="flex flex-wrap gap-1">
                            {e.breakdown.slice(0, 5).map((b: any, i: number) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5 capitalize">{b.count} {b.label}</span>
                            ))}
                            {e.breakdown.length > 5 && <span className="text-xs text-gray-400">+{e.breakdown.length - 5} more</span>}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-500">{e.last_at ? format(new Date(e.last_at), 'MMM d, h:mm a') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-200 p-2 rounded-lg">
                    <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Audit Logs</h2>
                    <p className="text-sm text-gray-500">Track all clinical actions and system changes ({auditTotalCount} total)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportAuditLogs('csv')}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    CSV
                  </button>
                  <button
                    onClick={() => exportAuditLogs('json')}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    JSON
                  </button>
                  <button
                    onClick={() => fetchAuditLogs(auditPage)}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-semibold flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </button>
                </div>
              </div>
              {/* Filters */}
              <div className="flex items-center gap-4 mt-4">
                <div className="flex items-center gap-2">
                  <AppSelect
                    label="Action:"
                    value={auditActionFilter}
                    onChange={(val) => setAuditActionFilter(val)}
                    options={[
                      { value: 'all', label: 'All Actions' },
                      { value: 'create', label: 'Create' },
                      { value: 'update', label: 'Update' },
                      { value: 'delete', label: 'Delete' },
                      { value: 'complete', label: 'Complete' },
                      { value: 'login', label: 'Login' },
                      { value: 'logout', label: 'Logout' },
                    ]}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <AppSelect
                    label="Entity:"
                    value={auditEntityFilter}
                    onChange={(val) => setAuditEntityFilter(val)}
                    options={[
                      { value: 'all', label: 'All Entities' },
                      { value: 'patient', label: 'Patient' },
                      { value: 'encounter', label: 'Encounter' },
                      { value: 'appointment', label: 'Appointment' },
                      { value: 'lab_order', label: 'Lab Order' },
                      { value: 'prescription', label: 'Prescription' },
                      { value: 'invoice', label: 'Invoice' },
                      { value: 'user', label: 'User' },
                    ]}
                  />
                </div>
              </div>
            </div>

            {auditLoading ? (
              <div className="p-12 text-center">
                <CircularProgress />
                <p className="text-gray-500 mt-4">Loading audit logs...</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-12 text-center">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-500 font-medium">No audit logs found</p>
                <p className="text-sm text-gray-400 mt-1">Clinical actions will appear here when they occur</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Timestamp</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Action</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Entity</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm:ss')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{log.user_name || 'System'}</div>
                          <div className="text-xs text-gray-500 capitalize">{log.user_role || 'N/A'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full uppercase ${
                            log.action === 'create' ? 'bg-success-100 text-success-700' :
                            log.action === 'update' ? 'bg-primary-100 text-primary-700' :
                            log.action === 'delete' ? 'bg-danger-100 text-danger-700' :
                            log.action === 'complete' ? 'bg-secondary-100 text-secondary-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900 capitalize">{log.entity_type?.replace('_', ' ')}</div>
                          <div className="text-xs text-gray-500">ID: {log.entity_id}</div>
                        </td>
                        <td className="px-4 py-3">
                          {(log.new_values || log.old_values) ? (
                            <button
                              onClick={() => setSelectedAuditLog(log)}
                              className="text-left group"
                            >
                              {(() => {
                                const preview = auditChangePreview(log.action, log.old_values, log.new_values);
                                return preview ? (
                                  <span className="block text-xs text-gray-600">{preview}</span>
                                ) : null;
                              })()}
                              <span className="text-xs text-primary-600 group-hover:text-primary-800 font-medium">
                                View Details
                              </span>
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Pagination */}
                {auditTotalPages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {((auditPage - 1) * auditItemsPerPage) + 1} - {Math.min(auditPage * auditItemsPerPage, auditTotalCount)} of {auditTotalCount} logs
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fetchAuditLogs(1)}
                        disabled={auditPage === 1}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        First
                      </button>
                      <button
                        onClick={() => fetchAuditLogs(auditPage - 1)}
                        disabled={auditPage === 1}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1.5 text-sm font-medium text-gray-900">
                        Page {auditPage} of {auditTotalPages}
                      </span>
                      <button
                        onClick={() => fetchAuditLogs(auditPage + 1)}
                        disabled={auditPage === auditTotalPages}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => fetchAuditLogs(auditTotalPages)}
                        disabled={auditPage === auditTotalPages}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Last
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Audit Log Detail Modal */}
        {selectedAuditLog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedAuditLog(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Activity Details</h3>
                    <p className="text-sm text-gray-600">
                      {selectedAuditLog.user_name || 'System'} ({selectedAuditLog.user_role}) &mdash; {format(new Date(selectedAuditLog.created_at), 'MMM dd, yyyy h:mm a')}
                    </p>
                  </div>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full uppercase ${
                    selectedAuditLog.action === 'create' ? 'bg-success-100 text-success-700' :
                    selectedAuditLog.action === 'update' ? 'bg-primary-100 text-primary-700' :
                    selectedAuditLog.action === 'delete' ? 'bg-danger-100 text-danger-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {selectedAuditLog.action}
                  </span>
                </div>
              </div>
              <div className="p-6">
                {/* Plain-English summary of what happened */}
                <p className="mb-4 text-sm text-gray-800 leading-relaxed">
                  {summarizeAudit(selectedAuditLog)}
                  <span className="text-gray-500">
                    {' '}on {format(new Date(selectedAuditLog.created_at), 'MMM dd, yyyy')} at {format(new Date(selectedAuditLog.created_at), 'h:mm:ss a')}.
                  </span>
                </p>

                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-500">Record: </span>
                  <span className="text-sm font-semibold text-gray-900 capitalize">{selectedAuditLog.entity_type?.replace(/_/g, ' ')}</span>
                  <span className="text-sm text-gray-500"> (ID: {selectedAuditLog.entity_id ?? '—'})</span>
                </div>

                {(() => {
                  const changeSet = buildAuditChangeSet(
                    selectedAuditLog.action,
                    selectedAuditLog.old_values,
                    selectedAuditLog.new_values
                  );
                  if (!changeSet) {
                    return (
                      <p className="text-sm text-gray-500 italic">No additional details were recorded for this action.</p>
                    );
                  }
                  const isDiff = changeSet.kind === 'diff';
                  return (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">{changeSet.heading}</h4>
                      {changeSet.rows.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No field-level changes were captured.</p>
                      ) : isDiff ? (
                        <div className="space-y-2">
                          {changeSet.rows.map((row) => (
                            <div key={row.field} className="py-2 border-b border-gray-100 last:border-0">
                              <div className="text-xs font-semibold text-gray-500 mb-1">{row.label}</div>
                              <div className="flex items-center gap-2 flex-wrap text-sm">
                                <span className="px-2 py-0.5 rounded bg-danger-50 text-danger-700 line-through break-all">
                                  {row.before ?? 'Not set'}
                                </span>
                                <span className="text-gray-400">&rarr;</span>
                                <span className="px-2 py-0.5 rounded bg-success-50 text-success-700 break-all">
                                  {row.after ?? 'Not set'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {changeSet.rows.map((row) => (
                            <div key={row.field} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                              <span className="text-sm font-medium text-gray-500 min-w-[140px]">{row.label}</span>
                              <span className="text-sm text-gray-900 break-all">
                                {row.after ?? <span className="text-gray-400 italic">Not set</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Forensic context: where the action came from */}
                {(selectedAuditLog.ip_address || selectedAuditLog.user_agent) && (
                  <div className="mt-5 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                    {selectedAuditLog.ip_address && <div>IP address: {selectedAuditLog.ip_address}</div>}
                    {selectedAuditLog.user_agent && <div className="break-all">Device: {selectedAuditLog.user_agent}</div>}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex justify-end">
                <button
                  onClick={() => setSelectedAuditLog(null)}
                  className="px-4 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Service Charges Tab */}
        {activeTab === 'charges' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Service Charges</h2>
                <p className="text-sm text-gray-500">Manage pricing for all clinic services ({charges.length} services)</p>
              </div>
              <button
                onClick={() => setShowAddCharge(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Service
              </button>
            </div>

            {/* Filters */}
            <div className="px-6 py-3 bg-gray-50 border-b flex flex-col md:flex-row gap-3">
              <input
                type="text"
                placeholder="Search by name or code..."
                value={chargeSearch}
                onChange={(e) => { setChargeSearch(e.target.value); setChargesPage(1); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
              <AppSelect
                value={chargeCategoryFilter}
                onChange={(val) => { setChargeCategoryFilter(val); setChargesPage(1); }}
                options={[
                  { value: 'all', label: 'All Categories' },
                  ...chargeCategories.map(cat => ({
                    value: cat,
                    label: cat.charAt(0).toUpperCase() + cat.slice(1),
                  })),
                ]}
              />
              <AppSelect
                value={selectedPayerFilter}
                onChange={(val) => { setSelectedPayerFilter(val); setChargesPage(1); }}
                options={[
                  { value: 'cash', label: 'Cash / Self-Pay' },
                  ...payers.map(p => ({
                    value: `${p.payer_type}:${p.id}`,
                    label: p.name,
                  })),
                ]}
              />
            </div>

            {chargesLoading ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Service Code</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Service Name</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                        {selectedPayerFilter === 'cash' ? 'Cash Price (GH₵)' : 'Payer Price (GH₵)'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedCharges.map((charge) => (
                      <tr key={charge.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm font-mono text-gray-600">{charge.service_code}</td>
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">{charge.service_name}</td>
                        <td className="px-6 py-3">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary-100 text-primary-700 capitalize">
                            {charge.category}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm font-semibold text-right">
                          {selectedPayerFilter !== 'cash' && charge.payer_excluded ? (
                            <span className="text-red-600 font-medium">EXCLUDED</span>
                          ) : selectedPayerFilter !== 'cash' && charge.payer_price != null ? (
                            <span className="text-primary-700">{parseFloat(charge.payer_price).toFixed(2)}</span>
                          ) : selectedPayerFilter !== 'cash' ? (
                            <span className="text-gray-400" title="No override - uses cash rate">{parseFloat(charge.price).toFixed(2)} *</span>
                          ) : (
                            <span className="text-gray-900">{parseFloat(charge.price).toFixed(2)}</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-500 max-w-xs truncate">{charge.description || '—'}</td>
                        <td className="px-6 py-3 text-center">
                          <button
                            onClick={() => setEditingCharge(charge)}
                            className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredCharges.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                          {chargeSearch || chargeCategoryFilter !== 'all' ? 'No services match your search' : 'No services configured yet'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {/* Pagination */}
                {chargesTotalPages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {((chargesPage - 1) * chargesPerPage) + 1}–{Math.min(chargesPage * chargesPerPage, filteredCharges.length)} of {filteredCharges.length} services
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setChargesPage(1)}
                        disabled={chargesPage === 1}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        First
                      </button>
                      <button
                        onClick={() => setChargesPage(p => p - 1)}
                        disabled={chargesPage === 1}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1.5 text-sm font-semibold text-primary-700 bg-primary-50 border border-primary-200 rounded-lg">
                        {chargesPage} / {chargesTotalPages}
                      </span>
                      <button
                        onClick={() => setChargesPage(p => p + 1)}
                        disabled={chargesPage === chargesTotalPages}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setChargesPage(chargesTotalPages)}
                        disabled={chargesPage === chargesTotalPages}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Last
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Add/Edit Charge Modal */}
        {(showAddCharge || editingCharge) && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => { setShowAddCharge(false); setEditingCharge(null); setEditPayerPrices([]); }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">{editingCharge ? 'Edit Service Charge' : 'Add New Service Charge'}</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Name *</label>
                    <input
                      type="text"
                      value={editingCharge?.service_name ?? newCharge.service_name}
                      onChange={(e) => editingCharge ? setEditingCharge({ ...editingCharge, service_name: e.target.value }) : setNewCharge({ ...newCharge, service_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="e.g., Full Blood Count"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Code *</label>
                    <input
                      type="text"
                      value={editingCharge?.service_code ?? newCharge.service_code}
                      onChange={(e) => editingCharge ? setEditingCharge({ ...editingCharge, service_code: e.target.value }) : setNewCharge({ ...newCharge, service_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="e.g., LAB-FBC"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <AppSelect
                      label="Category *"
                      value={editingCharge?.category ?? newCharge.category}
                      onChange={(val) => editingCharge ? setEditingCharge({ ...editingCharge, category: val }) : setNewCharge({ ...newCharge, category: val })}
                      options={[
                        { value: 'consultation', label: 'Consultation' },
                        { value: 'lab', label: 'Lab' },
                        { value: 'imaging', label: 'Imaging' },
                        { value: 'pharmacy', label: 'Pharmacy' },
                        { value: 'procedure', label: 'Procedure' },
                        { value: 'registration', label: 'Registration' },
                        { value: 'other', label: 'Other' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cash / Self-Pay Price (GH₵) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingCharge?.price ?? newCharge.price}
                      onChange={(e) => editingCharge ? setEditingCharge({ ...editingCharge, price: e.target.value }) : setNewCharge({ ...newCharge, price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={editingCharge?.description ?? newCharge.description}
                    onChange={(e) => editingCharge ? setEditingCharge({ ...editingCharge, description: e.target.value }) : setNewCharge({ ...newCharge, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Optional description"
                  />
                </div>

                {/* Payer-Specific Prices (only show when editing) */}
                {editingCharge && (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-900">Payer-Specific Prices</h4>
                      {editPayerPrices.length === 0 && (
                        <button
                          type="button"
                          onClick={() => loadPayerPricesForEdit(editingCharge.id)}
                          className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                        >
                          Load Payer Prices
                        </button>
                      )}
                    </div>
                    {(editingCharge.category === 'lab') && (
                      <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-3">
                        Lab tests use MDS Lancet rates uniformly for all payers. Payer overrides do not apply.
                      </p>
                    )}
                    {editPayerPrices.length > 0 && editingCharge.category !== 'lab' && (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {editPayerPrices.map((pp, idx) => (
                          <div key={idx} className="flex items-center gap-3 text-sm">
                            <span className="w-44 truncate text-gray-700 font-medium" title={pp.name}>
                              {pp.payer_type === 'insurance' ? '' : ''} {pp.name}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={pp.price}
                              disabled={pp.is_excluded}
                              onChange={(e) => {
                                const updated = [...editPayerPrices];
                                updated[idx] = { ...pp, price: e.target.value };
                                setEditPayerPrices(updated);
                              }}
                              className="w-28 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-400"
                              placeholder="Cash rate"
                            />
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={pp.is_excluded}
                                onChange={(e) => {
                                  const updated = [...editPayerPrices];
                                  updated[idx] = { ...pp, is_excluded: e.target.checked, price: e.target.checked ? '' : pp.price };
                                  setEditPayerPrices(updated);
                                }}
                                className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                              />
                              Excluded
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex gap-3 justify-end">
                <button
                  onClick={() => { setShowAddCharge(false); setEditingCharge(null); setEditPayerPrices([]); }}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (editingCharge) {
                      await handleSaveCharge(editingCharge, editingCharge.id);
                      if (editPayerPrices.length > 0 && editingCharge.category !== 'lab') {
                        await handleSavePayerPrices(editingCharge.id);
                      }
                    } else {
                      handleSaveCharge(newCharge);
                    }
                    setEditPayerPrices([]);
                  }}
                  className="px-6 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
                >
                  {editingCharge ? 'Save Changes' : 'Add Service'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Documentation Tab */}
        {activeTab === 'docs' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-primary-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">System Documentation</h2>
                <p className="text-sm text-gray-500">User guides and feature documentation for MedSys EMR</p>
              </div>
            </div>
            <LabDocs />

            {/* QuickBooks Integration Documentation */}
            <div className="mt-8 pt-8 border-t border-gray-200">
              <QBDocs />
            </div>
          </div>
        )}

      {/* Invoice Modal */}
      {showInvoice && invoiceData && (
        <PrintableInvoice
          invoice={invoiceData}
          items={invoiceItems}
          payerSources={invoicePayerSources}
          onClose={() => setShowInvoice(false)}
        />
      )}

      {/* Reset-password result modal — persistent (not a toast) so the admin can
          read/copy the temporary password(s) and hand them to staff. */}
      {resetPwResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">
                {resetPwResult.length > 1 ? 'Passwords Reset' : 'Password Reset'}
              </h3>
              <button
                onClick={() => setResetPwResult(null)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="bg-success-50 border border-success-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-success-800 mb-1">
                  {resetPwResult.length > 1
                    ? `${resetPwResult.length} passwords reset.`
                    : `Password reset for ${resetPwResult[0].name}.`}
                </p>
                <p className="text-xs text-gray-600 mb-3">
                  Copy and give these credentials to the staff member. They will be required
                  to change the password on next login. This is the only time it is shown.
                </p>
                <div className="font-mono text-sm bg-white border border-gray-200 rounded p-3 space-y-2 max-h-64 overflow-y-auto">
                  {resetPwResult.map((c, i) => (
                    <div key={i} className={i > 0 ? 'pt-2 border-t border-gray-100' : ''}>
                      {resetPwResult.length > 1 && (
                        <div className="text-xs text-gray-500">{c.name}</div>
                      )}
                      <div><span className="text-gray-500">Username:</span> {c.username}</div>
                      <div><span className="text-gray-500">Password:</span> {c.temporary_password}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    const text = resetPwResult
                      .map(c => `${c.name} — username: ${c.username}, temporary password: ${c.temporary_password}`)
                      .join('\n');
                    navigator.clipboard?.writeText(text).then(
                      () => showToast('Credentials copied to clipboard', 'success'),
                      () => showToast('Could not copy — please copy manually', 'warning')
                    );
                  }}
                  className="px-4 py-2 text-primary-700 bg-white border border-primary-300 rounded-lg hover:bg-primary-50"
                >
                  Copy
                </button>
                <button
                  onClick={() => setResetPwResult(null)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Dashboard;
