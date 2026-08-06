import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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
  role: string;
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

type PlatformContextValue = {
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

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<PlatformTheme>(() => readStored('finos-theme', 'dark'));
  const [user, setUser] = useState<WorkspaceUser>(() => readStored('finos-user', {
    name: 'Jordan Shaw',
    email: 'jordan@orbit.digital',
    role: 'Workspace admin',
    initials: 'JS',
    title: 'Chief Operating Officer',
    timezone: 'Pacific Time (US & Canada)',
  }));
  const [preferences, setPreferences] = useState(() => readStored('finos-preferences', initialPreferences));
  const [notifications, setNotifications] = useState(() => readStored('finos-notifications', initialNotifications));
  const [transactions, setTransactions] = useState(() => readStored('finos-transactions', initialTransactions));
  const [customers, setCustomers] = useState(() => normalizeCustomers(readStored('finos-customers', initialCustomers)));
  const [merchants, setMerchants] = useState(() => readStored('finos-merchants', initialMerchants));
  const [reports, setReports] = useState(() => readStored('finos-reports', initialReports));

  useEffect(() => {
    localStorage.setItem('finos-theme', JSON.stringify(theme));
    document.documentElement.classList.toggle('theme-light', theme === 'light');
  }, [theme]);
  useEffect(() => localStorage.setItem('finos-user', JSON.stringify(user)), [user]);
  useEffect(() => localStorage.setItem('finos-preferences', JSON.stringify(preferences)), [preferences]);
  useEffect(() => localStorage.setItem('finos-notifications', JSON.stringify(notifications)), [notifications]);
  useEffect(() => localStorage.setItem('finos-transactions', JSON.stringify(transactions)), [transactions]);
  useEffect(() => localStorage.setItem('finos-customers', JSON.stringify(customers)), [customers]);
  useEffect(() => localStorage.setItem('finos-merchants', JSON.stringify(merchants)), [merchants]);
  useEffect(() => localStorage.setItem('finos-reports', JSON.stringify(reports)), [reports]);

  const value = useMemo<PlatformContextValue>(() => ({
    theme,
    toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark'),
    user,
    updateUser: (patch) => setUser((current) => ({ ...current, ...patch })),
    preferences,
    updatePreferences: (patch) => setPreferences((current) => ({ ...current, ...patch })),
    notifications,
    unreadNotifications: notifications.filter((notification) => !notification.read).length,
    markNotificationRead: (id) => setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, read: true } : notification)),
    markAllNotificationsRead: () => setNotifications((current) => current.map((notification) => ({ ...notification, read: true }))),
    transactions,
    customers,
    merchants,
    reports,
    addTransaction: (record) => setTransactions((current) => [{ ...record, id: `TX-${84922 + current.length}`, time: 'Just now' }, ...current]),
    deleteTransaction: (id) => setTransactions((current) => current.filter((transaction) => transaction.id !== id)),
    updateTransactionStatus: (id, status) => setTransactions((current) => current.map((transaction) => transaction.id === id ? { ...transaction, status } : transaction)),
    addCustomer: (record) => setCustomers((current) => [{ ...record, id: `C-${1285 + current.length}`, lastActive: 'Just now', notes: [], activity: [{ label: 'Customer added to workspace', time: 'Just now' }] }, ...current]),
    updateCustomerHealth: (id, health) => setCustomers((current) => current.map((customer) => customer.id === id ? { ...customer, health } : customer)),
    updateCustomerNotes: (id, notes) => setCustomers((current) => current.map((customer) => customer.id === id ? { ...customer, notes } : customer)),
    addMerchant: (record) => setMerchants((current) => [{ ...record, id: `M-${1043 + current.length}` }, ...current]),
    deleteMerchant: (id) => setMerchants((current) => current.filter((merchant) => merchant.id !== id)),
    updateMerchantHealth: (id, health) => setMerchants((current) => current.map((merchant) => merchant.id === id ? { ...merchant, health } : merchant)),
    addReport: (record) => setReports((current) => [{ ...record, id: `R-${304 + current.length}`, date: 'Just now', status: 'Ready' }, ...current]),
    deleteReport: (id) => setReports((current) => current.filter((report) => report.id !== id)),
  }), [theme, user, preferences, notifications, transactions, customers, merchants, reports]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error('usePlatform must be used inside PlatformProvider');
  return value;
}