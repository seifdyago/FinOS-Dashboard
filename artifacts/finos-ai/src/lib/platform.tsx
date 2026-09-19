import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { tenantCatalog } from '@/data/organization';
import type { Company } from '@/types/company';

export type PlatformTheme = 'dark' | 'light';

export type TransactionRecord = {
  id: string;
  merchant: string;
  customer: string;
  amount: number;
  status: 'Captured' | 'Review' | 'Refunded' | 'Failed';
  time: string;
  method: string;
  country: string;
};

export type CustomerRecord = {
  id: string;
  name: string;
  email: string;
  merchant: string;
  value: number;
  health: 'Healthy' | 'Review' | 'At risk';
  lastActive: string;
  segment: 'Enterprise' | 'Growth' | 'Emerging';
  notes: string[];
  activity: { label: string; time: string }[];
};

export type MerchantRecord = {
  id: string;
  name: string;
  segment: string;
  volume: number;
  growth: number;
  authRate: number;
  health: 'Healthy' | 'Review' | 'At risk';
  country: string;
};

export type ReportRecord = {
  id: string;
  name: string;
  type: string;
  date: string;
  status: 'Ready' | 'Generating';
};

export type PlatformNotification = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: 'signal' | 'success' | 'info';
  read: boolean;
};

export type WorkspaceUser = {
  name: string;
  email: string;
  avatar?: string;
  role: string;
  platform_admin_role?: string | null;
  initials: string;
  title: string;
  timezone: string;
};

export type WorkspacePreferences = {
  workspaceName: string;
  operatingContext: string;
  criticalAlerts: boolean;
  weeklyDigest: boolean;
};

export type TenantWorkspace = Company;

type PlatformContextValue = {
  tenant: TenantWorkspace;
  availableTenants: TenantWorkspace[];
  switchTenant: (tenantId: string) => void;
  theme: PlatformTheme;
  toggleTheme: () => void;
  user: WorkspaceUser;
  updateUser: (patch: Partial<WorkspaceUser>) => void;
  preferences: WorkspacePreferences;
  updatePreferences: (patch: Partial<WorkspacePreferences>) => void;
  notifications: PlatformNotification[];
  unreadNotifications: number;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  transactions: TransactionRecord[];
  customers: CustomerRecord[];
  merchants: MerchantRecord[];
  reports: ReportRecord[];
  addTransaction: (record: Omit<TransactionRecord, 'id' | 'time'>) => void;
  deleteTransaction: (id: string) => void;
  updateTransactionStatus: (id: string, status: TransactionRecord['status']) => void;
  addCustomer: (record: Omit<CustomerRecord, 'id' | 'lastActive'>) => void;
  updateCustomerHealth: (id: string, health: CustomerRecord['health']) => void;
  updateCustomerNotes: (id: string, notes: string[]) => void;
  addMerchant: (record: Omit<MerchantRecord, 'id'>) => void;
  deleteMerchant: (id: string) => void;
  updateMerchantHealth: (id: string, health: MerchantRecord['health']) => void;
  addReport: (record: Omit<ReportRecord, 'id' | 'date' | 'status'>) => void;
  deleteReport: (id: string) => void;
};

const initialTransactions: TransactionRecord[] = [
  { id: 'TX-84921', merchant: 'Northstar Market', customer: 'Maya Chen', amount: 1284, status: 'Captured', time: 'Today, 09:42', method: 'Visa •••• 4920', country: 'US' },
  { id: 'TX-84920', merchant: 'Solace Studio', customer: 'Noah Williams', amount: 348.5, status: 'Captured', time: 'Today, 09:38', method: 'Amex •••• 1098', country: 'UK' },
  { id: 'TX-84919', merchant: 'Kite Supply Co.', customer: 'Elena Rossi', amount: 2100, status: 'Review', time: 'Today, 09:31', method: 'Visa •••• 7721', country: 'IT' },
  { id: 'TX-84918', merchant: 'Morrow Health', customer: 'Liam Patel', amount: 89, status: 'Refunded', time: 'Today, 09:24', method: 'Mastercard •••• 1833', country: 'DE' },
  { id: 'TX-84917', merchant: 'Tide & Timber', customer: 'Ava Morgan', amount: 612.75, status: 'Captured', time: 'Today, 09:19', method: 'Visa •••• 4108', country: 'AU' },
  { id: 'TX-84916', merchant: 'Orchard Works', customer: 'Oliver Jones', amount: 4890, status: 'Captured', time: 'Today, 09:11', method: 'Visa •••• 2044', country: 'CA' },
  { id: 'TX-84915', merchant: 'Kindred Home', customer: 'Sophia Kim', amount: 176.2, status: 'Failed', time: 'Today, 08:57', method: 'Mastercard •••• 8114', country: 'US' },
  { id: 'TX-84914', merchant: 'Pollen Goods', customer: 'James Park', amount: 920, status: 'Captured', time: 'Today, 08:52', method: 'Visa •••• 3901', country: 'KR' },
];

const initialCustomers: CustomerRecord[] = [
  { id: 'C-01284', name: 'Maya Chen', email: 'maya.chen@northstar.co', merchant: 'Northstar Market', value: 8420.3, health: 'Healthy', lastActive: '2 min ago', segment: 'Growth', notes: ['Prefers monthly settlement summaries.'], activity: [{ label: 'Completed payment', time: '2 min ago' }, { label: 'Viewed settlement summary', time: 'Yesterday' }] },
  { id: 'C-01283', name: 'Noah Williams', email: 'noah@solacestudio.com', merchant: 'Solace Studio', value: 2810, health: 'Healthy', lastActive: '14 min ago', segment: 'Emerging', notes: [], activity: [{ label: 'Completed payment', time: '14 min ago' }] },
  { id: 'C-01282', name: 'Elena Rossi', email: 'elena@kitesupply.co', merchant: 'Kite Supply Co.', value: 16290.4, health: 'Review', lastActive: '31 min ago', segment: 'Enterprise', notes: ['Review high-value payment pattern with Sentinel.'], activity: [{ label: 'Payment flagged for review', time: '31 min ago' }, { label: 'Account health changed to Review', time: 'Yesterday' }] },
  { id: 'C-01281', name: 'Liam Patel', email: 'liam@morrowhealth.io', merchant: 'Morrow Health', value: 420, health: 'Healthy', lastActive: '1 hr ago', segment: 'Emerging', notes: [], activity: [{ label: 'Completed payment', time: '1 hr ago' }] },
  { id: 'C-01280', name: 'Ava Morgan', email: 'ava@tideandtimber.com', merchant: 'Tide & Timber', value: 6224.9, health: 'Healthy', lastActive: '2 hrs ago', segment: 'Growth', notes: ['QBR follow-up due next month.'], activity: [{ label: 'Completed payment', time: '2 hrs ago' }] },
  { id: 'C-01279', name: 'Oliver Jones', email: 'oliver@orchardworks.com', merchant: 'Orchard Works', value: 22410, health: 'At risk', lastActive: '3 hrs ago', segment: 'Enterprise', notes: ['Reach out about recent authorization decline rate.'], activity: [{ label: 'Account health changed to At risk', time: '3 hrs ago' }, { label: 'Payout reviewed', time: 'Yesterday' }] },
];

const initialMerchants: MerchantRecord[] = [
  { id: 'M-1042', name: 'Northstar Market', segment: 'Retail / US', volume: 4820000, growth: 18.4, authRate: 99.2, health: 'Healthy', country: 'US' },
  { id: 'M-1041', name: 'Solace Studio', segment: 'Services / UK', volume: 1260000, growth: 8.7, authRate: 98.6, health: 'Healthy', country: 'UK' },
  { id: 'M-1040', name: 'Kite Supply Co.', segment: 'Wholesale / IT', volume: 892000, growth: -2.1, authRate: 96.4, health: 'Review', country: 'IT' },
  { id: 'M-1039', name: 'Morrow Health', segment: 'Health / DE', volume: 774000, growth: 22.9, authRate: 99.5, health: 'Healthy', country: 'DE' },
  { id: 'M-1038', name: 'Tide & Timber', segment: 'Retail / AU', volume: 612000, growth: 11.3, authRate: 97.8, health: 'Healthy', country: 'AU' },
  { id: 'M-1037', name: 'Orchard Works', segment: 'Marketplace / CA', volume: 496000, growth: -4.8, authRate: 94.1, health: 'At risk', country: 'CA' },
];

const initialReports: ReportRecord[] = [
  { id: 'R-301', name: 'September executive close', type: 'Executive summary', date: 'Oct 02, 2024', status: 'Ready' },
  { id: 'R-302', name: 'Weekly risk review', type: 'Risk & compliance', date: 'Sep 30, 2024', status: 'Ready' },
  { id: 'R-303', name: 'Merchant Q3 performance', type: 'Merchant health', date: 'Sep 28, 2024', status: 'Ready' },
];

const initialNotifications: PlatformNotification[] = [
  { id: 'N-1', title: 'Sentinel flagged a velocity anomaly', detail: 'Kite Supply Co. has a new high-confidence pattern to review.', time: '4 minutes ago', kind: 'signal', read: false },
  { id: 'N-2', title: 'Ledger completed daily reconciliation', detail: 'All settlement batches are balanced within tolerance.', time: '32 minutes ago', kind: 'success', read: false },
  { id: 'N-3', title: 'Harbor found a conversion opportunity', detail: 'Solace Studio may benefit from a checkout experiment.', time: '1 hour ago', kind: 'info', read: true },
];

const initialPreferences: WorkspacePreferences = {
  workspaceName: 'Orbit Digital',
  operatingContext: 'Orbit Digital is a global payments platform serving thoughtful commerce brands.',
  criticalAlerts: true,
  weeklyDigest: false,
};

export function tenantForIdentity(identity: string): TenantWorkspace {
  const domain = identity.trim().toLowerCase().split('@')[1] || 'orbit.digital';
  const known = tenantCatalog.find((tenant) => tenant.domain === domain);
  if (known) return known;
  const base = domain.split('.')[0] || 'workspace';
  const name = base.split(/[-_.]/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(' ') || 'Workspace';
  return { id: base.replace(/[^a-z0-9]+/g, '-') || 'workspace', name, domain, initials: name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() };
}

function tenantKey(tenantId: string, key: string) {
  return `finos:${tenantId}:${key}`;
}

function readTenantStored<T>(tenantId: string, key: string, fallback: T, migrateLegacy = false): T {
  const scopedKey = tenantKey(tenantId, key);
  try {
    const scopedValue = localStorage.getItem(scopedKey);
    if (scopedValue !== null) return JSON.parse(scopedValue) as T;
  } catch {
    // Fall through to the migration/default path.
  }
  if (migrateLegacy) {
    try {
      const legacyValue = localStorage.getItem(`finos-${key}`);
      if (legacyValue !== null) {
        const legacy = JSON.parse(legacyValue) as T;
        localStorage.setItem(scopedKey, JSON.stringify(legacy));
        return legacy;
      }
    } catch {
      // Use the supplied fallback when an older value is malformed.
    }
  }
  return fallback;
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function normalizeCustomers(records: CustomerRecord[]): CustomerRecord[] {
  return records.map((customer) => ({
    ...customer,
    notes: customer.notes || [],
    activity: customer.activity || [{ label: 'Customer imported into workspace', time: 'Previously' }],
  }));
}

type WorkspaceApiRecord = {
  record_type: string;
  record_id: string;
  payload: Record<string, unknown>;
};

async function workspaceApi(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });
}

export async function loadWorkspaceRecords(recordType: string): Promise<WorkspaceApiRecord[]> {
  const response = await workspaceApi(`/api/workspace/data?types=${encodeURIComponent(recordType)}`);
  if (!response.ok) throw new Error(`Unable to load ${recordType} records`);
  const payload = await response.json() as { records?: WorkspaceApiRecord[] };
  return payload.records || [];
}

export async function saveWorkspaceRecord(recordType: string, recordId: string, payload: object): Promise<void> {
  const response = await workspaceApi(`/api/workspace/data/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`, {
    method: 'PUT',
    body: JSON.stringify({ payload }),
  });
  if (!response.ok) throw new Error(`Unable to save ${recordType} record`);
}

async function deleteWorkspaceRecord(recordType: string, recordId: string): Promise<void> {
  const response = await workspaceApi(`/api/workspace/data/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw new Error(`Unable to delete ${recordType} record`);
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantWorkspace>(() => tenantCatalog[0]);
  const [theme, setTheme] = useState<PlatformTheme>('dark');
  const [user, setUser] = useState<WorkspaceUser>(() => ({
    name: `${tenantCatalog[0].name} Admin`,
    email: `admin@${tenantCatalog[0].domain}`,
    avatar: '',
    role: 'Workspace admin',
    platform_admin_role: null,
    initials: `${tenantCatalog[0].initials}A`,
    title: 'Chief Operating Officer',
    timezone: 'Pacific Time (US & Canada)',
  }));
  const [preferences, setPreferences] = useState<WorkspacePreferences>({ ...initialPreferences });
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [merchants, setMerchants] = useState<MerchantRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    const loadWorkspaceData = async () => {
      const response = await workspaceApi('/api/workspace/data?types=preferences,notifications,transactions,customers,merchants,reports');
      if (!response.ok) throw new Error('Unable to load workspace data');
      const payload = await response.json() as { records?: WorkspaceApiRecord[] };
      const records = payload.records || [];
      const byType = (type: string) => records.filter((record) => record.record_type === type);
      const preference = byType('preferences')[0]?.payload;
      if (!mounted) return;
      if (preference) {
        setPreferences((current) => ({ ...current, ...(preference.preferences as Partial<WorkspacePreferences> || {}) }));
        if (preference.theme === 'light' || preference.theme === 'dark') setTheme(preference.theme);
      }
      setNotifications(byType('notifications').map((record) => record.payload as unknown as PlatformNotification));
      setTransactions(byType('transactions').map((record) => record.payload as unknown as TransactionRecord));
      setCustomers(normalizeCustomers(byType('customers').map((record) => record.payload as unknown as CustomerRecord)));
      setMerchants(byType('merchants').map((record) => record.payload as unknown as MerchantRecord));
      setReports(byType('reports').map((record) => record.payload as unknown as ReportRecord));

      const migrate = async (type: string, value: unknown) => {
        if (type === 'preferences') await saveWorkspaceRecord(type, 'workspace', { preferences: value, theme });
        else if (Array.isArray(value)) await Promise.all(value.map((item) => saveWorkspaceRecord(type, String((item as { id?: string }).id || crypto.randomUUID()), item as object)));
      };
      for (const type of ['preferences', 'notifications', 'transactions', 'customers', 'merchants', 'reports']) {
        const key = tenantKey(tenant.id, type);
        const raw = localStorage.getItem(key);
        if (!raw || byType(type).length) continue;
        try {
          const value = JSON.parse(raw);
          if (type === 'preferences' && value && typeof value === 'object') setPreferences((current) => ({ ...current, ...(value as Partial<WorkspacePreferences>) }));
          if (type === 'notifications' && Array.isArray(value)) setNotifications(value as PlatformNotification[]);
          if (type === 'transactions' && Array.isArray(value)) setTransactions(value as TransactionRecord[]);
          if (type === 'customers' && Array.isArray(value)) setCustomers(normalizeCustomers(value as CustomerRecord[]));
          if (type === 'merchants' && Array.isArray(value)) setMerchants(value as MerchantRecord[]);
          if (type === 'reports' && Array.isArray(value)) setReports(value as ReportRecord[]);
          await migrate(type, value);
          localStorage.removeItem(key);
        } catch {
          // PostgreSQL remains the source of truth when legacy data is malformed.
        }
      }
    };
    void loadWorkspaceData().catch(() => undefined);
    return () => { mounted = false; };
  }, [tenant.id]);

  const value = useMemo<PlatformContextValue>(() => ({
    tenant,
    availableTenants: tenantCatalog,
    switchTenant: (tenantId) => {
      const next = tenantCatalog.find((candidate) => candidate.id === tenantId);
      if (next && next.id !== tenant.id) setTenant(next);
    },
    theme,
    toggleTheme: () => setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      void saveWorkspaceRecord('preferences', 'workspace', { preferences, theme: next }).catch(() => undefined);
      return next;
    }),
    user,
    preferences,
    updateUser: (patch) => setUser((current) => ({ ...current, ...patch })),
    updatePreferences: (patch) => setPreferences((current) => {
      const next = { ...current, ...patch };
      void saveWorkspaceRecord('preferences', 'workspace', { preferences: next, theme }).catch(() => undefined);
      return next;
    }),
    notifications,
    unreadNotifications: notifications.filter((notification) => !notification.read).length,
    markNotificationRead: (id) => setNotifications((current) => current.map((notification) => {
      if (notification.id !== id) return notification;
      const next = { ...notification, read: true };
      void saveWorkspaceRecord('notifications', next.id, next).catch(() => undefined);
      return next;
    })),
    markAllNotificationsRead: () => setNotifications((current) => current.map((notification) => {
      const next = { ...notification, read: true };
      void saveWorkspaceRecord('notifications', next.id, next).catch(() => undefined);
      return next;
    })),
    transactions,
    customers,
    merchants,
    reports,
    addTransaction: (record) => setTransactions((current) => {
      const next = { ...record, id: `TX-${Date.now()}`, time: 'Just now' };
      void saveWorkspaceRecord('transactions', next.id, next).catch(() => undefined);
      return [next, ...current];
    }),
    deleteTransaction: (id) => { void deleteWorkspaceRecord('transactions', id).catch(() => undefined); setTransactions((current) => current.filter((transaction) => transaction.id !== id)); },
    updateTransactionStatus: (id, status) => setTransactions((current) => current.map((transaction) => {
      if (transaction.id !== id) return transaction;
      const next = { ...transaction, status };
      void saveWorkspaceRecord('transactions', id, next).catch(() => undefined);
      return next;
    })),
    addCustomer: (record) => setCustomers((current) => {
      const next = { ...record, id: `C-${Date.now()}`, lastActive: 'Just now', notes: record.notes || [], activity: record.activity || [{ label: 'Customer added to workspace', time: 'Just now' }] };
      void saveWorkspaceRecord('customers', next.id, next).catch(() => undefined);
      return [next, ...current];
    }),
    updateCustomerHealth: (id, health) => setCustomers((current) => current.map((customer) => {
      if (customer.id !== id) return customer;
      const next = { ...customer, health };
      void saveWorkspaceRecord('customers', id, next).catch(() => undefined);
      return next;
    })),
    updateCustomerNotes: (id, notes) => setCustomers((current) => current.map((customer) => {
      if (customer.id !== id) return customer;
      const next = { ...customer, notes };
      void saveWorkspaceRecord('customers', id, next).catch(() => undefined);
      return next;
    })),
    addMerchant: (record) => setMerchants((current) => {
      const next = { ...record, id: `M-${Date.now()}` };
      void saveWorkspaceRecord('merchants', next.id, next).catch(() => undefined);
      return [next, ...current];
    }),
    deleteMerchant: (id) => { void deleteWorkspaceRecord('merchants', id).catch(() => undefined); setMerchants((current) => current.filter((merchant) => merchant.id !== id)); },
    updateMerchantHealth: (id, health) => setMerchants((current) => current.map((merchant) => {
      if (merchant.id !== id) return merchant;
      const next = { ...merchant, health };
      void saveWorkspaceRecord('merchants', id, next).catch(() => undefined);
      return next;
    })),
    addReport: (record) => setReports((current) => {
      const next = { ...record, id: `R-${Date.now()}`, date: 'Just now', status: 'Ready' as const };
      void saveWorkspaceRecord('reports', next.id, next).catch(() => undefined);
      return [next, ...current];
    }),
    deleteReport: (id) => { void deleteWorkspaceRecord('reports', id).catch(() => undefined); setReports((current) => current.filter((report) => report.id !== id)); },
  }), [tenant, theme, user, preferences, notifications, transactions, customers, merchants, reports]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error('usePlatform must be used inside PlatformProvider');
  return value;
}
