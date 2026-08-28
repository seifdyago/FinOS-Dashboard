import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, Link, useLocation, useRoute } from 'wouter';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Bell, Bot, BriefcaseBusiness,
  Building2, Check, ChevronDown, ChevronRight, CircleDollarSign, Clock3, Command, CreditCard,
  Database, Download, Ellipsis, FileBarChart2, FileText, Filter, Fingerprint, Gauge, Globe2,
  Headphones, LayoutDashboard, LifeBuoy, ListFilter, LogOut, Menu, MessageSquare, MoreHorizontal,
  PackageCheck, PanelLeftClose, PanelLeftOpen, PieChart, Plus, RefreshCw, Search, Send, Settings,
  ShieldCheck, Sparkles, Target, TrendingUp, UserRound, Users, WalletCards, X, Zap,
  ArrowUpDown, CheckCircle2, ClipboardList, Grid2X2, List, Pencil, Power, Trash2,
  UserPlus, LineChart, CalendarDays, Clock4, Moon, Sun, User, UserCog, SlidersHorizontal,
  FileDown, MessageCircle, CheckCheck, CircleAlert, FileUp
} from 'lucide-react';
import NotFound from '@/pages/not-found';
import { PlatformProvider, tenantForIdentity, usePlatform, type CustomerRecord, type MerchantRecord, type TransactionRecord } from '@/lib/platform';
import { employees } from '@/data/employees';
import type { Employee } from '@/types/employee';
import { createCompanyOnboarding, recordActivityEvent, useGetPlatformAnalytics, type RecordActivityEventRequest } from '@workspace/api-client-react';
import {
  deleteKnowledgeFile,
  finalizeKnowledgeFile,
  getKnowledgeFileDownloadUrl,
  listKnowledgeFiles,
  requestKnowledgeFileUploadUrl,
  type KnowledgeFile,
} from '@workspace/api-client-react';

const queryClient = new QueryClient();

const PLATFORM_OWNER_EMAIL = 'seifdyago@gmail.com';
const PLATFORM_OWNER_PASSWORD_HASH = 'f5c300c99642e85eb995fda3f0bf88cf9002b16656344619ae4dba167750cc7e';
const AUTH_ACCOUNTS_KEY = 'finos-auth-accounts-v2';
const ACTIVE_ACCOUNT_KEY = 'finos-active-account-v2';

type StoredAuthAccount = {
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  accountType: 'platform_admin' | 'company' | 'individual';
  subscription: 'basic' | 'premium' | 'free';
  tenantId: string;
  tenantName: string;
  idDocument?: { name: string; type: string; size: number };
  createdAt: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function hashPassword(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getStoredAccounts(): StoredAuthAccount[] {
  try {
    const raw = localStorage.getItem(AUTH_ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) as StoredAuthAccount[] : [];
    const accounts = Array.isArray(parsed) ? parsed : [];
    if (!accounts.some((account) => normalizeEmail(account.email) === PLATFORM_OWNER_EMAIL)) {
      accounts.unshift({
        email: PLATFORM_OWNER_EMAIL,
        passwordHash: PLATFORM_OWNER_PASSWORD_HASH,
        name: 'Seifdyago',
        role: 'Platform owner',
        accountType: 'platform_admin',
        subscription: 'premium',
        tenantId: 'orbit-digital',
        tenantName: 'FinOS Platform',
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(accounts));
    }
    return accounts;
  } catch {
    return [{
      email: PLATFORM_OWNER_EMAIL,
      passwordHash: PLATFORM_OWNER_PASSWORD_HASH,
      name: 'Seifdyago',
      role: 'Platform owner',
      accountType: 'platform_admin',
      subscription: 'premium',
      tenantId: 'orbit-digital',
      tenantName: 'FinOS Platform',
      createdAt: new Date().toISOString(),
    }];
  }
}

function saveStoredAccounts(accounts: StoredAuthAccount[]): void {
  localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function accountTenant(account: StoredAuthAccount): { id: string; name: string; domain: string; initials: string } {
  const initials = account.tenantName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return {
    id: account.tenantId,
    name: account.tenantName,
    domain: account.email.split('@')[1] || 'local',
    initials: initials || 'FN',
  };
}

function isPlatformOwner(email: string): boolean {
  return normalizeEmail(email) === PLATFORM_OWNER_EMAIL;
}


type Icon = typeof Activity;

function reportWorkspaceActivity(
  organizationId: string,
  userEmail: string,
  event: RecordActivityEventRequest,
): void {
  void recordActivityEvent(event, {
    headers: {
      'x-finos-organization-id': organizationId,
      'x-finos-user-email': userEmail,
    },
  }).catch(() => {
    // Telemetry is additive and must not block customer workflows.
  });
}

type EmployeeDraft = {
  name: string;
  role: string;
  department: string;
  description: string;
  skills: string[];
  responsibilities: string[];
  permissions: string[];
  knowledge: string[];
  knowledgeSource: string;
  systemPrompt: string;
  personality: string;
  avatar: string;
  color: string;
  status: string;
  manager: string;
};
type EmployeeContextValue = {
  employees: Employee[];
  addEmployee: (draft: EmployeeDraft) => void;
  updateEmployee: (id: string, draft: EmployeeDraft) => void;
  deleteEmployee: (id: string) => void;
  toggleEmployee: (id: string) => void;
};

const EmployeesContext = createContext<EmployeeContextValue | null>(null);
const employeeRoleKey = (role: string) => role.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

function EmployeesProvider({ children }: { children: ReactNode }) {
  const { tenant } = usePlatform();
  const [roster, setRoster] = useState<Employee[]>(() => {
    try {
      const key = `finos:${tenant.id}:employees`;
      const stored = localStorage.getItem(key) || (tenant.id === 'orbit-digital' ? localStorage.getItem('finos-employees') : null);
      const parsed = stored ? JSON.parse(stored) as Employee[] : tenant.id === 'orbit-digital' ? employees : [];
      const uniqueParsed = parsed.reduce<Employee[]>((unique, employee) => {
        if (!unique.some((existing) => existing.id === employee.id || employeeRoleKey(existing.role) === employeeRoleKey(employee.role))) {
          unique.push(employee);
        }
        return unique;
      }, []);
      const merged = tenant.id === 'orbit-digital'
        ? [...uniqueParsed, ...employees.filter((seed) => !uniqueParsed.some((existing) => existing.id === seed.id || employeeRoleKey(existing.role) === employeeRoleKey(seed.role)))]
        : uniqueParsed;
      return merged.map((employee) => ({
        ...employee,
        responsibilities: employee.responsibilities || [],
        permissions: employee.permissions || ['read:transactions', 'read:customers'],
        knowledge: employee.knowledge || [],
        knowledgeSource: employee.knowledgeSource || '',
        systemPrompt: employee.systemPrompt || '',
        personality: employee.personality || 'Thoughtful and clear',
        avatar: employee.avatar || '',
        manager: employee.manager || 'Workspace admin',
      }));
    } catch {
      return tenant.id === 'orbit-digital' ? employees : [];
    }
  });

  useEffect(() => {
    localStorage.setItem(`finos:${tenant.id}:employees`, JSON.stringify(roster));
  }, [roster, tenant.id]);

  const addEmployee = (draft: EmployeeDraft) => {
    const initials = draft.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    const accent = '#2a9eb7';
    setRoster((current) => [...current, {
       ...draft,
      id: `${draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      initials,
       color: draft.color || '#5bd5ee',
      accent: draft.color || accent,
      status: draft.status || 'Ready',
      active: true,
      metric: '閳ワ拷',
      metricLabel: 'no activity yet',
      permissions: draft.permissions,
      knowledge: draft.knowledge,
      knowledgeSource: draft.knowledgeSource,
      manager: draft.manager,
      performance: 0,
      lastActive: 'Just now',
      tasks: ['Complete onboarding checklist', 'Review assigned context', 'Prepare first operating brief'],
    }]);
  };

  const updateEmployee = (id: string, draft: EmployeeDraft) => {
    setRoster((current) => current.map((employee) => employee.id === id ? {
      ...employee,
      ...draft,
      initials: draft.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    } : employee));
  };

  const deleteEmployee = (id: string) => setRoster((current) => current.filter((employee) => employee.id !== id));
  const toggleEmployee = (id: string) => setRoster((current) => current.map((employee) => employee.id === id ? {
    ...employee,
    active: !employee.active,
    status: employee.active ? 'Paused' : 'Ready',
  } : employee));

  return <EmployeesContext.Provider value={{ employees: roster, addEmployee, updateEmployee, deleteEmployee, toggleEmployee }}>{children}</EmployeesContext.Provider>;
}

function useEmployees() {
  const value = useContext(EmployeesContext);
  if (!value) throw new Error('useEmployees must be used inside EmployeesProvider');
  return value;
}

const builderPermissions = [
  'read:transactions', 'review:risk', 'manage:customers', 'manage:merchants',
  'create:reports', 'send:notifications', 'approve:payouts', 'manage:knowledge',
  'read:employees', 'manage:attendance', 'manage:leave', 'view:payroll',
  'manage:recruiting', 'manage:learning', 'manage:performance', 'manage:payroll',
];

const builderKnowledgeSources = ['Workspace context', 'Transaction history', 'Merchant catalog', 'Policy library', 'Uploaded playbook', 'HR policy library', 'Recruiting playbook', 'Talent knowledge base', 'Learning library', 'Performance handbook', 'Payroll policy library'];

function getNavGroups(showMerchant: boolean) {
  return [
    { label:'Command center', items:[['/', 'Overview', LayoutDashboard], ['/ai-employees', 'AI employees', Bot], ['/assistant', 'AI assistant', MessageCircle]] },
    { label:'Money movement', items:[['/transactions', 'Transactions', ArrowUpRight], ['/customers', 'Customers', Users], ...(showMerchant ? [['/merchants', 'Merchants', Building2]] : [])] },
    { label:'Intelligence', items:[['/reports', 'Reports', FileBarChart2], ['/analytics', 'Analytics', BarChart3], ['/knowledge', 'Company knowledge', FileText]] },
    { label:'Platform', items:[['/platform-admin', 'Platform admin', ShieldCheck]] },
  ];
}

const transactions = [
  ['TX-84921','Northstar Market','Maya Chen','1,284.00','Captured','Today, 09:42','Visa 閳モ懇鈧懇鈧懇鈧拷 4920'],
  ['TX-84920','Solace Studio','Noah Williams','348.50','Captured','Today, 09:38','Amex 閳モ懇鈧懇鈧懇鈧拷 1098'],
  ['TX-84919','Kite Supply Co.','Elena Rossi','2,100.00','Review','Today, 09:31','Visa 閳モ懇鈧懇鈧懇鈧拷 7721'],
  ['TX-84918','Morrow Health','Liam Patel','89.00','Refunded','Today, 09:24','Mastercard 閳モ懇鈧懇鈧懇鈧拷 1833'],
  ['TX-84917','Tide & Timber','Ava Morgan','612.75','Captured','Today, 09:19','Visa 閳モ懇鈧懇鈧懇鈧拷 4108'],
  ['TX-84916','Orchard Works','Oliver Jones','4,890.00','Captured','Today, 09:11','Visa 閳モ懇鈧懇鈧懇鈧拷 2044'],
  ['TX-84915','Kindred Home','Sophia Kim','176.20','Failed','Today, 08:57','Mastercard 閳モ懇鈧懇鈧懇鈧拷 8114'],
  ['TX-84914','Pollen Goods','James Park','920.00','Captured','Today, 08:52','Visa 閳モ懇鈧懇鈧懇鈧拷 3901'],
];

const customers = [
  ['C-01284','Maya Chen','maya.chen@northstar.co','Northstar Market','$8,420.30','Healthy','2 min ago'],
  ['C-01283','Noah Williams','noah@solacestudio.com','Solace Studio','$2,810.00','Healthy','14 min ago'],
  ['C-01282','Elena Rossi','elena@kitesupply.co','Kite Supply Co.','$16,290.40','Review','31 min ago'],
  ['C-01281','Liam Patel','liam@morrowhealth.io','Morrow Health','$420.00','Healthy','1 hr ago'],
  ['C-01280','Ava Morgan','ava@tideandtimber.com','Tide & Timber','$6,224.90','Healthy','2 hrs ago'],
  ['C-01279','Oliver Jones','oliver@orchardworks.com','Orchard Works','$22,410.00','At risk','3 hrs ago'],
];

const merchants = [
  ['Northstar Market','Retail / US','$4.82M','+18.4%','99.2%','Healthy','#34d399'],
  ['Solace Studio','Services / UK','$1.26M','+8.7%','98.6%','Healthy','#34d399'],
  ['Kite Supply Co.','Wholesale / IT','$892K','-2.1%','96.4%','Review','#f2c66a'],
  ['Morrow Health','Health / DE','$774K','+22.9%','99.5%','Healthy','#34d399'],
  ['Tide & Timber','Retail / AU','$612K','+11.3%','97.8%','Healthy','#34d399'],
  ['Orchard Works','Marketplace / CA','$496K','-4.8%','94.1%','At risk','#ff8576'],
];

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5" data-testid="brand-finos">
    <div className="relative grid h-8 w-8 place-items-center rounded-[9px] bg-[#8b5cf6] text-[#07111f]">
      <span className="absolute h-[2px] w-4 rotate-45 bg-[#07111f]" /><span className="absolute h-[2px] w-4 -rotate-45 bg-[#07111f]" />
      <span className="h-1.5 w-1.5 rounded-full bg-[#07111f]" />
    </div>
    {!compact && <span className="display-font text-[19px] font-bold tracking-[-.04em] text-[#edf7fb]">finos<span className="text-[#8b5cf6]">.</span></span>}
  </div>;
}

function Status({ children }: { children: string }) {
  const styles: Record<string,string> = { Captured:'border-[#167d5a] bg-[#0d3b2c] text-[#6fe0bd]', Healthy:'border-[#167d5a] bg-[#0d3b2c] text-[#6fe0bd]', Review:'border-[#947d43] bg-[#392f17] text-[#f6d47c]', Refunded:'border-[#51627c] bg-[#1a293b] text-[#9db2ca]', Failed:'border-[#944e55] bg-[#3c2028] text-[#ff9b90]', 'At risk':'border-[#944e55] bg-[#3c2028] text-[#ff9b90]' };
  return <span className={`status-pill ${styles[children] || 'border-[#45657b] bg-[#183044] text-[#9ac3d1]'}`}>{children}</span>;
}

function Sparkline({ values, color = '#8b5cf6', fill = false }: { values:number[]; color?:string; fill?:boolean }) {
  const points = values.map((v,i) => `${(i/(values.length-1))*100},${100-v}`).join(' ');
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
    {fill && <polygon points={`0,100 ${points} 100,100`} fill={color} opacity=".09" />}
    <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function TinyBars({ color = '#8b5cf6' }: { color?: string }) {
  return <div className="flex h-9 items-end gap-[3px]">{[42,57,38,75,65,82,59,91,73,88,79,100].map((h,i)=><div key={i} className="w-1.5 rounded-t-sm" style={{height:`${h}%`, background:i===11 ? '#eef8fa' : color, opacity:i===11 ? 1 : .65}} />)}</div>;
}

function Shell({ children, onLogout }: { children:ReactNode; onLogout:()=>void }) {
  const { employees: roster } = useEmployees();
  const platform = usePlatform();
  const isOwner = isPlatformOwner(platform.user.email);
  const navGroups = useMemo(() => getNavGroups(isOwner), [isOwner]);
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => { const onKey = (e:KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='k') { e.preventDefault(); setCommandOpen(true); } if(e.key==='Escape') setCommandOpen(false); }; window.addEventListener('keydown',onKey); return()=>window.removeEventListener('keydown',onKey); },[]);
  const go = (path:string) => { setLocation(path); setMobileOpen(false); };
  const currentLabel = location === '/' ? 'Overview' : location.split('/').filter(Boolean).map(s=>s.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')).join(' / ');
  const globalResults = [
    ...platform.transactions.map((item) => ({ path: '/transactions', label: `${item.id} 璺� ${item.merchant}`, detail: `$${item.amount.toLocaleString()} 璺� ${item.status}` })),
    ...platform.customers.map((item) => ({ path: '/customers', label: item.name, detail: `${item.email} 璺� ${item.merchant}` })),
    ...platform.merchants.map((item) => ({ path: '/merchants', label: item.name, detail: `${item.segment} 璺� ${item.health}` })),
    ...platform.reports.map((item) => ({ path: '/reports', label: item.name, detail: `${item.type} 璺� ${item.status}` })),
  ];
  const filteredCommands = [...navGroups.flatMap(g=>g.items.map(([path,label])=>({path:path as string,label:label as string,detail:'Navigate'}))), ...roster.map(e=>({path:`/ai-employees/${e.id}/details`,label:e.name,detail:e.role})), ...globalResults].filter(x=>`${x.label} ${x.detail}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="noise app-shell flex">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[#172c40] bg-[#090b18] transition-transform duration-200 md:translate-x-0 ${mobileOpen?'translate-x-0':'-translate-x-full'}`}>
      <div className="flex h-[73px] items-center border-b border-[#172c40] px-6"><Logo /></div>
      <div className="border-b border-[#172c40] px-4 py-4">
        <label className="relative flex items-center gap-3" title="Switch company workspace">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#204e61] text-sm font-bold text-[#94e6ef]">{platform.tenant.initials}</div>
          <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-[#e2edf5]">{platform.tenant.name}</div><div className="text-[11px] text-[#738ba1]">Isolated company workspace</div></div>
          <select value={platform.tenant.id} onChange={(event) => platform.switchTenant(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Switch company workspace" data-testid="select-tenant-workspace">
            {[...platform.availableTenants, platform.tenant].filter((candidate, index, all) => all.findIndex((item) => item.id === candidate.id) === index).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
          <ChevronDown size={14} className="text-[#6d859a]" />
        </label>
      </div>
      <nav className="scrollbar flex-1 overflow-y-auto px-3 py-5">
        {navGroups.map(group=><div key={group.label} className="mb-6"><div className="kicker mb-2 px-3">{group.label}</div>{group.items.map(([path,label,NavIcon])=><Link key={path as string} href={path as string} onClick={()=>setMobileOpen(false)} className={`nav-link mb-1 flex items-center gap-3 rounded-r-lg px-3 py-2.5 text-[13px] font-medium ${location===path?'active':''}`} data-testid={`link-nav-${(label as string).toLowerCase().replaceAll(' ','-')}`}><NavIcon size={16} strokeWidth={1.7}/><span>{label as string}</span>{path==='/ai-employees'&&<span className="ml-auto rounded-full bg-[#173b48] px-1.5 py-0.5 text-[9px] text-[#61d8e6]">{roster.length}</span>}</Link>)}</div>)}
        <div className="mb-2 px-3 kicker">Your AI team</div>
        {roster.map(e=><Link key={e.id} href={`/ai-employees/${e.id}/details`} onClick={()=>setMobileOpen(false)} className={`nav-link mb-1 flex items-center gap-3 rounded-r-lg px-3 py-2 text-[12px] ${location===`/ai-employees/${e.id}` || location===`/ai-employees/${e.id}/details`?'active':''}`} data-testid={`link-employee-${e.id}`}><span className="grid h-6 w-6 place-items-center rounded-md text-[9px] font-bold" style={{background:`${e.accent}25`,color:e.color}}>{e.initials}</span><span className="truncate">{e.name}</span><span className={`live-dot ml-auto h-1.5 w-1.5 rounded-full ${e.active?'':'opacity-30'}`} style={{background:e.color}} /></Link>)}
      </nav>
      <div className="border-t border-[#172c40] p-3"><Link href="/settings" className={`nav-link flex items-center gap-3 rounded-r-lg px-3 py-2.5 text-[13px] ${location==='/settings'?'active':''}`} data-testid="link-settings"><Settings size={16}/><span>Settings</span></Link><button onClick={onLogout} className="nav-link mt-1 flex w-full items-center gap-3 rounded-r-lg px-3 py-2.5 text-[13px]" data-testid="button-logout"><LogOut size={16}/><span>Sign out</span></button></div>
    </aside>
    {mobileOpen&&<button className="fixed inset-0 z-30 bg-[#050611]/70 md:hidden" onClick={()=>setMobileOpen(false)} aria-label="Close navigation" />}
    <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col md:pl-[248px]">
      <header className="sticky top-0 z-20 flex h-[73px] items-center gap-3 border-b border-[#172c40] bg-[#090b18]/90 px-4 backdrop-blur-xl md:px-8">
        <button className="mr-1 rounded-md p-2 text-[#9ab0c3] hover:bg-[#142a3b] md:hidden" onClick={()=>setMobileOpen(true)} data-testid="button-open-mobile-nav"><Menu size={20}/></button>
        <div className="min-w-0 flex-1"><div className="kicker mb-1">{location.includes('/ai-employees')?'AI workforce':'FinOS command center'}</div><div className="display-font truncate text-[17px] font-semibold text-[#f8fafc]">{currentLabel}</div></div>
        <button onClick={()=>setCommandOpen(true)} className="hidden h-9 w-[220px] items-center gap-2 rounded-lg border border-[#203b50] bg-[#0c1b2b] px-3 text-left text-[12px] text-[#6f879c] sm:flex" data-testid="button-open-command"><Search size={15}/><span>Search anything...</span><span className="mono ml-auto rounded border border-[#29445a] px-1.5 py-0.5 text-[9px]">閳憋拷 K</span></button>
        <button onClick={()=>setCommandOpen(true)} className="rounded-lg p-2 text-[#8ba1b4] hover:bg-[#142a3b] sm:hidden" data-testid="button-open-search"><Search size={18}/></button>
         <button onClick={()=>setNotificationsOpen(!notificationsOpen)} className="relative rounded-lg p-2 text-[#8ba1b4] hover:bg-[#142a3b]" data-testid="button-notifications"><Bell size={17}/>{platform.unreadNotifications > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#ff897a]" />}</button>
        <div className="hidden h-7 w-px bg-[#203447] sm:block" />
         <div className="relative"><button onClick={()=>setUserMenuOpen(!userMenuOpen)} className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-[#142a3b]" data-testid="button-user-menu"><div className="grid h-7 w-7 place-items-center rounded-full bg-[#cb9eeb] text-[10px] font-bold text-[#182033]">{platform.user.initials}</div><span className="hidden text-[12px] font-semibold text-[#cddbe6] lg:block">{platform.user.name}</span><ChevronDown size={13} className="hidden text-[#718ba1] lg:block"/></button>{userMenuOpen&&<div className="absolute right-0 top-11 z-30 w-48 rounded-xl border border-[#29465d] bg-[#0d1e30] p-1.5 shadow-2xl"><Link href="/profile" onClick={()=>setUserMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] text-[#c7d8e1] hover:bg-[#26194d]"><UserRound size={14}/> My profile</Link><Link href="/notifications" onClick={()=>setUserMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] text-[#c7d8e1] hover:bg-[#26194d]"><Bell size={14}/> Notifications {platform.unreadNotifications > 0 && <span className="ml-auto text-[#ff9b90]">{platform.unreadNotifications}</span>}</Link><button onClick={()=>{platform.toggleTheme();setUserMenuOpen(false)}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] text-[#c7d8e1] hover:bg-[#26194d]">{platform.theme==='dark'?<Sun size={14}/>:<Moon size={14}/>} Use {platform.theme==='dark'?'light':'dark'} mode</button><button onClick={()=>{go('/settings');setUserMenuOpen(false)}} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] text-[#c7d8e1] hover:bg-[#26194d]"><Settings size={14}/> Settings</button></div>}</div>
      </header>
       {notificationsOpen&&<div className="absolute right-5 top-[63px] z-30 w-[310px] rounded-xl border border-[#29465d] bg-[#0d1e30] p-4 shadow-2xl" data-testid="panel-notifications"><div className="mb-3 flex items-center justify-between"><span className="font-semibold text-[#e6f1f6]">Notifications</span><Link href="/notifications" onClick={()=>setNotificationsOpen(false)} className="text-[10px] text-[#8b5cf6]">View all</Link></div>{platform.notifications.slice(0,3).map((item)=><button key={item.id} onClick={()=>{platform.markNotificationRead(item.id);setNotificationsOpen(false);setLocation('/notifications')}} className="mb-3 block w-full border-l-2 border-[#8b5cf6] py-1 pl-3 text-left last:mb-0"><div className="text-[12px] text-[#d9e9ef]">{item.title}</div><div className="mt-1 text-[10px] text-[#758da2]">{item.time}</div></button>)}</div>}
      <main className="min-w-0 flex-1 px-4 py-7 md:px-8 lg:px-10">{children}</main>
    </div>
     {commandOpen&&<div className="fixed inset-0 z-50 flex items-start justify-center bg-[#050611]/75 px-4 pt-[13vh]" onMouseDown={()=>setCommandOpen(false)}><div className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-[#4a3a78] bg-[#0d1020] shadow-2xl" onMouseDown={e=>e.stopPropagation()} data-testid="dialog-command"><div className="flex items-center gap-3 border-b border-[#203b50] px-5 py-4"><Search size={18} className="text-[#8b5cf6]"/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search pages, payments, customers, merchants..." className="flex-1 bg-transparent text-sm text-[#e7f3f7] outline-none" data-testid="input-command-search"/><button onClick={()=>setCommandOpen(false)} className="rounded bg-[#172d40] px-2 py-1 text-[10px] text-[#8ca4b8]">ESC</button></div><div className="max-h-[390px] overflow-y-auto p-2">{filteredCommands.length?filteredCommands.map((item,index)=><button key={`${item.path}-${item.label}-${index}`} onClick={()=>{go(item.path);setCommandOpen(false);setQuery('')}} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[13px] text-[#c5d5e0] hover:bg-[#173448]" data-testid={`command-${item.path.replaceAll('/','-')}-${index}`}><span className="flex items-center gap-3"><Command size={14} className="text-[#5c8295]"/><span><span className="block">{item.label}</span><span className="mt-0.5 block text-[10px] text-[#6f899c]">{item.detail}</span></span></span><ChevronRight size={14} className="text-[#55748b]"/></button>):<div className="px-3 py-10 text-center text-sm text-[#71899d]">No matching records</div>}</div><div className="flex items-center gap-4 border-t border-[#203b50] px-5 py-3 text-[10px] text-[#71899d]"><span><kbd className="rounded border border-[#2b485b] px-1">閳憋拷 K</kbd> open search</span><span><kbd className="rounded border border-[#2b485b] px-1">ESC</kbd> close</span></div></div></div>}
  </div>;
}

function SectionHeader({ eyebrow, title, description, action }: {eyebrow?:string;title:string;description?:string;action?:ReactNode}) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="kicker mb-2">{eyebrow || 'Operations'}</div><h1 className="display-font text-[28px] font-semibold tracking-[-.04em] text-[#f8fafc] md:text-[34px]">{title}</h1>{description&&<p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#8196aa]">{description}</p>}</div>{action&&<div className="shrink-0">{action}</div>}</div>;
}

function MetricCard({ label, value, delta, icon:MetricIcon, color='#8b5cf6', children }: {label:string;value:string;delta?:string;icon:Icon;color?:string;children?:ReactNode}) {
  return <div className="panel fade-up p-5"><div className="mb-5 flex items-start justify-between"><div className="kicker">{label}</div><div className="grid h-8 w-8 place-items-center rounded-lg" style={{background:`${color}18`,color}}><MetricIcon size={16}/></div></div><div className="display-font text-[26px] font-semibold tracking-[-.05em] text-[#f8fafc]">{value}</div><div className="mt-2 flex items-center gap-1.5 text-[11px]"><span style={{color}}>{delta}</span>{delta&&<span className="text-[#6e8498]">vs previous period</span>}</div>{children}</div>;
}

function formatDashboardMoney(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function Dashboard() {
  const { tenant, preferences, transactions: tenantTransactions, customers: tenantCustomers, merchants: tenantMerchants } = usePlatform();
  const { employees: roster } = useEmployees();
  const [range, setRange] = useState('7D');
  const [briefOpen, setBriefOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const metrics = useMemo(() => {
    const totalVolume = tenantTransactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const captured = tenantTransactions.filter((tx) => tx.status === 'Captured').length;
    const review = tenantTransactions.filter((tx) => tx.status === 'Review').length;
    const failed = tenantTransactions.filter((tx) => tx.status === 'Failed').length;
    const refunded = tenantTransactions.filter((tx) => tx.status === 'Refunded').length;
    const successfulRate = tenantTransactions.length ? (captured / tenantTransactions.length) * 100 : 0;
    const healthyMerchants = tenantMerchants.filter((merchant) => merchant.health === 'Healthy').length;
    const reviewMerchants = tenantMerchants.filter((merchant) => merchant.health === 'Review').length;
    const atRiskMerchants = tenantMerchants.filter((merchant) => merchant.health === 'At risk').length;
    const activeEmployees = roster.filter((employee) => employee.active).length;
    return { totalVolume, captured, review, failed, refunded, successfulRate, healthyMerchants, reviewMerchants, atRiskMerchants, activeEmployees,
      merchantHealthRate: tenantMerchants.length ? (healthyMerchants / tenantMerchants.length) * 100 : 0 };
  }, [tenantTransactions, tenantMerchants, roster]);

  const localDateTime = new Intl.DateTimeFormat(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(currentTime);

  const chartValues = useMemo(() => {
    const source = tenantTransactions.slice().reverse().map((tx) => Number(tx.amount || 0));
    if (!source.length) return [18, 28, 24, 42, 36, 54, 48, 64, 58, 72, 66, 80];
    const max = Math.max(...source, 1);
    return source.slice(-12).map((value) => Math.max(12, Math.round((value / max) * 88)));
  }, [tenantTransactions]);

  const signals = [
    metrics.review > 0 ? { text: `${metrics.review} transaction${metrics.review === 1 ? '' : 's'} need review`, detail: 'Live transaction data', color: '#fbbf24', icon: AlertTriangle } : null,
    metrics.failed > 0 ? { text: `${metrics.failed} failed payment${metrics.failed === 1 ? '' : 's'}`, detail: 'Live transaction data', color: '#fb7185', icon: CircleAlert } : null,
    metrics.atRiskMerchants > 0 ? { text: `${metrics.atRiskMerchants} merchant${metrics.atRiskMerchants === 1 ? '' : 's'} at risk`, detail: 'Live merchant health', color: '#fb7185', icon: ShieldCheck } : null,
    metrics.review === 0 && metrics.failed === 0 && metrics.atRiskMerchants === 0 ? { text: 'No open risk signals in current workspace data', detail: 'Live workspace check', color: '#34d399', icon: CheckCircle2 } : null,
  ].filter(Boolean) as Array<{text:string;detail:string;color:string;icon:Icon}>;

  return <div className="mx-auto max-w-[1480px]">
    <div className="relative mb-8 overflow-hidden rounded-[28px] border border-violet-500/20 bg-[radial-gradient(circle_at_85%_15%,rgba(139,92,246,.24),transparent_34%),radial-gradient(circle_at_25%_0%,rgba(59,130,246,.16),transparent_30%),#090b18] p-6 shadow-[0_24px_80px_rgba(0,0,0,.35)] md:p-8">
      <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-violet-300">
            <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1">FinOS Command Center</span><span className="text-slate-600">/</span><span>{tenant.name}</span>
          </div>
          <h1 className="display-font text-3xl font-semibold tracking-[-.05em] text-white md:text-5xl">Good evening, {preferences.workspaceName}.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Your live operating picture across payments, customers, merchants, and the AI workforce.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-slate-500"><span>{localDateTime}</span><span className="h-1 w-1 rounded-full bg-emerald-400" /><span className="text-emerald-300">Live workspace data</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setBriefOpen(true)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-white/10"><Sparkles size={14} className="text-violet-300"/> Morning brief</button>
          <button onClick={() => { setSaved(!saved); toast.success(saved ? 'View removed from reports' : 'Live view saved to reports'); }} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-900/30">{saved ? <Check size={14}/> : <Plus size={14}/>} {saved ? 'Saved' : 'Save view'}</button>
        </div>
      </div>
    </div>

    <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Workspace payment volume" value={formatDashboardMoney(metrics.totalVolume)} delta={`${tenantTransactions.length} records`} icon={CircleDollarSign} color="#a78bfa" />
      <MetricCard label="Successful payments" value={`${metrics.successfulRate.toFixed(1)}%`} delta={`${metrics.captured} captured`} icon={CheckCircle2} color="#34d399" />
      <MetricCard label="Active merchants" value={tenantMerchants.length.toLocaleString()} delta={`${metrics.healthyMerchants} healthy`} icon={Building2} color="#60a5fa" />
      <MetricCard label="Open risk signals" value={(metrics.review + metrics.atRiskMerchants).toLocaleString()} delta={`${metrics.failed} failed payments`} icon={ShieldCheck} color="#fb7185" />
    </div>

    <div className="mb-5 grid gap-5 xl:grid-cols-[1.5fr_.8fr]">
      <div className="panel relative overflow-hidden p-5 md:p-6">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><div className="kicker mb-1 text-violet-300">Payment intelligence</div><div className="text-base font-semibold text-white">Live payment activity</div><div className="mt-1 text-[11px] text-slate-500">Calculated from transactions currently available to this workspace.</div></div>
          <div className="flex items-center gap-1 rounded-xl border border-white/5 bg-white/[.03] p-1">{['24H','7D','30D','90D'].map((x)=><button key={x} onClick={()=>setRange(x)} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold ${range===x?'bg-violet-500/20 text-violet-200':'text-slate-500'}`}>{x}</button>)}</div>
        </div>
        <div className="relative h-[245px]">
          <div className="absolute inset-0 flex flex-col justify-between text-[10px] text-slate-600"><span>{formatDashboardMoney(metrics.totalVolume)}</span><span>75%</span><span>50%</span><span>25%</span><span>$0</span></div>
          <div className="ml-12 h-full"><div className="flex h-full flex-col justify-between">{[0,1,2,3,4].map(i=><div className="border-t border-dashed border-white/[.06]" key={i}/>)}</div><div className="absolute bottom-5 left-12 right-0 top-0"><Sparkline values={chartValues} color="#8b5cf6" fill/><div className="absolute bottom-[-22px] left-0 right-0 flex justify-between text-[10px] text-slate-600">{['1','2','3','4','5','6','Now'].map(x=><span key={x}>{x}</span>)}</div></div></div>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-5 text-[10px] text-slate-500"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-violet-400"/>Payment volume</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-emerald-400"/>Captured: {metrics.captured}</span><span className="ml-auto mono text-slate-300">{range} 璺� {formatDashboardMoney(metrics.totalVolume)}</span></div>
      </div>

      <div className="panel p-5 md:p-6">
        <div className="mb-5 flex items-start justify-between"><div><div className="kicker mb-1 text-violet-300">AI signal desk</div><div className="text-base font-semibold text-white">What needs attention</div></div><Link href="/ai-employees" className="text-[11px] text-violet-300">View AI team <ChevronRight size={12} className="inline"/></Link></div>
        <div className="space-y-2">{signals.map((signal,index)=>{const SignalIcon=signal.icon;return <div key={index} className="flex gap-3 rounded-xl border border-white/[.05] bg-white/[.02] p-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[.04]" style={{color:signal.color}}><SignalIcon size={15}/></div><div><div className="text-[12px] font-medium text-slate-200">{signal.text}</div><div className="mt-1 text-[10px] text-slate-500">{signal.detail}</div></div></div>})}</div>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border border-white/[.06] bg-white/[.025] p-3"><div className="kicker">AI workforce</div><div className="mt-1 text-xl font-semibold text-white">{metrics.activeEmployees}/{roster.length}</div><div className="text-[10px] text-slate-500">active employees</div></div><div className="rounded-xl border border-white/[.06] bg-white/[.025] p-3"><div className="kicker">Merchant health</div><div className="mt-1 text-xl font-semibold text-white">{metrics.merchantHealthRate.toFixed(0)}%</div><div className="text-[10px] text-slate-500">healthy portfolio</div></div></div>
      </div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <div className="panel overflow-hidden"><div className="flex items-center justify-between border-b border-white/[.06] px-5 py-4"><div><div className="kicker mb-1 text-violet-300">Latest activity</div><div className="text-sm font-semibold text-white">Recent transactions</div></div><Link href="/transactions" className="text-[11px] text-violet-300">View all <ChevronRight size={12} className="inline"/></Link></div><div className="scrollbar overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b border-white/[.05] text-[10px] uppercase tracking-[.12em] text-slate-600"><th className="px-5 py-3 font-medium">Transaction</th><th className="px-3 py-3 font-medium">Merchant</th><th className="px-3 py-3 font-medium">Amount</th><th className="px-3 py-3 font-medium">Status</th><th className="px-5 py-3 text-right font-medium">Time</th></tr></thead><tbody>{tenantTransactions.slice(0,6).map(tx=><tr className="table-row border-b border-white/[.04] text-[12px]" key={tx.id}><td className="px-5 py-3.5"><span className="mono text-[10px] text-violet-300">{tx.id}</span></td><td className="px-3 py-3.5 text-slate-200">{tx.merchant}</td><td className="mono px-3 py-3.5 text-slate-100">${tx.amount.toLocaleString()}</td><td className="px-3 py-3.5"><Status>{tx.status}</Status></td><td className="px-5 py-3.5 text-right text-slate-500">{tx.time}</td></tr>)}</tbody></table></div></div>

      <div className="panel p-5 md:p-6"><div className="mb-5 flex items-end justify-between"><div><div className="kicker mb-1 text-violet-300">Merchant health</div><div className="text-sm font-semibold text-white">Portfolio pulse</div></div><Link href="/merchants" className="text-[11px] text-violet-300">Details <ChevronRight size={12} className="inline"/></Link></div>
        <div className="flex items-center gap-5"><div className="relative h-28 w-28 shrink-0 rounded-full" style={{background:`conic-gradient(#34d399 0 ${metrics.merchantHealthRate}%, #fbbf24 ${metrics.merchantHealthRate}% ${metrics.merchantHealthRate + (tenantMerchants.length ? metrics.reviewMerchants / tenantMerchants.length * 100 : 0)}%, #fb7185 0 100%)`}}><div className="absolute inset-[9px] grid place-items-center rounded-full bg-[#0d1020]"><div className="text-2xl font-semibold text-white">{metrics.merchantHealthRate.toFixed(0)}%</div></div></div><div className="space-y-2.5 text-[11px] text-slate-400"><div>閳硷拷 Healthy <b className="text-slate-200">{metrics.healthyMerchants}</b></div><div>閳硷拷 Review <b className="text-slate-200">{metrics.reviewMerchants}</b></div><div>閳硷拷 At risk <b className="text-slate-200">{metrics.atRiskMerchants}</b></div></div></div>
        <div className="my-5 h-px bg-white/[.06]"/><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-white/[.025] p-3"><div className="text-lg font-semibold text-white">{tenantCustomers.length}</div><div className="text-[9px] uppercase tracking-wider text-slate-600">Customers</div></div><div className="rounded-lg bg-white/[.025] p-3"><div className="text-lg font-semibold text-white">{metrics.review}</div><div className="text-[9px] uppercase tracking-wider text-slate-600">Review</div></div><div className="rounded-lg bg-white/[.025] p-3"><div className="text-lg font-semibold text-white">{metrics.refunded}</div><div className="text-[9px] uppercase tracking-wider text-slate-600">Refunded</div></div></div>
      </div>
    </div>

    {briefOpen&&<Modal title="Live workspace brief" onClose={()=>setBriefOpen(false)}><div className="space-y-4 text-sm leading-6 text-slate-300"><p><b className="text-white">Current picture:</b> {formatDashboardMoney(metrics.totalVolume)} across {tenantTransactions.length} available payment records, with {metrics.captured} captured and {metrics.review} requiring review.</p><div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-4"><div className="mb-1 flex items-center gap-2 text-violet-300"><Sparkles size={14}/> FinOS AI signal</div><div>This brief is calculated from the current workspace records; no synthetic totals are inserted.</div></div></div></Modal>}
  </div>;
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050611]/75 px-4" onMouseDown={onClose}><div className="w-full max-w-[510px] rounded-2xl border border-[#4a3a78] bg-[#0d1020] p-6 shadow-2xl" onMouseDown={e=>e.stopPropagation()}><div className="mb-5 flex items-center justify-between"><h2 className="display-font text-lg font-semibold text-[#f1f5f9]">{title}</h2><button onClick={onClose} className="rounded-md p-1 text-[#7892a5] hover:bg-[#2a1d4e]" data-testid="button-close-modal"><X size={17}/></button></div>{children}</div></div>; }

function EmployeeForm({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const { employees, addEmployee, updateEmployee } = useEmployees();
  const { tenant, user } = usePlatform();
  const [draft, setDraft] = useState<EmployeeDraft>({
    name: employee?.name || '',
    role: employee?.role || '',
    department: employee?.department || 'Operations',
    description: employee?.description || '',
    skills: employee?.skills || ['Context review', 'Decision support'],
    responsibilities: employee?.responsibilities || [],
    permissions: employee?.permissions || ['read:transactions', 'read:customers'],
    knowledge: employee?.knowledge || ['Workspace operating context'],
    knowledgeSource: employee?.knowledgeSource || 'Workspace context',
    systemPrompt: employee?.systemPrompt || '',
    personality: employee?.personality || 'Thoughtful and clear',
    avatar: employee?.avatar || '',
    color: employee?.color || '#5bd5ee',
    status: employee?.status || 'Ready',
    manager: employee?.manager || 'Workspace admin',
  });
  const [skillText, setSkillText] = useState(employee?.skills.join(', ') || 'Context review, Decision support');
  const [responsibilityText, setResponsibilityText] = useState(employee?.responsibilities?.join(', ') || '');
  const [saving, setSaving] = useState(false);
  const save = () => {
    if (!draft.name.trim() || !draft.role.trim()) {
      toast.error('Add a name and role before saving');
      return;
    }
    setSaving(true);
    const nextDraft = {
      ...draft,
      skills: skillText.split(',').map((skill) => skill.trim()).filter(Boolean),
      responsibilities: responsibilityText.split(',').map((responsibility) => responsibility.trim()).filter(Boolean),
    };
    setTimeout(() => {
      if (employee) updateEmployee(employee.id, nextDraft);
      else {
        addEmployee(nextDraft);
        reportWorkspaceActivity(tenant.id, user.email, {
          event_type: 'employee_created',
          metadata: {
            employeeName: nextDraft.name,
            role: nextDraft.role,
            department: nextDraft.department,
          },
        });
      }
      toast.success(employee ? `${draft.name} updated` : `${draft.name} added to the AI team`);
      setSaving(false);
      onClose();
    }, 450);
  };
  return <Modal title={employee ? `Edit ${employee.name}` : 'Add AI employee'} onClose={onClose}>
    <div className="scrollbar max-h-[78vh] space-y-4 overflow-y-auto pr-1">
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="kicker mb-2 block">Employee name</span><input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" placeholder="e.g. Scout" data-testid="input-employee-name"/></label>
        <label><span className="kicker mb-2 block">Role</span><input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" placeholder="e.g. Revenue Intelligence" data-testid="input-employee-role"/></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="kicker mb-2 block">Department</span><select value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="select-employee-department"><option>Executive</option><option>Finance</option><option>Risk & fraud</option><option>Customer experience</option><option>Sales & marketing</option><option>Merchant operations</option><option>Data & AI</option><option>Security</option><option>Growth</option><option>Operations</option><option>Human resources</option></select></label>
        <label><span className="kicker mb-2 block">Status</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="select-employee-status"><option>Ready</option><option>Growing</option><option>Advancing</option><option>Campaigning</option><option>Publishing</option><option>Optimizing</option><option>Planning</option><option>Supporting</option><option>Improving</option><option>Activating</option><option>Reconciling</option><option>Monitoring</option><option>Resolving</option><option>Analyzing</option><option>Reporting</option><option>Building</option><option>Tuning</option><option>Curating</option><option>Defending</option><option>Auditing</option><option>Advising</option><option>Sourcing</option><option>Matching</option><option>Developing</option><option>Reviewing</option><option>Balancing</option><option>Paused</option></select></label>
      </div>
      <label><span className="kicker mb-2 block">What they do</span><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="input-dark min-h-[84px] w-full resize-none rounded-lg px-3 py-2 text-sm" placeholder="Describe the employee's responsibility..." data-testid="textarea-employee-description"/></label>
      <label><span className="kicker mb-2 block">Skills <span className="normal-case tracking-normal text-[#536f84]">(comma separated)</span></span><input value={skillText} onChange={(e) => setSkillText(e.target.value)} className="input-dark h-10 w-full rounded-lg px-3 text-sm" placeholder="Forecasting, Triage, Reporting" data-testid="input-employee-skills"/></label>
      <label><span className="kicker mb-2 block">Responsibilities <span className="normal-case tracking-normal text-[#536f84]">(comma separated)</span></span><textarea value={responsibilityText} onChange={(e) => setResponsibilityText(e.target.value)} className="input-dark min-h-[70px] w-full resize-none rounded-lg px-3 py-2 text-sm" placeholder="Attendance, Leave requests, Employee analytics" data-testid="textarea-employee-responsibilities"/></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="kicker mb-2 block">Manager</span><select value={draft.manager} onChange={(e) => setDraft({ ...draft, manager: e.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="select-employee-manager"><option>Workspace admin</option>{employees.filter((item) => item.id !== employee?.id).map((item) => <option key={item.id}>{item.name}</option>)}</select></label>
        <label><span className="kicker mb-2 block">Knowledge source</span><select value={draft.knowledgeSource} onChange={(e) => setDraft({ ...draft, knowledgeSource: e.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="select-employee-knowledge-source">{builderKnowledgeSources.map((source) => <option key={source}>{source}</option>)}</select></label>
      </div>
      <label><span className="kicker mb-2 block">Knowledge & instructions <span className="normal-case tracking-normal text-[#536f84]">(comma separated)</span></span><textarea value={draft.knowledge.join(', ')} onChange={(e) => setDraft({ ...draft, knowledge: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} className="input-dark min-h-[70px] w-full resize-none rounded-lg px-3 py-2 text-sm" placeholder="Refund policy, onboarding playbook, escalation rules" data-testid="textarea-employee-knowledge"/></label>
      <label><span className="kicker mb-2 block">System prompt</span><textarea value={draft.systemPrompt} onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })} className="input-dark min-h-[90px] w-full resize-none rounded-lg px-3 py-2 text-sm" placeholder="Define how this employee should reason and respond..." data-testid="textarea-employee-system-prompt"/></label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label><span className="kicker mb-2 block">AI personality</span><input value={draft.personality} onChange={(e) => setDraft({ ...draft, personality: e.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" placeholder="Precise and warm" data-testid="input-employee-personality"/></label>
        <label><span className="kicker mb-2 block">Avatar</span><input value={draft.avatar} onChange={(e) => setDraft({ ...draft, avatar: e.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" placeholder="閴侊拷 or emoji" data-testid="input-employee-avatar"/></label>
        <label><span className="kicker mb-2 block">Color</span><input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="input-dark h-10 w-full cursor-pointer rounded-lg px-2" data-testid="input-employee-color"/></label>
      </div>
      <div><span className="kicker mb-2 block">Permissions</span><div className="grid gap-2 sm:grid-cols-2">{builderPermissions.map((permission) => <label key={permission} className="flex items-center gap-2 rounded-lg border border-[#2b1d52] bg-[#0b0e1b] px-3 py-2 text-[11px] text-[#a9bfcc]"><input type="checkbox" checked={draft.permissions.includes(permission)} onChange={(e) => setDraft({ ...draft, permissions: e.target.checked ? [...draft.permissions, permission] : draft.permissions.filter((item) => item !== permission) })} className="accent-[#8b5cf6]" data-testid={`checkbox-permission-${permission.replace(':', '-')}`}/><span>{permission}</span></label>)}</div></div>
      <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="btn-quiet rounded-lg px-4 py-2.5 text-xs" data-testid="button-cancel-employee">Cancel</button><button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs" data-testid="button-save-employee">{saving && <RefreshCw size={13} className="animate-spin"/>}{saving ? 'Saving...' : employee ? 'Save changes' : 'Add employee'}</button></div>
    </div>
  </Modal>;
}

function AIDirectory() {
  const { employees: roster, deleteEmployee, toggleEmployee } = useEmployees();
  const [filter, setFilter] = useState('All');
  const [department, setDepartment] = useState('All departments');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const departments = ['All departments', ...Array.from(new Set(roster.map((employee) => employee.department)))];
  const shown = useMemo(() => roster.filter((employee) => {
    const matchesSearch = `${employee.name} ${employee.role} ${employee.department} ${employee.skills.join(' ')}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filter === 'All' || (filter === 'Active' ? employee.active : filter === 'Paused' ? !employee.active : employee.status === filter);
    const matchesDepartment = department === 'All departments' || employee.department === department;
    return matchesSearch && matchesStatus && matchesDepartment;
  }).sort((a, b) => sort === 'performance' ? b.performance - a.performance : sort === 'lastActive' ? a.lastActive.localeCompare(b.lastActive) : a.name.localeCompare(b.name)), [roster, search, filter, department, sort]);
  const activeCount = roster.filter((employee) => employee.active).length;
  const confirmDelete = (employee: Employee) => {
    if (window.confirm(`Remove ${employee.name} from the AI team?`)) {
      deleteEmployee(employee.id);
      toast.success(`${employee.name} removed`);
    }
  };
  return <div className="mx-auto max-w-[1320px]">
    <SectionHeader eyebrow={`AI workforce / ${activeCount} active of ${roster.length}`} title="Your AI employees." description="Manage the digital team behind every signal. Give each employee a clear lane, measurable outcomes, and the right context to act." action={<div className="flex flex-wrap gap-2"><button onClick={() => toast.success('AI team activity is up to date')} className="btn-quiet flex items-center gap-2 rounded-lg px-3 py-2 text-xs" data-testid="button-sync-ai"><RefreshCw size={14}/> Sync activity</button><Link href="/ai-employees/builder" className="btn-quiet flex items-center gap-2 rounded-lg px-3 py-2 text-xs" data-testid="link-employee-builder"><SlidersHorizontal size={14}/> Builder</Link><button onClick={() => setAdding(true)} className="btn-primary flex items-center gap-2 rounded-lg px-3 py-2 text-xs" data-testid="button-add-employee"><UserPlus size={14}/> Add employee</button></div>}/>
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="panel flex items-center gap-3 p-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#2a1d4e] text-[#8b5cf6]"><Activity size={18}/></div><div><div className="text-lg font-semibold text-[#f1f5f9]">{activeCount} / {roster.length}</div><div className="text-[11px] text-[#64748b]">employees active</div></div></div>
      <div className="panel flex items-center gap-3 p-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#143b2e] text-[#34d399]"><ClipboardList size={18}/></div><div><div className="text-lg font-semibold text-[#f1f5f9]">{roster.length * 21 + 1}</div><div className="text-[11px] text-[#64748b]">tasks completed today</div></div></div>
      <div className="panel flex items-center gap-3 p-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#332741] text-[#ce9eff]"><Gauge size={18}/></div><div><div className="text-lg font-semibold text-[#f1f5f9]">{roster.length ? Math.round(roster.filter((employee) => employee.performance).reduce((sum, employee) => sum + employee.performance, 0) / roster.filter((employee) => employee.performance).length) : 0}%</div><div className="text-[11px] text-[#64748b]">performance average</div></div></div>
      <div className="panel flex items-center gap-3 p-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#2e253e] text-[#f6c76d]"><CalendarDays size={18}/></div><div><div className="text-lg font-semibold text-[#f1f5f9]">18</div><div className="text-[11px] text-[#64748b]">reviews this week</div></div></div>
    </div>
    <div className="mb-5 panel p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 text-[#658197]" size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} className="input-dark h-10 w-full rounded-lg pl-9 pr-3 text-sm" placeholder="Search by name, role, department or skill" data-testid="input-ai-search"/></div>
        <div className="flex flex-wrap gap-2">
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className="input-dark h-10 rounded-lg px-3 text-[11px]" data-testid="select-employee-department-filter">{departments.map((item) => <option key={item}>{item}</option>)}</select>
           <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input-dark h-10 rounded-lg px-3 text-[11px]" data-testid="select-employee-status-filter"><option>All</option><option>Active</option><option>Paused</option><option>On watch</option><option>Protecting</option><option>Balancing</option><option>Responding</option><option>Monitoring</option><option>Optimizing</option><option>Supporting</option><option>Growing</option><option>Advancing</option><option>Campaigning</option><option>Publishing</option><option>Planning</option><option>Improving</option><option>Activating</option><option>Reconciling</option><option>Resolving</option><option>Analyzing</option><option>Reporting</option><option>Building</option><option>Tuning</option><option>Curating</option><option>Defending</option><option>Auditing</option><option>Advising</option><option>Sourcing</option><option>Matching</option><option>Developing</option><option>Reviewing</option></select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="input-dark h-10 rounded-lg px-3 text-[11px]" data-testid="select-employee-sort"><option value="name">Sort: Name</option><option value="performance">Sort: Performance</option><option value="lastActive">Sort: Last active</option></select>
          <div className="flex rounded-lg border border-[#30235d] p-1"><button onClick={() => setView('cards')} className={`rounded-md p-1.5 ${view === 'cards' ? 'bg-[#173743] text-[#a78bfa]' : 'text-[#6f879d]'}`} aria-label="Card view" data-testid="button-view-cards"><Grid2X2 size={15}/></button><button onClick={() => setView('table')} className={`rounded-md p-1.5 ${view === 'table' ? 'bg-[#173743] text-[#a78bfa]' : 'text-[#6f879d]'}`} aria-label="Table view" data-testid="button-view-table"><List size={15}/></button></div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-[#698398]"><ListFilter size={13}/><span>Showing {shown.length} of {roster.length} employees</span>{(search || department !== 'All departments' || filter !== 'All') && <button onClick={() => { setSearch(''); setDepartment('All departments'); setFilter('All'); }} className="text-[#8b5cf6]" data-testid="button-clear-employee-filters">Clear filters</button>}</div>
    </div>
      {view === 'cards' ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map((employee, index) => <div key={employee.id} className={`panel fade-up delay-${(index % 4) + 1} group p-5`} data-testid={`card-ai-${employee.id}`}><div className="mb-4 flex items-start justify-between"><Link href={`/ai-employees/${employee.id}/details`} className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[12px] font-bold" style={{ background: `${employee.accent}25`, color: employee.color, border: `1px solid ${employee.accent}55` }}>{employee.initials}</div><div className="min-w-0"><div className="truncate font-semibold text-[#f1f5f9]">{employee.name}</div><div className="mt-0.5 truncate text-[11px] text-[#7892a5]">{employee.role}</div></div></Link><div className="relative"><button onClick={() => setMenu(menu === employee.id ? null : employee.id)} className="rounded-md p-1.5 text-[#678399] hover:bg-[#26194d]" aria-label={`Actions for ${employee.name}`} data-testid={`button-employee-menu-${employee.id}`}><MoreHorizontal size={16}/></button>{menu === employee.id && <div className="absolute right-0 top-8 z-10 w-40 rounded-lg border border-[#2a4b61] bg-[#0d2031] p-1 shadow-xl"><Link href={`/ai-employees/${employee.id}/details`} className="flex items-center gap-2 rounded-md px-3 py-2 text-[11px] text-[#b8ccd7] hover:bg-[#26194d]"><UserRound size={13}/> View profile</Link><button onClick={() => { setEditing(employee); setMenu(null); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[11px] text-[#b8ccd7] hover:bg-[#26194d]"><Pencil size={13}/> Edit employee</button><button onClick={() => { toggleEmployee(employee.id); setMenu(null); toast.success(`${employee.name} ${employee.active ? 'deactivated' : 'activated'}`); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[11px] text-[#b8ccd7] hover:bg-[#26194d]"><Power size={13}/> {employee.active ? 'Deactivate' : 'Activate'}</button><button onClick={() => { confirmDelete(employee); setMenu(null); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[11px] text-[#ff9b90] hover:bg-[#3a202a]"><Trash2 size={13}/> Delete</button></div>}</div></div><Link href={`/ai-employees/${employee.id}/details`} className="block"><div className="mb-4 flex items-center gap-2 text-[10px]"><span className={`status-pill ${employee.active ? 'border-[#167d5a] bg-[#0d3b2c] text-[#6fe0bd]' : 'border-[#52627b] bg-[#1b293b] text-[#9db2ca]'}`}>{employee.active ? employee.status : 'Paused'}</span><span className="text-[#657f93]">{employee.department}</span></div><p className="mb-5 min-h-[40px] text-[12px] leading-5 text-[#8ba1b2]">{employee.description}</p><div className="mb-4 flex flex-wrap gap-1.5">{employee.skills.slice(0, 3).map((skill) => <span key={skill} className="rounded-md bg-[#122a3a] px-2 py-1 text-[10px] text-[#85a5b5]">{skill}</span>)}</div><div className="signal-line mb-4"/><div className="flex items-end justify-between"><div><div className="display-font text-xl font-semibold" style={{ color: employee.color }}>{employee.metric}</div><div className="mt-1 text-[10px] text-[#71899d]">{employee.metricLabel}</div></div><div className="flex items-center gap-1 text-[11px] text-[#7290a3] group-hover:text-[#8b5cf6]">Profile <ChevronRight size={13}/></div></div></Link></div>)}</div> : <div className="panel overflow-hidden"><div className="scrollbar overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="border-b border-[#1b3448] text-[10px] uppercase tracking-[.12em] text-[#668096]"><th className="px-5 py-3 font-medium">Employee</th><th className="px-3 py-3 font-medium">Department</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Performance</th><th className="px-3 py-3 font-medium">Last active</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead><tbody>{shown.map((employee) => <tr key={employee.id} className="table-row border-b border-[#142b3e] text-[12px]" data-testid={`row-employee-${employee.id}`}><td className="px-5 py-3.5"><Link href={`/ai-employees/${employee.id}/details`} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg text-[10px] font-bold" style={{ background: `${employee.accent}25`, color: employee.color }}>{employee.initials}</span><span><span className="block font-medium text-[#e2e8f0]">{employee.name}</span><span className="block text-[10px] text-[#71899d]">{employee.role}</span></span></Link></td><td className="px-3 py-3.5 text-[#91a9b7]">{employee.department}</td><td className="px-3 py-3.5"><span className={`status-pill ${employee.active ? 'border-[#167d5a] bg-[#0d3b2c] text-[#6fe0bd]' : 'border-[#52627b] bg-[#1b293b] text-[#9db2ca]'}`}>{employee.active ? employee.status : 'Paused'}</span></td><td className="px-3 py-3.5"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#173044]"><div className="h-full rounded-full bg-[#8b5cf6]" style={{ width: `${employee.performance}%` }}/></div><span className="mono text-[10px] text-[#bad2dc]">{employee.performance}%</span></div></td><td className="px-3 py-3.5 text-[#7891a3]">{employee.lastActive}</td><td className="px-5 py-3.5 text-right"><button onClick={() => setEditing(employee)} className="rounded-md p-2 text-[#71899e] hover:bg-[#26194d] hover:text-[#a78bfa]" aria-label={`Edit ${employee.name}`} data-testid={`button-edit-employee-${employee.id}`}><Pencil size={14}/></button><button onClick={() => { toggleEmployee(employee.id); toast.success(`${employee.name} ${employee.active ? 'deactivated' : 'activated'}`); }} className="rounded-md p-2 text-[#71899e] hover:bg-[#26194d] hover:text-[#a78bfa]" aria-label={`Toggle ${employee.name}`} data-testid={`button-toggle-employee-${employee.id}`}><Power size={14}/></button></td></tr>)}</tbody></table></div>{!shown.length && <EmptyState title="No AI employees found" description="Try a different search, status or department." compact/>}</div>}
    {!shown.length && view === 'cards' && <EmptyState title="No AI employees found" description="Try a different search, status or department."/>}
    {(adding || editing) && <EmployeeForm employee={editing || undefined} onClose={() => { setAdding(false); setEditing(null); }}/>}
  </div>;
}

function EmployeeBuilderPage() {
  const [, setLocation] = useLocation();
  return <div className="mx-auto max-w-[900px]">
    <SectionHeader eyebrow="AI workforce / builder" title="Build an AI employee." description="Create a tenant-scoped digital teammate with a clear role, operating skills, permissions, and the knowledge it can use." action={<Link href="/ai-employees" className="btn-quiet rounded-lg px-3 py-2 text-xs" data-testid="link-back-ai-directory">Back to directory</Link>}/>
    <div className="panel p-5 md:p-6">
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#3a2a6a] bg-[#0c2130] p-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#173b48] text-[#8b5cf6]"><Bot size={18}/></div><div><div className="text-sm font-semibold text-[#e2e8f0]">Employee configuration</div><p className="mt-1 text-[11px] leading-5 text-[#7892a5]">This employee will be visible only inside the active company workspace and will persist there for future sessions.</p></div></div>
      <EmployeeForm onClose={() => setLocation('/ai-employees')} />
    </div>
  </div>;
}

function EmployeeDetailsPage({ employee }: { employee: Employee }) {
  const { employees: roster } = useEmployees();
  const liveEmployee = roster.find((item) => item.id === employee.id) || employee;
  const status = liveEmployee.active ? liveEmployee.status || 'Active' : 'Paused';
  const placeholderSections = [
    {
      title: 'AI Prompt',
      detail: liveEmployee.systemPrompt || 'Prompt configuration will appear here when this employee is connected to an AI runtime.',
    },
    {
      title: 'Memory',
      detail: liveEmployee.memoryEnabled === false ? 'Memory is disabled for this employee.' : 'Memory configuration will appear here when persistence is connected.',
    },
    {
      title: 'Knowledge',
      detail: liveEmployee.knowledge.length ? liveEmployee.knowledge.join(' 璺� ') : 'Knowledge sources will appear here when connected.',
    },
    {
      title: 'Tools',
      detail: liveEmployee.tools?.length ? liveEmployee.tools.join(' 璺� ') : 'Tool access will appear here when configured.',
    },
  ];
  return <div className="mx-auto max-w-[1200px]">
    <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
      <div className="flex min-w-0 items-start gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-base font-bold" style={{ background: `${liveEmployee.accent}25`, color: liveEmployee.color, border: `1px solid ${liveEmployee.accent}66` }}>{liveEmployee.avatar || liveEmployee.initials}</div>
        <div className="min-w-0">
          <div className="kicker mb-2">AI workforce / employee details</div>
          <h1 className="display-font truncate text-[30px] font-semibold tracking-[-.04em] text-[#f8fafc]">{liveEmployee.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[#8299ab]">
            <span>{liveEmployee.role}</span><span className="text-[#3c566d]">閳ワ拷</span><span>{liveEmployee.department}</span>
            <span className="text-[#3c566d]">閳ワ拷</span><span className="flex items-center gap-1.5" style={{ color: liveEmployee.color }}><span className={`live-dot h-1.5 w-1.5 rounded-full ${liveEmployee.active ? '' : 'opacity-30'}`} style={{ background: liveEmployee.color }}/>{status}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/ai-employees" className="btn-quiet rounded-lg px-3 py-2.5 text-xs" data-testid="link-back-ai-directory">Back to directory</Link>
        <Link href={`/ai-employees/${liveEmployee.id}`} className="btn-primary rounded-lg px-3 py-2.5 text-xs" data-testid="link-open-ai-workspace">Open workspace</Link>
      </div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]">
      <div className="space-y-5">
        <div className="panel p-5">
          <div className="kicker mb-1">Organization</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div><div className="text-[10px] uppercase tracking-[.12em] text-[#668096]">Job title</div><div className="mt-1 text-sm text-[#e2e8f0]">{liveEmployee.role}</div></div>
            <div><div className="text-[10px] uppercase tracking-[.12em] text-[#668096]">Department</div><div className="mt-1 text-sm text-[#e2e8f0]">{liveEmployee.department}</div></div>
            <div><div className="text-[10px] uppercase tracking-[.12em] text-[#668096]">Manager</div><div className="mt-1 text-sm text-[#e2e8f0]">{liveEmployee.manager}</div></div>
            <div><div className="text-[10px] uppercase tracking-[.12em] text-[#668096]">Status</div><div className="mt-2"><span className={`status-pill ${liveEmployee.active ? 'border-[#167d5a] bg-[#0d3b2c] text-[#6fe0bd]' : 'border-[#52627b] bg-[#1b293b] text-[#9db2ca]'}`}>{status}</span></div></div>
          </div>
        </div>
        <div className="panel p-5">
          <div className="kicker mb-1">Skills</div>
          <div className="mt-4 flex flex-wrap gap-2">{liveEmployee.skills.map((skill) => <span key={skill} className="rounded-md bg-[#122a3a] px-2.5 py-1.5 text-[10px] text-[#85a5b5]">{skill}</span>)}</div>
        </div>
        <div className="panel p-5">
          <div className="kicker mb-1">Permissions</div>
          <div className="mt-4 grid gap-2">{liveEmployee.permissions.map((permission) => <div key={permission} className="flex items-center gap-2 rounded-lg border border-[#2b1d52] bg-[#0b0e1b] px-3 py-2.5 text-[11px] text-[#a9bfcc]"><CheckCircle2 size={14} className="text-[#34d399]"/>{permission}</div>)}</div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {placeholderSections.map((section) => <div key={section.title} className="panel min-h-[145px] p-5">
            <div className="kicker mb-2">{section.title}</div>
            <p className="text-[12px] leading-5 text-[#8da5b4]">{section.detail}</p>
          </div>)}
        </div>
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><div className="kicker mb-1">Tasks</div><div className="text-sm font-semibold text-[#deedf1]">Current task queue</div></div><span className="text-[10px] text-[#718b9f]">{liveEmployee.tasks.length} assigned</span></div>
          <div className="space-y-2">{liveEmployee.tasks.map((task) => <div key={task} className="flex items-start gap-3 rounded-lg bg-[#0c1020] px-3 py-3 text-[12px] text-[#afc2ce]"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[#2b5268] text-[#6f9caf]"><ClipboardList size={12}/></span><span>{task}</span></div>)}</div>
        </div>
      </div>
    </div>
  </div>;
}

function AIWorkspace({ employee }: { employee:Employee }) {
  const { employees: roster, toggleEmployee } = useEmployees();
  const liveEmployee = roster.find((item) => item.id === employee.id) || employee;
  const [message,setMessage]=useState(''); const [sent,setSent]=useState<string[]>([]); const [activeTab,setActiveTab]=useState('Overview'); const [running,setRunning]=useState(false); const [editing,setEditing]=useState(false); const [taskFilter,setTaskFilter]=useState('Open'); const [completed,setCompleted]=useState<string[]>([]);
  const [notifications,setNotifications]=useState(true);
  const [calendarDay,setCalendarDay]=useState('Today');
  const [reportCount,setReportCount]=useState(3);
  const [taskHistory,setTaskHistory]=useState([{task:employee.tasks[0],status:'Completed',time:'Today, 09:14'},{task:employee.tasks[1],status:'Completed',time:'Today, 08:42'},{task:employee.tasks[2],status:'In progress',time:'Today, 07:58'}]);
  const { name, role, department, initials, color, accent, status, active, metric, metricLabel, description, tasks, skills, performance, lastActive } = liveEmployee;
  const send=()=>{if(!message.trim())return;setSent([...sent,message]);setMessage('');toast.success(`${employee.name} received your instruction`);};
  return <div className="mx-auto max-w-[1320px]">
      <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div className="flex items-start gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[14px] font-bold" style={{background:`${accent}25`,color,border:`1px solid ${accent}66`}}>{liveEmployee.avatar || initials}</div><div><div className="kicker mb-2">AI employee / profile</div><h1 className="display-font text-[30px] font-semibold tracking-[-.04em] text-[#f8fafc]">{name}</h1><div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[#8299ab]"><span className={`live-dot h-1.5 w-1.5 rounded-full ${active?'':'opacity-30'}`} style={{background:color}}/>{role} <span className="text-[#3c566d]">閳ワ拷</span><span style={{color}}>{active ? status : 'Paused'}</span><span className="text-[#3c566d]">閳ワ拷</span><span>{department}</span></div></div></div><div className="flex flex-wrap gap-2"><button onClick={() => setEditing(true)} className="btn-quiet flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs" data-testid="button-edit-profile"><Pencil size={14}/> Edit profile</button><button onClick={() => { toggleEmployee(employee.id); toast.success(`${name} ${active ? 'deactivated' : 'activated'}`); }} className="btn-primary flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs" data-testid="button-toggle-profile"><Power size={14}/>{active ? 'Deactivate' : 'Activate'}</button><button onClick={()=>{setRunning(true);setTimeout(()=>setRunning(false),900);toast.success(`${name} is reviewing the latest context`)}} className="btn-primary flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs" data-testid="button-run-ai"><Sparkles size={14}/>{running?'Working...':'Ask for an update'}</button></div></div>
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[#1a3246]"><button onClick={()=>setActiveTab('Overview')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Overview'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`}>Overview</button><button onClick={()=>setActiveTab('Tasks')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Tasks'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`} data-testid="button-profile-tasks-tab">Tasks</button><button onClick={()=>setActiveTab('Calendar')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Calendar'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`} data-testid="button-ai-calendar-tab">Calendar</button><button onClick={()=>setActiveTab('Chat')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Chat'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`} data-testid="button-ai-chat-tab">AI chat</button><button onClick={()=>setActiveTab('Analytics')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Analytics'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`} data-testid="button-ai-analytics-tab">Analytics</button><button onClick={()=>setActiveTab('Activity')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Activity'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`} data-testid="button-ai-activity-tab">Activity</button><button onClick={()=>setActiveTab('Playbooks')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Playbooks'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`} data-testid="button-ai-playbooks-tab">Playbooks</button><button onClick={()=>setActiveTab('Reports')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Reports'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`} data-testid="button-ai-reports-tab">Reports</button><button onClick={()=>setActiveTab('Notifications')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Notifications'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`} data-testid="button-ai-notifications-tab">Notifications</button><button onClick={()=>setActiveTab('Permissions')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Permissions'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`} data-testid="button-ai-permissions-tab">Permissions</button><button onClick={()=>setActiveTab('Settings')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='Settings'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`} data-testid="button-ai-settings-tab">Settings</button>{liveEmployee.department === 'Human resources' && <button onClick={()=>setActiveTab('HR')} className={`border-b-2 px-4 py-3 text-[12px] ${activeTab==='HR'?'border-[#8b5cf6] font-semibold text-[#a78bfa]':'border-transparent text-[#7892a5]'}`}>HR memory & communication</button>}</div>
    {activeTab==='Calendar' ? <EmployeeCalendarPanel employee={liveEmployee} day={calendarDay} setDay={setCalendarDay}/> :
      activeTab==='Chat' ? <EmployeeChatPanel employee={liveEmployee} message={message} setMessage={setMessage} sent={sent} send={send} notifications={notifications} setNotifications={setNotifications}/> :
      activeTab==='Analytics' ? <EmployeeAnalyticsPanel employee={liveEmployee}/> :
      activeTab==='Reports' ? <EmployeeReportsPanel employee={liveEmployee} reportCount={reportCount} setReportCount={setReportCount}/> :
      activeTab==='Notifications' ? <EmployeeNotificationsPanel employee={liveEmployee} notifications={notifications} setNotifications={setNotifications}/> :
      activeTab==='Permissions' ? <EmployeePermissionsPanel employee={liveEmployee}/> :
      activeTab==='Settings' ? <EmployeeSettingsPanel employee={liveEmployee} notifications={notifications} setNotifications={setNotifications}/> :
      activeTab==='HR' ? <HRMemoryPanel employee={liveEmployee}/> :
      activeTab==='Playbooks' ? <div className="panel p-6"><div className="kicker mb-2">Playbooks</div><h2 className="display-font text-xl font-semibold text-[#f1f5f9]">Reusable operating patterns.</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#8198aa]">Build and save playbooks for repeatable work. Every run remains visible in the activity timeline.</p><div className="mt-6 grid gap-3 md:grid-cols-2">{['Morning context scan','Exception triage','Weekly operating summary','Escalation review'].map((item,i)=><button key={item} onClick={()=>toast.success(`${item} queued for ${name}`)} className="rounded-lg border border-[#203c50] bg-[#0c1020] p-4 text-left text-sm text-[#b8cad5] hover:border-[#35667b]" data-testid={`button-playbook-${i}`}><div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-md bg-[#173746] text-[10px] text-[#64d8e5]">{i+1}</span>{item}</div><div className="mt-2 text-[11px] text-[#718b9f]">Last run {i+2}h ago <span className="float-right text-[#34d399]">Healthy</span></div></button>)}</div></div> :
      activeTab==='Activity' ? <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><ActivityTimeline employee={liveEmployee}/><PerformancePanel employee={liveEmployee}/></div> :
      activeTab==='Tasks' ? <TaskManager employee={liveEmployee} tasks={tasks} taskFilter={taskFilter} setTaskFilter={setTaskFilter} completed={completed} setCompleted={setCompleted} history={taskHistory} setHistory={setTaskHistory}/> :
      <><div className="grid gap-4 md:grid-cols-3"><div className="panel p-5 md:col-span-2"><div className="mb-5 flex items-center justify-between"><div><div className="kicker mb-1">Current focus</div><div className="text-sm font-semibold text-[#dfedf1]">{tasks[0]}</div></div><span className="status-pill border-[#167d5a] bg-[#0d3b2c] text-[#6fe0bd]">In progress</span></div><div className="mb-5 h-2 overflow-hidden rounded-full bg-[#142c3e]"><div className="h-full rounded-full" style={{width:'72%',background:color}}/></div><div className="flex justify-between text-[10px] text-[#718b9f]"><span>Context gathered</span><span style={{color}}>72% confidence</span></div><div className="mt-6 rounded-lg border border-[#213c4e] bg-[#0a1827] p-4 text-[12px] leading-5 text-[#95aebe]"><span className="font-semibold" style={{color}}>Observation:</span> {name} sees a stable operating picture with one exception that may benefit from a human decision.</div></div><div className="panel p-5"><div className="kicker mb-1">Primary metric</div><div className="display-font mt-2 text-[30px] font-semibold" style={{color}}>{metric}</div><div className="mt-1 text-[11px] text-[#7891a4]">{metricLabel}</div><div className="mt-6 h-16"><Sparkline values={[35,42,38,54,48,66,60,72,68,85,78,91]} color={color} fill/></div><div className="mt-3 flex justify-between text-[10px] text-[#718b9f]"><span>7 days ago</span><span>Today</span></div></div></div><div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><TaskManager employee={liveEmployee} tasks={tasks} taskFilter="Open" setTaskFilter={setTaskFilter} completed={completed} setCompleted={setCompleted} history={taskHistory} setHistory={setTaskHistory}/><div className="panel flex min-h-[260px] flex-col p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><MessageSquare size={15} style={{color}}/><div className="kicker">Talk to {name}</div></div><button onClick={()=>{setNotifications(!notifications);toast.info(`Notifications ${notifications?'muted':'enabled'}`)}} className={`rounded-md p-1.5 ${notifications?'text-[#8b5cf6]':'text-[#657e93]'}`} aria-label="Toggle notifications" data-testid="button-toggle-employee-notifications"><Bell size={14}/></button></div><div className="flex-1 space-y-3 text-[12px] leading-5 text-[#8da5b4]"><p className="rounded-lg rounded-tl-none bg-[#122738] p-3">I閳ユ獡 tracking the operation. What would you like me to look into?</p>{sent.slice(-2).map((m,i)=><p key={i} className="ml-5 rounded-lg rounded-tr-none bg-[#183947] p-3 text-[#c3dce2]">{m}</p>)}{sent.length>0&&<p className="rounded-lg rounded-tl-none bg-[#122738] p-3">I閳ユ獟l add that to my current review and report back with evidence.</p>}</div><div className="mt-4 flex gap-2"><input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} className="input-dark h-9 min-w-0 flex-1 rounded-lg px-3 text-[11px]" placeholder="Give an instruction..." data-testid={`input-message-${employee.id}`}/><button onClick={send} className="btn-primary grid h-9 w-9 place-items-center rounded-lg" data-testid={`button-send-${employee.id}`}><Send size={14}/></button></div></div></div><div className="mt-4 grid gap-4 lg:grid-cols-[.9fr_1.1fr]"><PerformancePanel employee={liveEmployee}/><ActivityTimeline employee={liveEmployee}/></div></>}
    {editing && <EmployeeForm employee={liveEmployee} onClose={() => setEditing(false)}/>}</div>;
}

function HRMemoryPanel({ employee }: { employee: Employee }) {
  const key = `finos:hr-memory:${employee.id}`;
  const [memory, setMemory] = useState(() => {
    try { return localStorage.getItem(key) || `Role: ${employee.role}\nDepartment: ${employee.department}\nInterview framework: define role competencies, behavioral evidence, technical evidence, scorecard, and escalation criteria.\nEvaluation style: evidence-based, consistent, human-review required.`; } catch { return ''; }
  });
  const [saved, setSaved] = useState(false);
  const save = () => { localStorage.setItem(key, memory); setSaved(true); toast.success('HR employee memory saved'); setTimeout(() => setSaved(false), 1200); };
  if (employee.department !== 'Human resources' && employee.role.toLowerCase() !== 'hr') return <div className="panel p-6"><div className="kicker mb-2">HR only</div><div className="text-sm text-[#9ab0bd]">This memory and interview communication area is available only to the HR employee.</div></div>;
  return <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
    <div className="panel p-5 md:p-6"><div className="kicker mb-1">HR employee memory</div><div className="text-sm font-semibold text-[#deedf1]">Persistent job knowledge & interview rubric</div><p className="mt-2 text-[11px] leading-5 text-[#7892a5]">Store role-specific operating context so HR can evaluate interviews consistently. This is local workspace memory until a server memory service is connected.</p><textarea value={memory} onChange={(event) => setMemory(event.target.value)} className="input-dark mt-4 min-h-[240px] w-full resize-y rounded-lg px-3 py-3 text-xs leading-5" data-testid="textarea-hr-memory"/><button onClick={save} className="btn-primary mt-3 rounded-lg px-4 py-2.5 text-xs" data-testid="button-save-hr-memory">{saved ? 'Saved' : 'Save HR memory'}</button></div>
    <div className="panel p-5 md:p-6"><div className="kicker mb-1">Human communication</div><div className="text-sm font-semibold text-[#deedf1]">Visual + audio readiness</div><div className="mt-4 space-y-3"><div className="rounded-lg bg-[#0c1020] p-4"><div className="text-[12px] text-[#dbe8ed]">Camera</div><div className="mt-1 text-[10px] text-[#718b9f]">UI permission hook ready; production video requires WebRTC/provider wiring.</div><button onClick={() => toast.info('Camera permission flow can be connected to the HR video provider')} className="btn-quiet mt-3 rounded-lg px-3 py-2 text-[10px]">Test camera</button></div><div className="rounded-lg bg-[#0c1020] p-4"><div className="text-[12px] text-[#dbe8ed]">Microphone</div><div className="mt-1 text-[10px] text-[#718b9f]">UI permission hook ready; production audio requires browser permission and provider wiring.</div><button onClick={() => toast.info('Microphone permission flow can be connected to the HR voice provider')} className="btn-quiet mt-3 rounded-lg px-3 py-2 text-[10px]">Test microphone</button></div></div></div>
  </div>;
}

function EmployeeCalendarPanel({ employee, day, setDay }: { employee: Employee; day: string; setDay: (value: string) => void }) {
  const events = [
    ['Today', employee.tasks[0], '09:30', employee.color],
    ['Tomorrow', employee.tasks[1], '11:00', '#34d399'],
    ['Friday', employee.tasks[2], '14:00', '#f6c76d'],
  ];
  return <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
    <div className="panel p-5"><div className="kicker mb-1">Calendar</div><div className="text-sm font-semibold text-[#deedf1]">Upcoming schedule</div><div className="mt-5 grid grid-cols-3 gap-2">{['Today', 'Tomorrow', 'Friday'].map((item) => <button key={item} onClick={() => setDay(item)} className={`rounded-lg border px-2 py-3 text-[11px] ${day === item ? 'border-[#438fa1] bg-[#153743] text-[#a78bfa]' : 'border-[#30235d] text-[#7892a5]'}`}>{item}</button>)}</div><div className="mt-5 rounded-lg border border-[#203c50] bg-[#0c1020] p-4"><div className="text-[11px] text-[#7892a5]">Next focus</div><div className="mt-2 text-sm font-medium text-[#e2e8f0]">{events.find((event) => event[0] === day)?.[1]}</div><div className="mt-2 text-[11px] text-[#8b5cf6]">{events.find((event) => event[0] === day)?.[2]} 璺� {day}</div></div></div>
    <div className="panel p-5"><div className="mb-4 flex items-center justify-between"><div><div className="kicker mb-1">Scheduled work</div><div className="text-sm font-semibold text-[#deedf1]">{employee.role} calendar</div></div><CalendarDays size={16} className="text-[#668ba0]"/></div><div className="space-y-3">{events.map(([eventDay, label, time, eventColor]) => <button key={eventDay} onClick={() => { setDay(eventDay); toast.info(`${label} opened for review`); }} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${day === eventDay ? 'border-[#315b6c] bg-[#102b38]' : 'border-transparent bg-[#0c1020]'}`}><span className="h-8 w-1 rounded-full" style={{ background: eventColor }} /><span className="flex-1"><span className="block text-[12px] text-[#d5e5eb]">{label}</span><span className="mt-1 block text-[10px] text-[#718b9f]">{eventDay} 璺� {time}</span></span><ChevronRight size={14} className="text-[#55748b]"/></button>)}</div></div>
  </div>;
}

function EmployeeChatPanel({ employee, message, setMessage, sent, send, notifications, setNotifications }: { employee: Employee; message: string; setMessage: (value: string) => void; sent: string[]; send: () => void; notifications: boolean; setNotifications: (value: boolean) => void }) {
  return <div className="panel mx-auto flex min-h-[420px] max-w-[900px] flex-col p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="kicker mb-1">AI chat</div><div className="flex items-center gap-2 text-sm font-semibold text-[#deedf1]"><span className="grid h-7 w-7 place-items-center rounded-md text-[10px] font-bold" style={{ background: `${employee.accent}25`, color: employee.color }}>{employee.avatar || employee.initials}</span> Talk to {employee.name}</div></div><button onClick={() => { setNotifications(!notifications); toast.info(`Notifications ${notifications ? 'muted' : 'enabled'}`); }} className={`rounded-md p-2 ${notifications ? 'text-[#8b5cf6]' : 'text-[#657e93]'}`} aria-label="Toggle notifications" data-testid="button-toggle-chat-notifications"><Bell size={15}/></button></div><div className="flex-1 space-y-3 text-[12px] leading-5 text-[#8da5b4]"><p className="max-w-[80%] rounded-lg rounded-tl-none bg-[#122738] p-3">I閳ユ獡 ready to help with {employee.role.toLowerCase()} work. What should I review?</p>{sent.map((item, index) => <div key={`${item}-${index}`}><p className="ml-auto max-w-[80%] rounded-lg rounded-tr-none bg-[#183947] p-3 text-[#c3dce2]">{item}</p><p className="mt-2 max-w-[80%] rounded-lg rounded-tl-none bg-[#122738] p-3">I閳ユ獟l review that using my assigned context and report back with evidence.</p></div>)}</div><div className="mt-5 flex gap-2"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} className="input-dark h-10 min-w-0 flex-1 rounded-lg px-3 text-xs" placeholder={`Ask ${employee.name} about an HR task...`} data-testid={`input-chat-${employee.id}`}/><button onClick={send} className="btn-primary grid h-10 w-10 place-items-center rounded-lg" data-testid={`button-chat-send-${employee.id}`}><Send size={14}/></button></div></div>;
}

function EmployeeAnalyticsPanel({ employee }: { employee: Employee }) {
  const metrics = [['Task completion', `${Math.max(employee.performance - 2, 0)}%`, '#8b5cf6'], ['Response quality', `${employee.performance}%`, employee.color], ['Human review rate', '6.4%', '#f6c76d']];
  return <div className="space-y-5"><div className="grid gap-4 md:grid-cols-3">{metrics.map(([label, value, metricColor]) => <div key={label} className="panel p-5"><div className="kicker">{label}</div><div className="mt-3 display-font text-2xl font-semibold" style={{ color: metricColor }}>{value}</div><div className="mt-1 text-[10px] text-[#71899f]">vs previous period <span className="text-[#34d399]">+8.2%</span></div></div>)}</div><div className="panel p-5"><div className="mb-5 flex items-center justify-between"><div><div className="kicker mb-1">Analytics</div><div className="text-sm font-semibold text-[#deedf1]">{employee.name} operating trend</div></div><BarChart3 size={16} style={{ color: employee.color }}/></div><div className="h-36"><Sparkline values={[38, 44, 41, 57, 53, 68, 63, 76, 70, 84, 79, employee.performance]} color={employee.color} fill/></div><div className="mt-3 flex justify-between text-[10px] text-[#687f92]"><span>30 days ago</span><span>Today</span></div></div></div>;
}

function EmployeeReportsPanel({ employee, reportCount, setReportCount }: { employee: Employee; reportCount: number; setReportCount: (value: number) => void }) {
  const reports = [`Weekly ${employee.role.toLowerCase()} summary`, `${employee.name} activity report`, 'Monthly operating insights'];
  return <div className="panel p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="kicker mb-1">Reports</div><div className="text-sm font-semibold text-[#deedf1]">{reportCount} reports ready</div></div><button onClick={() => { setReportCount(reportCount + 1); toast.success('Report generated'); }} className="btn-primary flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]" data-testid="button-generate-employee-report"><Plus size={13}/> Generate report</button></div><div className="space-y-3">{reports.map((report, index) => <div key={report} className="flex items-center gap-3 rounded-lg bg-[#0c1020] p-4"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#173244] text-[#7fcbd3]"><FileBarChart2 size={15}/></div><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-medium text-[#e2e8f0]">{report}</div><div className="mt-1 text-[10px] text-[#718b9f]">Generated {index + 1} day{index ? 's' : ''} ago 璺� Ready</div></div><button onClick={() => toast.success(`Opening ${report}`)} className="btn-quiet rounded-md px-3 py-2 text-[10px]" data-testid={`button-open-employee-report-${index}`}>Open</button></div>)}</div></div>;
}

function EmployeeNotificationsPanel({ employee, notifications, setNotifications }: { employee: Employee; notifications: boolean; setNotifications: (value: boolean) => void }) {
  const items = [
    ['Review requested', `${employee.name} has a new item that needs human review.`, '12 min ago', '#f6c76d'],
    ['Task completed', `${employee.name} completed ${employee.tasks[0].toLowerCase()}.`, '41 min ago', '#34d399'],
    ['Context refreshed', `${employee.knowledgeSource || 'Workspace context'} was refreshed for this employee.`, '2 hrs ago', employee.color],
  ];
  return <div className="panel p-5 md:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="kicker mb-1">Notifications</div><div className="text-sm font-semibold text-[#deedf1]">{employee.name} signal preferences</div></div><button onClick={() => { setNotifications(!notifications); toast.info(`Notifications ${notifications ? 'muted' : 'enabled'}`); }} className={`relative h-6 w-11 shrink-0 rounded-full ${notifications ? 'bg-[#3c9fae]' : 'bg-[#263d50]'}`} data-testid="switch-ai-notifications"><span className={`absolute top-1 h-4 w-4 rounded-full bg-[#ecf8f8] ${notifications ? 'left-6' : 'left-1'}`}/></button></div><div className="space-y-3">{items.map(([title, detail, time, itemColor]) => <button key={title} onClick={() => toast.info(`${title} opened`)} className="flex w-full items-start gap-3 rounded-lg bg-[#0c1020] p-4 text-left hover:bg-[#10283a]"><span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: itemColor }}/><span className="flex-1"><span className="block text-[12px] font-medium text-[#e2e8f0]">{title}</span><span className="mt-1 block text-[11px] leading-5 text-[#7892a5]">{detail}</span><span className="mt-2 block text-[10px] text-[#5f7c90]">{time}</span></span><ChevronRight size={14} className="mt-1 text-[#55748b]"/></button>)}</div></div>;
}

function EmployeePermissionsPanel({ employee }: { employee: Employee }) {
  return <div className="grid gap-5 lg:grid-cols-[1fr_.9fr]"><div className="panel p-5"><div className="kicker mb-1">Permissions</div><div className="mb-5 text-sm font-semibold text-[#deedf1]">Allowed workspace actions</div><div className="grid gap-2 sm:grid-cols-2">{employee.permissions.map((permission) => <div key={permission} className="flex items-center gap-2 rounded-lg border border-[#2b1d52] bg-[#0b0e1b] px-3 py-3 text-[11px] text-[#a9bfcc]"><CheckCircle2 size={14} className="text-[#34d399]"/>{permission}</div>)}</div></div><div className="panel p-5"><div className="kicker mb-1">Knowledge base</div><div className="text-sm font-semibold text-[#deedf1]">{employee.knowledgeSource || 'Workspace context'}</div><div className="mt-4 space-y-2">{(employee.knowledge || []).map((item) => <div key={item} className="rounded-lg bg-[#0c1020] px-3 py-2 text-[11px] text-[#8da5b4]">{item}</div>)}</div></div></div>;
}

function EmployeeSettingsPanel({ employee, notifications, setNotifications }: { employee: Employee; notifications: boolean; setNotifications: (value: boolean) => void }) {
  const memoryKey = `finos:employee-memory:${employee.id}`;
  const [memory, setMemory] = useState(() => {
    try { return localStorage.getItem(memoryKey) || `${employee.role} operating memory\\nResponsibilities: ${(employee.responsibilities || []).join(', ') || 'Define role-specific responsibilities.'}\\nSkills: ${(employee.skills || []).join(', ') || 'Add role-specific skills.'}\\nEvaluation: use workspace evidence, assigned knowledge, and explicit permissions.`; } catch { return ''; }
  });
  const saveMemory = () => { localStorage.setItem(memoryKey, memory); toast.success(`${employee.name} memory saved`); };
  return <div className="panel p-5 md:p-6"><div className="kicker mb-1">Settings</div><div className="mb-5 text-sm font-semibold text-[#deedf1]">Operating configuration</div><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-lg bg-[#0c1020] p-4"><div className="kicker">Manager</div><div className="mt-2 text-sm text-[#d4e5eb]">{employee.manager}</div></div><div className="rounded-lg bg-[#0c1020] p-4"><div className="kicker">Personality</div><div className="mt-2 text-sm text-[#d4e5eb]">{employee.personality || 'Thoughtful and clear'}</div></div></div><div className="mt-4 rounded-lg border border-[#203c50] bg-[#0c1020] p-4"><div className="flex items-center justify-between"><div><div className="text-[12px] font-medium text-[#d3e3e9]">Activity notifications</div><div className="mt-1 text-[11px] text-[#718b9e]">Receive updates when {employee.name} completes work or needs review.</div></div><button onClick={() => { setNotifications(!notifications); toast.info(`Notifications ${notifications ? 'muted' : 'enabled'}`); }} className={`relative h-6 w-11 shrink-0 rounded-full ${notifications ? 'bg-[#3c9fae]' : 'bg-[#263d50]'}`} data-testid="switch-employee-notifications"><span className={`absolute top-1 h-4 w-4 rounded-full bg-[#ecf8f8] ${notifications ? 'left-6' : 'left-1'}`}/></button></div></div><div className="mt-4 rounded-lg border border-[#203c50] bg-[#10283a] p-4"><div className="kicker mb-2">System prompt</div><p className="text-[11px] leading-5 text-[#8da5b4]">{employee.systemPrompt || 'This employee follows the workspace operating context and assigned permissions.'}</p></div><div className="mt-4 rounded-lg border border-[#203c50] bg-[#0c1020] p-4"><div className="kicker mb-2">Persistent employee memory</div><p className="text-[11px] leading-5 text-[#718b9f]">Role-specific memory persists per employee and can be used as the operating context when a real AI backend is connected.</p><textarea value={memory} onChange={(event) => setMemory(event.target.value)} className="input-dark mt-3 min-h-[130px] w-full resize-y rounded-lg px-3 py-2 text-[11px] leading-5" data-testid={`textarea-employee-memory-${employee.id}`}/><button onClick={saveMemory} className="btn-quiet mt-2 rounded-lg px-3 py-2 text-[10px]" data-testid={`button-save-employee-memory-${employee.id}`}>Save employee memory</button></div><div className="mt-4 rounded-lg border border-[#203c50] bg-[#0c1020] p-4"><div className="kicker mb-2">Email actions</div><p className="text-[11px] leading-5 text-[#718b9f]">Employees can be given an email-send permission, but Gmail/Outlook credentials and OAuth tokens must remain server-side.</p><button onClick={() => toast.info('Email connector is UI-ready; connect OAuth on the backend before enabling real sends.')} className="btn-quiet mt-3 rounded-lg px-3 py-2 text-[10px]">Configure secure email connector</button></div></div>;
}

function TaskManager({ employee, tasks, taskFilter, setTaskFilter, completed, setCompleted, history, setHistory }: { employee: Employee; tasks: string[]; taskFilter: string; setTaskFilter: (value: string) => void; completed: string[]; setCompleted: (value: string[]) => void; history: { task: string; status: string; time: string }[]; setHistory: (value: { task: string; status: string; time: string }[]) => void }) {
  const [assigning, setAssigning] = useState(false);
  const [newTask, setNewTask] = useState('');
  const visible = taskFilter === 'Completed' ? history.filter((item) => item.status === 'Completed').map((item) => item.task) : tasks.filter((task) => !completed.includes(task));
  const assign = () => { if (!newTask.trim()) return; setHistory([{ task: newTask, status: 'Assigned', time: 'Just now' }, ...history]); setNewTask(''); setAssigning(false); toast.success(`Task assigned to ${employee.name}`); };
  return <div className="panel p-5"><div className="mb-4 flex items-center justify-between"><div><div className="kicker mb-1">Task management</div><div className="text-sm font-semibold text-[#deedf1]">Queue and history</div></div><button onClick={() => setAssigning(true)} className="btn-quiet flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[10px]" data-testid="button-assign-task"><Plus size={13}/> Assign task</button></div><div className="mb-4 flex gap-1 rounded-lg bg-[#0b0e1b] p-1"><button onClick={() => setTaskFilter('Open')} className={`flex-1 rounded-md py-1.5 text-[10px] ${taskFilter === 'Open' ? 'bg-[#1d4050] text-[#a78bfa]' : 'text-[#6f899c]'}`}>Open ({tasks.length - completed.length})</button><button onClick={() => setTaskFilter('Completed')} className={`flex-1 rounded-md py-1.5 text-[10px] ${taskFilter === 'Completed' ? 'bg-[#1d4050] text-[#a78bfa]' : 'text-[#6f899c]'}`}>History ({history.filter((item) => item.status === 'Completed').length})</button></div><div className="space-y-2">{visible.map((task, i) => <button key={task} onClick={() => { if (!completed.includes(task)) { setCompleted([...completed, task]); setHistory([{task, status:'Completed', time:'Just now'}, ...history]); toast.success(`${employee.name} completed a task`); } }} className="flex w-full items-center gap-3 rounded-lg border border-transparent bg-[#0c1020] px-3 py-3 text-left text-[12px] text-[#afc2ce] hover:border-[#2b5268] hover:bg-[#10283a]" data-testid={`button-task-${employee.id}-${i}`}><span className={`grid h-6 w-6 place-items-center rounded-md border text-[10px] ${taskFilter === 'Completed' ? 'border-[#167d5a] bg-[#0d3b2c] text-[#6fe0bd]' : 'border-[#2b5268]'}`}><CheckCircle2 size={13}/></span><span className="flex-1">{task}</span><span className="text-[10px] text-[#6f899c]">{taskFilter === 'Completed' ? history.find((item) => item.task === task)?.time : 'Open'}</span></button>)}</div>{assigning && <div className="mt-4 flex gap-2"><input autoFocus value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && assign()} className="input-dark h-9 min-w-0 flex-1 rounded-lg px-3 text-[11px]" placeholder="Describe a task..." data-testid="input-new-task"/><button onClick={assign} className="btn-primary rounded-lg px-3 text-[11px]" data-testid="button-save-task">Assign</button></div>}</div>;
}

function PerformancePanel({ employee }: { employee: Employee }) {
  return <div className="panel p-5"><div className="mb-4 flex items-center justify-between"><div><div className="kicker mb-1">Performance</div><div className="text-sm font-semibold text-[#deedf1]">Outcome quality</div></div><LineChart size={16} style={{color: employee.color}}/></div><div className="flex items-end gap-5"><div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{background:`conic-gradient(${employee.color} 0 ${employee.performance}%, #173044 ${employee.performance}% 100%)`}}><div className="grid h-[74px] w-[74px] place-items-center rounded-full bg-[#0d1020]"><span className="display-font text-xl font-semibold text-[#f1f5f9]">{employee.performance}%</span></div></div><div className="flex-1 space-y-2 text-[11px] text-[#8198aa]"><div className="flex justify-between"><span>Tasks on time</span><b className="text-[#34d399]">98%</b></div><div className="flex justify-between"><span>Decision accuracy</span><b className="text-[#8b5cf6]">{Math.max(employee.performance - 1, 0)}%</b></div><div className="flex justify-between"><span>Human escalations</span><b className="text-[#f6c76d]">4.2%</b></div></div></div><div className="mt-5 h-16"><Sparkline values={[42,48,46,60,56,68,66,75,72,86,84,employee.performance]} color={employee.color} fill/></div><div className="mt-2 flex justify-between text-[10px] text-[#687f92]"><span>Last 30 days</span><span>Today</span></div></div>;
}

function ActivityTimeline({ employee }: { employee: Employee }) {
  const items = [{label:'Completed task review',time:'12 min ago',detail:'Delivered a concise operating recommendation.',color:'#34d399'},{label:'Updated operating context',time:'46 min ago',detail:'Added 14 new payment signals to the workspace.',color:employee.color},{label:'Escalated to Jordan Shaw',time:'2 hrs ago',detail:'Requested a decision on a high-confidence exception.',color:'#f6c76d'},{label:'Started morning scan',time:employee.lastActive,detail:'Reviewed workspace activity and connected data.',color:'#ce9eff'}];
  return <div className="panel p-5"><div className="mb-5 flex items-center justify-between"><div><div className="kicker mb-1">Activity timeline</div><div className="text-sm font-semibold text-[#deedf1]">A visible trail of work</div></div><Clock4 size={16} className="text-[#668ba0]"/></div><div className="space-y-5">{items.map((item) => <div key={item.label} className="relative flex gap-3"><div className="relative mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{background:`${item.color}20`}}><span className="h-1.5 w-1.5 rounded-full" style={{background:item.color}}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[12px] font-medium text-[#d5e5eb]">{item.label}</span><span className="text-[10px] text-[#6e879b]">{item.time}</span></div><p className="mt-1 text-[11px] leading-5 text-[#7d96a7]">{item.detail}</p></div></div>)}</div></div>;
}

function DataPage({ kind }: { kind:'transactions'|'customers'|'merchants' }) {
  const [search,setSearch]=useState(''); const [status,setStatus]=useState('All'); const [selected,setSelected]=useState<string|null>(null);
  const data=kind==='transactions'?transactions:kind==='customers'?customers:merchants;
  const title=kind==='transactions'?'Transactions':kind==='customers'?'Customers':'Merchants';
  const desc=kind==='transactions'?'Monitor every payment event with the context to act quickly.':kind==='customers'?'Understand customer health, value, and the moments that need a human touch.':'A portfolio view for the businesses trusting Orbit Digital with their money movement.';
  const filtered=data.filter(row=>row.join(' ').toLowerCase().includes(search.toLowerCase())&&(status==='All'||row.includes(status)));
  return <div className="mx-auto max-w-[1380px]"><SectionHeader eyebrow={`Money movement / ${data.length.toString().padStart(2,'0')} visible records`} title={title} description={desc} action={<div className="flex gap-2"><button onClick={()=>toast.info('Export prepared locally')} className="btn-quiet flex items-center gap-2 rounded-lg px-3 py-2 text-xs" data-testid={`button-export-${kind}`}><Download size={14}/> Export</button><button onClick={()=>toast.success(`New ${kind.slice(0,-1)} flow opened`)} className="btn-primary flex items-center gap-2 rounded-lg px-3 py-2 text-xs" data-testid={`button-add-${kind}`}><Plus size={14}/> Add {kind==='transactions'?'payment':kind.slice(0,-1)}</button></div>}/><div className="mb-5 grid gap-3 sm:grid-cols-3">{(kind==='transactions'?[['Today','$8.42M','+14.8%'],['Successful','98.72%','+0.34%'],['Needs review','24','-18.6%']]:kind==='customers'?[['Active customers','18,420','+9.4%'],['Healthy','92.8%','+1.2%'],['At risk','128','-12.1%']]:[['Gross volume','$8.42M','+14.8%'],['Active merchants','1,284','+6.2%'],['Avg. auth rate','98.7%','+0.4%']]).map((m,i)=><div key={m[0]} className="panel p-4"><div className="kicker">{m[0]}</div><div className="mt-2 flex items-end justify-between"><span className="display-font text-xl font-semibold text-[#e6f3f5]">{m[1]}</span><span className={`text-[11px] ${m[2].startsWith('-')?'text-[#34d399]':'text-[#34d399]'}`}>{m[2]}</span></div></div>)}</div><div className="panel overflow-hidden"><div className="flex flex-col gap-3 border-b border-[#1b3448] p-4 sm:flex-row sm:items-center"><div className="relative flex-1"><Search size={15} className="absolute left-3 top-2.5 text-[#688198]"/><input value={search} onChange={e=>setSearch(e.target.value)} className="input-dark h-9 w-full rounded-lg pl-9 pr-3 text-xs" placeholder={`Search ${kind}...`} data-testid={`input-search-${kind}`}/></div><div className="flex gap-2"><ListFilter size={15} className="mt-2 text-[#6e879b]"/>{(kind==='transactions'?['All','Captured','Review','Refunded','Failed']:kind==='customers'?['All','Healthy','Review','At risk']:['All','Healthy','Review','At risk']).map(x=><button key={x} onClick={()=>setStatus(x)} className={`rounded-md px-2 py-1.5 text-[10px] ${status===x?'bg-[#1a4050] text-[#a78bfa]':'text-[#7892a5]'}`} data-testid={`button-status-${x.toLowerCase().replace(' ','-')}`}>{x}</button>)}</div><button onClick={()=>toast.info('Filters are synced to this view')} className="rounded-lg p-2 text-[#70899c] hover:bg-[#163147]" data-testid="button-filter-options"><Filter size={15}/></button></div><div className="scrollbar overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-[#1b3448] text-[10px] uppercase tracking-[.12em] text-[#668096]">{(kind==='transactions'?['ID','Merchant','Customer','Amount','Status','Time','Method']:kind==='customers'?['Customer','Email','Merchant','Lifetime value','Health','Last active']:['Merchant','Segment','Volume','Growth','Auth rate','Health']).map(h=><th key={h} className="px-5 py-3 font-medium">{h}</th>)}<th className="px-5 py-3 text-right"/></tr></thead><tbody>{filtered.map((row,i)=><tr key={row[0]} onClick={()=>setSelected(row[0])} className="table-row cursor-pointer border-b border-[#142b3e] text-[12px]" data-testid={`row-${kind}-${i}`}>{kind==='transactions'?<><td className="mono px-5 py-4 text-[10px] text-[#9ab6c5]">{row[0]}</td><td className="px-5 py-4 text-[#d7e5eb]">{row[1]}</td><td className="px-5 py-4 text-[#a1b6c2]">{row[2]}</td><td className="mono px-5 py-4 text-[#e2e8f0]">${row[3]}</td><td className="px-5 py-4"><Status>{row[4]}</Status></td><td className="px-5 py-4 text-[#7891a3]">{row[5]}</td><td className="px-5 py-4 text-[#849cad]">{row[6]}</td></>:kind==='customers'?<><td className="px-5 py-4"><div className="flex items-center gap-2.5"><div className="grid h-7 w-7 place-items-center rounded-full bg-[#274357] text-[9px] text-[#9ed7e0]">{row[1].split(' ').map(x=>x[0]).join('')}</div><div><div className="font-medium text-[#d7e5eb]">{row[1]}</div><div className="mono text-[9px] text-[#688399]">{row[0]}</div></div></div></td><td className="px-5 py-4 text-[#91a9b7]">{row[2]}</td><td className="px-5 py-4 text-[#d7e5eb]">{row[3]}</td><td className="mono px-5 py-4 text-[#e2e8f0]">{row[4]}</td><td className="px-5 py-4"><Status>{row[5]}</Status></td><td className="px-5 py-4 text-[#7891a3]">{row[6]}</td></>:<><td className="px-5 py-4 font-medium text-[#d7e5eb]">{row[0]}</td><td className="px-5 py-4 text-[#8ea5b3]">{row[1]}</td><td className="mono px-5 py-4 text-[#e2e8f0]">{row[2]}</td><td className={`px-5 py-4 ${row[3].startsWith('-')?'text-[#ff897a]':'text-[#34d399]'}`}>{row[3]}</td><td className="px-5 py-4 text-[#d7e5eb]">{row[4]}</td><td className="px-5 py-4"><Status>{row[5]}</Status></td></>}<td className="px-5 py-4 text-right"><MoreHorizontal size={15} className="ml-auto text-[#627d91]"/></td></tr>)}</tbody></table></div>{!filtered.length&&<EmptyState title={`No ${kind} match that search`} description="Try a different search or clear your filters." compact/>}<div className="flex items-center justify-between border-t border-[#1b3448] px-5 py-3 text-[10px] text-[#718a9e]"><span>Showing {filtered.length} of {data.length} records</span><span>Updated just now</span></div></div>{selected&&<Modal title="Record details" onClose={()=>setSelected(null)}><div className="rounded-lg bg-[#10283a] p-4"><div className="kicker mb-1">Selected record</div><div className="mono text-sm text-[#70dce8]">{selected}</div></div><p className="mt-4 text-sm leading-6 text-[#91a9b8]">This is a local preview of the record detail view. Actions taken here are reflected immediately in the workspace.</p><button onClick={()=>{setSelected(null);toast.success('Record marked for follow-up')}} className="btn-primary mt-5 w-full rounded-lg py-2.5 text-xs" data-testid="button-mark-followup">Mark for follow-up</button></Modal>}</div>;
}

function Reports() {
  const [reports,setReports]=useState([{name:'September executive close',type:'Executive summary',date:'Oct 02, 2024',status:'Ready'},{name:'Weekly risk review',type:'Risk & compliance',date:'Sep 30, 2024',status:'Ready'},{name:'Merchant Q3 performance',type:'Merchant health',date:'Sep 28, 2024',status:'Ready'}]); const [open,setOpen]=useState(false); const [name,setName]=useState('');
  return <div className="mx-auto max-w-[1200px]"><SectionHeader eyebrow="Intelligence / reporting" title="Reports that move work forward." description="Create a sharp answer from the operating data, then share it with the people who need to decide." action={<button onClick={()=>setOpen(true)} className="btn-primary flex items-center gap-2 rounded-lg px-3 py-2 text-xs" data-testid="button-new-report"><Plus size={14}/> New report</button>}/><div className="grid gap-4 md:grid-cols-3">{[['Executive close','A clean readout of the business for leadership.','#8b5cf6',FileText],['Risk review','Exceptions, controls, and what changed.','#ff897a',ShieldCheck],['Merchant health','Performance signals by portfolio segment.','#34d399',Building2]].map(([x,d,c,I])=><button key={x as string} onClick={()=>{setName(x as string);setOpen(true)}} className="panel group p-5 text-left" data-testid={`button-template-${(x as string).toLowerCase().replaceAll(' ','-')}`}><div className="mb-8 flex items-start justify-between"><div className="grid h-9 w-9 place-items-center rounded-lg" style={{background:`${c}20`,color:c as string}}><I size={17}/></div><Plus size={15} className="text-[#526e83] group-hover:text-[#8b5cf6]"/></div><div className="font-semibold text-[#e3f1f4]">{x as string}</div><p className="mt-1 text-[11px] leading-5 text-[#7892a5]">{d as string}</p></button>)}</div><div className="mt-8"><div className="mb-4 flex items-center justify-between"><div><div className="kicker mb-1">Saved reports</div><div className="text-sm font-semibold text-[#e0eef1]">Your report library</div></div><button onClick={()=>toast.info('Reports are already synced')} className="text-[11px] text-[#8b5cf6]" data-testid="button-refresh-reports"><RefreshCw size={12} className="mr-1 inline"/> Sync</button></div><div className="panel divide-y divide-[#1a3346]">{reports.map((r,i)=><div key={r.name} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#173244] text-[#7fcbd3]"><FileBarChart2 size={16}/></div><div className="min-w-0 flex-1"><div className="font-medium text-[#e2e8f0]">{r.name}</div><div className="mt-1 text-[11px] text-[#758ea1]">{r.type} <span className="mx-1">閳ワ拷</span>{r.date}</div></div><Status>{r.status}</Status><button onClick={()=>toast.success(`Opening ${r.name}`)} className="btn-quiet flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[11px]" data-testid={`button-open-report-${i}`}><FileText size={13}/> Open</button><button onClick={()=>setReports(reports.filter(x=>x!==r))} className="rounded-md p-2 text-[#6e879a] hover:bg-[#193346] hover:text-[#ff897a]" data-testid={`button-delete-report-${i}`}><X size={14}/></button></div>)}</div></div>{open&&<Modal title="Create report" onClose={()=>setOpen(false)}><div className="space-y-4"><label className="block"><span className="kicker mb-2 block">Report name</span><input autoFocus value={name} onChange={e=>setName(e.target.value)} className="input-dark h-10 w-full rounded-lg px-3 text-sm" placeholder="e.g. October operating review" data-testid="input-report-name"/></label><label className="block"><span className="kicker mb-2 block">Report type</span><select className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="select-report-type"><option>Executive summary</option><option>Risk & compliance</option><option>Merchant health</option><option>Finance close</option></select></label><button onClick={()=>{if(!name.trim())return;setReports([{name,type:'Custom report',date:'Just now',status:'Ready'},...reports]);setOpen(false);setName('');toast.success('Report generated')}} className="btn-primary w-full rounded-lg py-2.5 text-xs" data-testid="button-generate-report">Generate report</button></div></Modal>}</div>;
}

function Analytics() {
  const [metric,setMetric]=useState('Payment volume'); const [period,setPeriod]=useState('30D');
  return <div className="mx-auto max-w-[1300px]"><SectionHeader eyebrow="Intelligence / analytics" title="See the signal in the noise." description="A living view of the forces shaping payments, customers, and merchant growth." action={<div className="flex gap-2">{['7D','30D','90D'].map(x=><button key={x} onClick={()=>setPeriod(x)} className={`rounded-lg border px-3 py-2 text-[11px] ${period===x?'border-[#428fa1] bg-[#153743] text-[#68dce8]':'border-[#30235d] text-[#7892a5]'}`} data-testid={`button-analytics-${x}`}>{x}</button>)}</div>}/><div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]"><div className="panel p-5 md:p-6"><div className="mb-7 flex flex-wrap items-center justify-between gap-3"><div><div className="kicker mb-1">Trend explorer / {period}</div><div className="text-sm font-semibold text-[#deedf1]">{metric}</div></div><select value={metric} onChange={e=>setMetric(e.target.value)} className="input-dark rounded-lg px-3 py-2 text-[11px]" data-testid="select-analytics-metric"><option>Payment volume</option><option>Authorization rate</option><option>Customer retention</option><option>Merchant growth</option></select></div><div className="relative h-[250px]"><div className="absolute inset-0 flex flex-col justify-between text-[10px] text-[#536d81]">{['$12M','$9M','$6M','$3M','$0'].map(x=><span key={x}>{x}</span>)}</div><div className="ml-12 h-full"><div className="flex h-full flex-col justify-between">{[0,1,2,3,4].map(i=><div key={i} className="border-t border-dashed border-[#21394d]"/>)}</div><div className="absolute bottom-4 left-12 right-0 top-0"><Sparkline values={[34,39,36,51,48,57,54,69,63,72,68,82,76,90,86]} color="#8b5cf6" fill/><div className="absolute bottom-[-22px] left-0 right-0 flex justify-between text-[10px] text-[#536d81]">{['Sep 10','Sep 15','Sep 20','Sep 25','Sep 30','Oct 05','Oct 09'].map(x=><span key={x}>{x}</span>)}</div></div></div></div><div className="mt-8 flex items-center justify-between border-t border-[#1b3448] pt-4 text-[11px]"><span className="text-[#7891a3]">Period total</span><span className="mono text-[#dcecf0]">{metric==='Payment volume'?'$31.84M':metric==='Authorization rate'?'98.72%':metric==='Customer retention'?'94.6%':'18.4%'}</span></div></div><div className="panel p-5"><div className="kicker mb-1">Breakdown</div><div className="mb-5 text-sm font-semibold text-[#deedf1]">Where volume comes from</div><div className="space-y-4">{[['North America','48%','#8b5cf6'],['Europe','27%','#ce9eff'],['APAC','16%','#f6c76d'],['LATAM','9%','#34d399']].map(x=><div key={x[0]}><div className="mb-1 flex justify-between text-[11px]"><span className="text-[#a2b6c1]">{x[0]}</span><span className="text-[#d4e6eb]">{x[1]}</span></div><div className="h-2 rounded-full bg-[#142c3d]"><div className="h-full rounded-full" style={{width:x[1],background:x[2]}}/></div></div>)}</div><div className="signal-line my-6"/><div className="flex items-center gap-3 rounded-lg bg-[#10283a] p-3"><TrendingUp size={17} className="text-[#34d399]"/><div><div className="text-[11px] font-semibold text-[#cfe3e8]">Strongest signal</div><div className="mt-1 text-[10px] text-[#7c96a7]">EU card volume is up 22% week over week.</div></div></div></div></div><div className="mt-5 grid gap-4 md:grid-cols-3">{[['Checkout conversion','74.8%','+4.2%',Target],['Avg. ticket','$184.62','+8.9%',CreditCard],['Settlement speed','1.8 days','-0.4d',Clock3]].map(([a,b,c,I])=><div className="panel p-5" key={a as string}><div className="flex items-center justify-between"><div className="kicker">{a as string}</div><I size={16} className="text-[#668ba0]"/></div><div className="mt-3 display-font text-2xl font-semibold text-[#e3f0f3]">{b as string}</div><div className="mt-1 text-[11px] text-[#34d399]">{c as string} <span className="text-[#6e879c]">vs last period</span></div><div className="mt-4"><TinyBars color={(I===Clock3?'#ce9eff':I===Target?'#8b5cf6':'#34d399') as string}/></div></div>)}</div></div>;
}

function SettingsPage() {
  const [saved,setSaved]=useState(false); const [alerts,setAlerts]=useState(true); const [digest,setDigest]=useState(false);
  return <div className="mx-auto max-w-[980px]"><SectionHeader eyebrow="Workspace / preferences" title="Settings" description="Shape how Orbit Digital works for your team. Changes are local to this demo workspace."/><div className="grid gap-5 md:grid-cols-[210px_1fr]"><div className="flex gap-1 overflow-x-auto md:block">{['Workspace','Notifications','Team access','Security'].map((x,i)=><button key={x} className={`mb-1 block whitespace-nowrap rounded-lg px-3 py-2 text-left text-[12px] ${i===0?'bg-[#153743] text-[#a78bfa]':'text-[#7892a5] hover:bg-[#12283a]'}`} data-testid={`button-settings-${x.toLowerCase().replace(' ','-')}`}>{x}</button>)}</div><div className="space-y-5"><div className="panel p-5 md:p-6"><div className="kicker mb-1">Workspace profile</div><div className="mb-6 text-sm font-semibold text-[#e2eff2]">The context your AI team uses</div><div className="grid gap-4 sm:grid-cols-2"><label><span className="kicker mb-2 block">Workspace name</span><input defaultValue="Orbit Digital" className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="input-workspace-name"/></label><label><span className="kicker mb-2 block">Timezone</span><select className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="select-timezone"><option>Pacific Time (US & Canada)</option><option>Eastern Time (US & Canada)</option><option>London</option><option>Central European Time</option></select></label></div><label className="mt-4 block"><span className="kicker mb-2 block">Operating context</span><textarea defaultValue="Orbit Digital is a global payments platform serving thoughtful commerce brands." className="input-dark min-h-[90px] w-full resize-none rounded-lg px-3 py-2 text-sm" data-testid="textarea-context"/></label></div><div className="panel p-5 md:p-6"><div className="kicker mb-1">Notifications</div><div className="mb-5 text-sm font-semibold text-[#e2eff2]">Keep the right signals close</div>{[['Critical risk signals','Get notified when an AI employee finds something that needs a human decision.',alerts,setAlerts],['Weekly operating digest','A concise summary delivered every Monday morning.',digest,setDigest]].map(([label,desc,value,setValue])=><div key={label as string} className="flex items-center justify-between border-b border-[#1a3346] py-4 first:pt-0 last:border-0 last:pb-0"><div className="pr-4"><div className="text-[12px] font-medium text-[#d3e3e9]">{label as string}</div><div className="mt-1 text-[11px] leading-5 text-[#718b9e]">{desc as string}</div></div><button onClick={()=>{(setValue as (v:boolean)=>void)(!(value as boolean));toast.info(`${label} ${(value as boolean)?'disabled':'enabled'}`)}} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value?'bg-[#3c9fae]':'bg-[#263d50]'}`} data-testid={`switch-${(label as string).toLowerCase().replaceAll(' ','-')}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-[#ecf8f8] transition-transform ${value?'left-6':'left-1'}`}/></button></div>)}</div><div className="flex justify-end"><button onClick={()=>{setSaved(true);toast.success('Settings saved')}} className="btn-primary rounded-lg px-4 py-2.5 text-xs" data-testid="button-save-settings">{saved?'Saved':'Save changes'}</button></div></div></div></div>;
}

function SettingsV2() {
  const { user, updateUser, preferences, updatePreferences, theme, toggleTheme } = usePlatform();
  const [section, setSection] = useState<'Workspace' | 'Notifications' | 'Security'>('Workspace');
  const [saved, setSaved] = useState(false);
  const save = () => { setSaved(true); toast.success('Settings saved'); setTimeout(() => setSaved(false), 1600); };
  return <div className="mx-auto max-w-[980px]"><SectionHeader eyebrow="Workspace / preferences" title="Settings" description="Shape how Orbit Digital works for your team. These preferences persist in this workspace."/><div className="grid gap-5 md:grid-cols-[210px_1fr]"><div className="flex gap-1 overflow-x-auto md:block">{(['Workspace', 'Notifications', 'Security'] as const).map((item) => <button key={item} onClick={() => setSection(item)} className={`mb-1 block whitespace-nowrap rounded-lg px-3 py-2 text-left text-[12px] ${section === item ? 'bg-[#153743] text-[#a78bfa]' : 'text-[#7892a5] hover:bg-[#12283a]'}`} data-testid={`button-settings-${item.toLowerCase()}`}>{item}</button>)}</div><div className="space-y-5">
    {section === 'Workspace' && <><div className="panel p-5 md:p-6"><div className="kicker mb-1">Workspace profile</div><div className="mb-6 text-sm font-semibold text-[#e2eff2]">The context your AI team uses</div><div className="grid gap-4 sm:grid-cols-2"><label><span className="kicker mb-2 block">Workspace name</span><input value={preferences.workspaceName} onChange={(event) => updatePreferences({ workspaceName: event.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="input-workspace-name"/></label><label><span className="kicker mb-2 block">Timezone</span><select value={user.timezone} onChange={(event) => updateUser({ timezone: event.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="select-timezone"><option>Pacific Time (US & Canada)</option><option>Eastern Time (US & Canada)</option><option>London</option><option>Central European Time</option></select></label></div><label className="mt-4 block"><span className="kicker mb-2 block">Operating context</span><textarea value={preferences.operatingContext} onChange={(event) => updatePreferences({ operatingContext: event.target.value })} className="input-dark min-h-[90px] w-full resize-none rounded-lg px-3 py-2 text-sm" data-testid="textarea-context"/></label></div><div className="panel p-5 md:p-6"><div className="kicker mb-1">Appearance</div><div className="mb-5 text-sm font-semibold text-[#e2eff2]">Make the workspace yours</div><div className="flex items-center justify-between"><div><div className="text-[12px] font-medium text-[#d3e3e9]">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</div><div className="mt-1 text-[11px] text-[#718b9e]">Use the FinOS palette that fits your workday.</div></div><button onClick={toggleTheme} className="btn-quiet flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]" data-testid="button-toggle-theme">{theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>} Switch to {theme === 'dark' ? 'light' : 'dark'}</button></div></div></>}
    {section === 'Notifications' && <div className="panel p-5 md:p-6"><div className="kicker mb-1">Notifications</div><div className="mb-5 text-sm font-semibold text-[#e2eff2]">Keep the right signals close</div>{[['Critical risk signals', 'Get notified when an AI employee finds something that needs a human decision.', preferences.criticalAlerts, (value: boolean) => updatePreferences({ criticalAlerts: value })], ['Weekly operating digest', 'A concise summary delivered every Monday morning.', preferences.weeklyDigest, (value: boolean) => updatePreferences({ weeklyDigest: value })]].map(([label, description, value, setter]) => <div key={label as string} className="flex items-center justify-between border-b border-[#1a3346] py-4 first:pt-0 last:border-0 last:pb-0"><div className="pr-4"><div className="text-[12px] font-medium text-[#d3e3e9]">{label as string}</div><div className="mt-1 text-[11px] leading-5 text-[#718b9e]">{description as string}</div></div><button onClick={() => (setter as (value: boolean) => void)(!(value as boolean))} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? 'bg-[#3c9fae]' : 'bg-[#263d50]'}`} data-testid={`switch-${(label as string).toLowerCase().replaceAll(' ', '-')}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-[#ecf8f8] transition-transform ${value ? 'left-6' : 'left-1'}`}/></button></div>)}</div>}
    {section === 'Security' && <div className="panel p-5 md:p-6"><div className="kicker mb-1">Security</div><div className="mb-5 text-sm font-semibold text-[#e2eff2]">Session and access controls</div><div className="space-y-3 text-[12px]"><div className="flex items-center justify-between rounded-lg bg-[#0c1020] p-4"><span className="text-[#b7cbd4]">Current session</span><span className="status-pill border-[#167d5a] bg-[#0d3b2c] text-[#6fe0bd]">Active</span></div><div className="flex items-center justify-between rounded-lg bg-[#0c1020] p-4"><span className="text-[#b7cbd4]">Automatic session expiry</span><span className="text-[#7892a5]">8 hours</span></div><div className="flex items-center justify-between rounded-lg bg-[#0c1020] p-4"><span className="text-[#b7cbd4]">Workspace role</span><span className="text-[#8b5cf6]">{user.role}</span></div></div></div>}
    {section !== 'Notifications' && <div className="flex justify-end"><button onClick={save} className="btn-primary rounded-lg px-4 py-2.5 text-xs" data-testid="button-save-settings">{saved ? 'Saved' : 'Save changes'}</button></div>}</div></div></div>;
}

function DataPageV2({ kind }: { kind: 'transactions' | 'customers' | 'merchants' }) {
  const platform = usePlatform();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TransactionRecord | CustomerRecord | MerchantRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const pageSize = 5;
  if (kind === 'merchants' && !isPlatformOwner(platform.user.email)) return <NotFound />;
  const rows = kind === 'transactions' ? platform.transactions : kind === 'customers' ? platform.customers : platform.merchants;
  const matches = (row: TransactionRecord | CustomerRecord | MerchantRecord) => {
    const text = JSON.stringify(row).toLowerCase();
    const state = 'status' in row ? row.status : 'health' in row ? row.health : '';
    return text.includes(search.toLowerCase()) && (status === 'All' || state === status);
  };
  const filtered = rows.filter(matches);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const title = kind === 'transactions' ? 'Transactions' : kind === 'customers' ? 'Customers' : 'Merchants';
  const statuses = kind === 'transactions' ? ['All', 'Captured', 'Review', 'Refunded', 'Failed'] : ['All', 'Healthy', 'Review', 'At risk'];
  const exportData = () => {
    const csv = [Object.keys(rows[0] || {}).join(','), ...filtered.map((row) => Object.values(row).map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`${title} export downloaded`);
  };
  const resetFilters = () => { setSearch(''); setStatus('All'); setPage(1); };
  return <div className="mx-auto max-w-[1380px]">
    <SectionHeader eyebrow={`Money movement / ${filtered.length.toString().padStart(2, '0')} visible records`} title={title} description={kind === 'transactions' ? 'Review, update, and export every payment event with the context to act quickly.' : kind === 'customers' ? 'Understand customer health, value, and the moments that need a human touch.' : 'Manage the businesses trusting Orbit Digital with their money movement.'} action={<div className="flex flex-wrap gap-2"><button onClick={exportData} className="btn-quiet flex items-center gap-2 rounded-lg px-3 py-2 text-xs" data-testid={`button-export-${kind}`}><FileDown size={14}/> Export</button><button onClick={() => setFormOpen(true)} className="btn-primary flex items-center gap-2 rounded-lg px-3 py-2 text-xs" data-testid={`button-add-${kind}`}><Plus size={14}/> Add {kind === 'transactions' ? 'payment' : kind.slice(0, -1)}</button></div>}/>
    <div className="mb-5 grid gap-3 sm:grid-cols-3">{(kind === 'transactions' ? [['Volume', `$${platform.transactions.reduce((sum, row) => sum + row.amount, 0).toLocaleString()}`, '+14.8%'], ['Successful', `${Math.round(platform.transactions.filter((row) => row.status === 'Captured').length / Math.max(platform.transactions.length, 1) * 100)}%`, '+0.34%'], ['Needs review', String(platform.transactions.filter((row) => row.status === 'Review').length), '-18.6%']] : kind === 'customers' ? [['Active customers', platform.customers.length.toLocaleString(), '+9.4%'], ['Healthy', `${Math.round(platform.customers.filter((row) => row.health === 'Healthy').length / Math.max(platform.customers.length, 1) * 100)}%`, '+1.2%'], ['At risk', String(platform.customers.filter((row) => row.health === 'At risk').length), '-12.1%']] : [['Gross volume', `$${(platform.merchants.reduce((sum, row) => sum + row.volume, 0) / 1000000).toFixed(2)}M`, '+14.8%'], ['Active merchants', String(platform.merchants.length), '+6.2%'], ['Avg. auth rate', `${(platform.merchants.reduce((sum, row) => sum + row.authRate, 0) / Math.max(platform.merchants.length, 1)).toFixed(1)}%`, '+0.4%']]).map((metric) => <div key={metric[0]} className="panel p-4"><div className="kicker">{metric[0]}</div><div className="mt-2 flex items-end justify-between"><span className="display-font text-xl font-semibold text-[#e6f3f5]">{metric[1]}</span><span className="text-[11px] text-[#34d399]">{metric[2]}</span></div></div>)}</div>
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#1b3448] p-4 sm:flex-row sm:items-center"><div className="relative flex-1"><Search size={15} className="absolute left-3 top-2.5 text-[#688198]"/><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="input-dark h-9 w-full rounded-lg pl-9 pr-3 text-xs" placeholder={`Search ${kind}...`} data-testid={`input-search-${kind}`}/></div><div className="flex flex-wrap items-center gap-1"><ListFilter size={15} className="mr-1 text-[#6e879b]"/>{statuses.map((item) => <button key={item} onClick={() => { setStatus(item); setPage(1); }} className={`rounded-md px-2 py-1.5 text-[10px] ${status === item ? 'bg-[#1a4050] text-[#a78bfa]' : 'text-[#7892a5]'}`} data-testid={`button-status-${item.toLowerCase().replace(' ', '-')}`}>{item}</button>)}</div>{(search || status !== 'All') && <button onClick={resetFilters} className="text-[10px] text-[#8b5cf6]" data-testid="button-clear-data-filters">Clear</button>}</div>
      {kind === 'transactions' && <div className="scrollbar overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="border-b border-[#1b3448] text-[10px] uppercase tracking-[.12em] text-[#668096]">{['ID', 'Merchant', 'Customer', 'Amount', 'Status', 'Time', 'Method', ''].map((heading) => <th key={heading} className="px-5 py-3 font-medium">{heading}</th>)}</tr></thead><tbody>{visible.map((item) => { const row = item as TransactionRecord; return <tr key={row.id} onClick={() => setSelected(row)} className="table-row cursor-pointer border-b border-[#142b3e] text-[12px]" data-testid={`row-transactions-${row.id}`}><td className="mono px-5 py-4 text-[10px] text-[#9ab6c5]">{row.id}</td><td className="px-5 py-4 text-[#d7e5eb]">{row.merchant}</td><td className="px-5 py-4 text-[#a1b6c2]">{row.customer}</td><td className="mono px-5 py-4 text-[#e2e8f0]">${row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td className="px-5 py-4"><Status>{row.status}</Status></td><td className="px-5 py-4 text-[#7891a3]">{row.time}</td><td className="px-5 py-4 text-[#849cad]">{row.method}</td><td className="px-5 py-4 text-right"><MoreHorizontal size={15} className="ml-auto text-[#627d91]"/></td></tr>; })}</tbody></table></div>}
      {kind === 'customers' && <div className="scrollbar overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-[#1b3448] text-[10px] uppercase tracking-[.12em] text-[#668096]">{['Customer', 'Email', 'Merchant', 'Lifetime value', 'Health', 'Last active', ''].map((heading) => <th key={heading} className="px-5 py-3 font-medium">{heading}</th>)}</tr></thead><tbody>{visible.map((item) => { const row = item as CustomerRecord; return <tr key={row.id} onClick={() => setSelected(row)} className="table-row cursor-pointer border-b border-[#142b3e] text-[12px]" data-testid={`row-customers-${row.id}`}><td className="px-5 py-4"><div className="flex items-center gap-2.5"><div className="grid h-7 w-7 place-items-center rounded-full bg-[#274357] text-[9px] text-[#9ed7e0]">{row.name.split(' ').map((part) => part[0]).join('')}</div><div><div className="font-medium text-[#d7e5eb]">{row.name}</div><div className="mono text-[9px] text-[#688399]">{row.id}</div></div></div></td><td className="px-5 py-4 text-[#91a9b7]">{row.email}</td><td className="px-5 py-4 text-[#d7e5eb]">{row.merchant}</td><td className="mono px-5 py-4 text-[#e2e8f0]">${row.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td className="px-5 py-4"><Status>{row.health}</Status></td><td className="px-5 py-4 text-[#7891a3]">{row.lastActive}</td><td className="px-5 py-4 text-right"><MoreHorizontal size={15} className="ml-auto text-[#627d91]"/></td></tr>; })}</tbody></table></div>}
      {kind === 'merchants' && <div className="scrollbar overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-[#1b3448] text-[10px] uppercase tracking-[.12em] text-[#668096]">{['Merchant', 'Segment', 'Volume', 'Growth', 'Auth rate', 'Health', ''].map((heading) => <th key={heading} className="px-5 py-3 font-medium">{heading}</th>)}</tr></thead><tbody>{visible.map((item) => { const row = item as MerchantRecord; return <tr key={row.id} onClick={() => setSelected(row)} className="table-row cursor-pointer border-b border-[#142b3e] text-[12px]" data-testid={`row-merchants-${row.id}`}><td className="px-5 py-4 font-medium text-[#d7e5eb]">{row.name}<div className="mono mt-1 text-[9px] text-[#688399]">{row.id}</div></td><td className="px-5 py-4 text-[#8ea5b3]">{row.segment}</td><td className="mono px-5 py-4 text-[#e2e8f0]">${(row.volume / 1000000).toFixed(2)}M</td><td className={`px-5 py-4 ${row.growth < 0 ? 'text-[#ff897a]' : 'text-[#34d399]'}`}>{row.growth > 0 ? '+' : ''}{row.growth}%</td><td className="px-5 py-4 text-[#d7e5eb]">{row.authRate}%</td><td className="px-5 py-4"><Status>{row.health}</Status></td><td className="px-5 py-4 text-right"><MoreHorizontal size={15} className="ml-auto text-[#627d91]"/></td></tr>; })}</tbody></table></div>}
      {!visible.length && <EmptyState title={`No ${kind} found`} description="Try a different search or clear your filters." compact/>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1b3448] px-5 py-3 text-[10px] text-[#718a9e]"><span>Showing {visible.length} of {filtered.length} records</span><div className="flex items-center gap-2"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="btn-quiet rounded-md px-2 py-1 disabled:opacity-40">Previous</button><span>Page {page} / {totalPages}</span><button disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="btn-quiet rounded-md px-2 py-1 disabled:opacity-40">Next</button></div></div>
    </div>
    {selected && <RecordModal kind={kind} record={selected} onClose={() => setSelected(null)} />}
    {formOpen && <DataForm kind={kind} onClose={() => setFormOpen(false)} />}
  </div>;
}

function RecordModal({ kind, record, onClose }: { kind: 'transactions' | 'customers' | 'merchants'; record: TransactionRecord | CustomerRecord | MerchantRecord; onClose: () => void }) {
  const platform = usePlatform();
  const transaction = kind === 'transactions' ? record as TransactionRecord : null;
  const customer = kind === 'customers' ? record as CustomerRecord : null;
  const merchant = kind === 'merchants' ? record as MerchantRecord : null;
  const [note, setNote] = useState(customer?.notes?.[0] || '');
  const statuses: string[] = transaction ? ['Captured', 'Review', 'Refunded', 'Failed'] : ['Healthy', 'Review', 'At risk'];
  return <Modal title={`${kind === 'transactions' ? 'Transaction' : kind === 'customers' ? 'Customer' : 'Merchant'} details`} onClose={onClose}>
    <div className="space-y-4">
      <div className="rounded-lg border border-[#24465c] bg-[#10283a] p-4">
        <div className="kicker mb-1">Record ID</div>
        <div className="mono text-sm text-[#70dce8]">{record.id}</div>
        <div className="mt-3 text-sm font-semibold text-[#e2f0f3]">{transaction?.merchant || customer?.name || merchant?.name}</div>
        <div className="mt-1 text-[11px] text-[#7f98a9]">{transaction?.customer || customer?.email || merchant?.segment}</div>
      </div>
      {transaction && <div className="grid grid-cols-2 gap-3 text-[11px]"><div className="rounded-lg bg-[#0c1020] p-3"><div className="kicker">Amount</div><div className="mt-1 text-lg font-semibold text-[#e7f3f5]">${transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div></div><div className="rounded-lg bg-[#0c1020] p-3"><div className="kicker">Payment method</div><div className="mt-2 text-[#b9ccd5]">{transaction.method}</div></div></div>}
      {merchant && <div className="grid grid-cols-2 gap-3 text-[11px]"><div className="rounded-lg bg-[#0c1020] p-3"><div className="kicker">Volume</div><div className="mt-1 text-lg font-semibold text-[#e7f3f5]">${(merchant.volume / 1000000).toFixed(2)}M</div></div><div className="rounded-lg bg-[#0c1020] p-3"><div className="kicker">Auth rate</div><div className="mt-1 text-lg font-semibold text-[#e7f3f5]">{merchant.authRate}%</div></div></div>}
      {customer && <div><div className="kicker mb-2">Account notes</div><textarea value={note} onChange={(event) => setNote(event.target.value)} className="input-dark min-h-[82px] w-full resize-none rounded-lg px-3 py-2 text-xs" placeholder="Add a CRM note for the next teammate..." data-testid="textarea-customer-note"/></div>}
      <div><div className="kicker mb-2">Update status</div><div className="flex flex-wrap gap-2">{statuses.map((item) => <button key={item} onClick={() => { if (transaction) platform.updateTransactionStatus(transaction.id, item as TransactionRecord['status']); if (customer) platform.updateCustomerHealth(customer.id, item as CustomerRecord['health']); if (merchant) platform.updateMerchantHealth(merchant.id, item as MerchantRecord['health']); toast.success(`Status updated to ${item}`); onClose(); }} className="btn-quiet rounded-lg px-3 py-2 text-[11px]" data-testid={`button-update-status-${item.toLowerCase().replace(' ', '-')}`}>{item}</button>)}</div></div>
      <div className="flex justify-between gap-2 border-t border-[#1b3448] pt-4">{customer && <button onClick={() => { const notes = customer.notes || []; platform.updateCustomerNotes(customer.id, note.trim() ? [note.trim(), ...notes.filter((item) => item !== note.trim())] : notes); toast.success('Customer notes saved'); onClose(); }} className="btn-primary rounded-lg px-4 py-2.5 text-xs" data-testid="button-save-customer-note">Save note</button>}{transaction && <button onClick={() => { platform.deleteTransaction(transaction.id); toast.success('Transaction removed'); onClose(); }} className="rounded-lg border border-[#713e48] px-4 py-2.5 text-xs text-[#ff9b90]" data-testid="button-delete-transaction">Delete</button>}{merchant && <button onClick={() => { platform.deleteMerchant(merchant.id); toast.success('Merchant removed'); onClose(); }} className="rounded-lg border border-[#713e48] px-4 py-2.5 text-xs text-[#ff9b90]" data-testid="button-delete-merchant">Delete</button>}<button onClick={onClose} className="btn-quiet ml-auto rounded-lg px-4 py-2.5 text-xs">Close</button></div>
    </div>
  </Modal>;
}

function DataForm({ kind, onClose }: { kind: 'transactions' | 'customers' | 'merchants'; onClose: () => void }) {
  const platform = usePlatform();
  const [values, setValues] = useState<Record<string, string>>({});
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const field = (key: string, label: string, placeholder: string, type = 'text') => <label className="block"><span className="kicker mb-2 block">{label}</span><input type={type} value={values[key] || ''} onChange={(event) => set(key, event.target.value)} className="input-dark h-10 w-full rounded-lg px-3 text-sm" placeholder={placeholder} data-testid={`input-${kind}-${key}`}/></label>;

  const save = (): void => {
    if (kind === 'transactions') {
      if (!values.merchant || !values.customer || !values.amount) { toast.error('Add merchant, customer, and amount'); return; }
      platform.addTransaction({ merchant: values.merchant, customer: values.customer, amount: Number(values.amount), status: (values.status || 'Captured') as TransactionRecord['status'], method: values.method || 'Visa 鈥⑩€⑩€⑩€� 0000', country: values.country || 'US' });
    } else if (kind === 'customers') {
      if (!values.name || !values.email || !values.companyName) { toast.error('Add customer name, email, and company name'); return; }
      if (!idDocument) { toast.error('Attach the company document/image before saving'); return; }
      platform.addCustomer({ name: values.name, email: values.email, merchant: values.companyName, value: Number(values.value || 0), health: (values.health || 'Healthy') as CustomerRecord['health'], segment: (values.segment || 'Emerging') as CustomerRecord['segment'], notes: [`Company document: ${idDocument.name}`, `Website: ${values.companyWebsite || 'Not provided'}`, `Phone: ${values.phone || 'Not provided'}`, `Registration / tax ID: ${values.registrationNumber || 'Not provided'}`], activity: [{ label: 'Customer company added to workspace', time: 'Just now' }] });
    } else {
      if (!values.name || !values.segment) { toast.error('Add a merchant name and segment'); return; }
      platform.addMerchant({ name: values.name, segment: values.segment, volume: Number(values.volume || 0), growth: Number(values.growth || 0), authRate: Number(values.authRate || 0), health: (values.health || 'Healthy') as MerchantRecord['health'], country: values.country || 'US' });
    }
    toast.success(`${kind.slice(0, -1)} added to the workspace`);
    onClose();
  };

  return <Modal title={`Add ${kind === 'transactions' ? 'payment' : kind.slice(0, -1)}`} onClose={onClose}>
    <div className="space-y-4">
      {kind === 'transactions' && <><div className="grid gap-4 sm:grid-cols-2">{field('merchant', 'Merchant', 'Northstar Market')}{field('customer', 'Customer', 'Maya Chen')}</div><div className="grid gap-4 sm:grid-cols-2">{field('amount', 'Amount', '1200.00', 'number')}{field('method', 'Payment method', 'Visa 鈥⑩€⑩€⑩€� 0000')}</div><div className="grid gap-4 sm:grid-cols-2"><label><span className="kicker mb-2 block">Status</span><select value={values.status || 'Captured'} onChange={(event) => set('status', event.target.value)} className="input-dark h-10 w-full rounded-lg px-3 text-sm"><option>Captured</option><option>Review</option><option>Refunded</option><option>Failed</option></select></label>{field('country', 'Country', 'US')}</div></>}
      {kind === 'customers' && <><div className="grid gap-4 sm:grid-cols-2">{field('name', 'Contact name', 'Maya Chen')}{field('email', 'Business email', 'maya@company.com', 'email')}</div><div className="grid gap-4 sm:grid-cols-2">{field('companyName', 'Company name', 'Northstar Market')}{field('companyWebsite', 'Company website', 'https://company.com', 'url')}</div><div className="grid gap-4 sm:grid-cols-2">{field('phone', 'Phone', '+20 100 000 0000')}{field('registrationNumber', 'Registration / tax ID', 'Company registration number')}</div><div className="grid gap-4 sm:grid-cols-2">{field('value', 'Lifetime value', '2400', 'number')}<label><span className="kicker mb-2 block">Health</span><select value={values.health || 'Healthy'} onChange={(event) => set('health', event.target.value)} className="input-dark h-10 w-full rounded-lg px-3 text-sm"><option>Healthy</option><option>Review</option><option>At risk</option></select></label></div><label><span className="kicker mb-2 block">Company document / logo / ID attachment <span className="normal-case tracking-normal text-[#536f84]">(required)</span></span><input type="file" accept="image/*,.pdf" onChange={(event) => setIdDocument(event.target.files?.[0] || null)} className="input-dark block w-full rounded-lg px-3 py-2 text-xs" data-testid="input-customer-id-document"/>{idDocument && <span className="mt-2 block text-[10px] text-[#6fe0bd]">{idDocument.name} 鈥� {Math.ceil(idDocument.size / 1024)} KB</span>}</label></>}
      {kind === 'merchants' && <><div className="rounded-xl border border-[#3a2a6a] bg-[#0c2130] p-4 text-[11px] leading-5 text-[#8aa1b0]">Merchant creation is reserved for the platform owner account. Subscriber workspaces no longer expose the Merchant creation area.</div><div className="grid gap-4 sm:grid-cols-2">{field('name', 'Merchant name', 'Northstar Market')}{field('segment', 'Segment', 'Retail / US')}</div><div className="grid gap-4 sm:grid-cols-2">{field('volume', 'Volume', '500000', 'number')}{field('growth', 'Growth %', '12.4', 'number')}</div><div className="grid gap-4 sm:grid-cols-2">{field('authRate', 'Authorization rate', '98.5', 'number')}{field('country', 'Country', 'US')}</div></>}
      <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="btn-quiet rounded-lg px-4 py-2.5 text-xs">Cancel</button><button onClick={save} className="btn-primary rounded-lg px-4 py-2.5 text-xs" data-testid={`button-save-${kind}`}>Save record</button></div>
    </div>
  </Modal>;
}

function ReportsV2() {
  const { reports, addReport, deleteReport, transactions, merchants } = usePlatform();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('Executive summary');
  const exportReport = (reportName: string) => {
    const csv = `report,generated,transactions,merchants\n"${reportName}",${new Date().toISOString()},${transactions.length},${merchants.length}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${reportName.toLowerCase().replaceAll(' ', '-')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Report export downloaded');
  };
  return <div className="mx-auto max-w-[1200px]">
    <SectionHeader eyebrow="Intelligence / reporting" title="Reports that move work forward." description="Create financial summaries from the live operating data, then export them for the people who need to decide." action={<button onClick={() => setOpen(true)} className="btn-primary flex items-center gap-2 rounded-lg px-3 py-2 text-xs" data-testid="button-new-report"><Plus size={14}/> New report</button>}/>
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><MetricCard label="Payment volume" value={`$${transactions.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}`} delta="+14.8%" icon={CircleDollarSign}/><MetricCard label="Transactions reviewed" value={String(transactions.length)} delta="+8.2%" icon={Check} color="#34d399"/><MetricCard label="Merchant portfolio" value={`$${(merchants.reduce((sum, item) => sum + item.volume, 0) / 1000000).toFixed(2)}M`} delta="+12.2%" icon={Building2} color="#f6c76d"/></div>
    <div className="grid gap-4 md:grid-cols-3">{[['Executive close', 'Leadership summary with volume, success, and risk.', FileText, '#8b5cf6'], ['Risk review', 'Exceptions, controls, and changes worth a decision.', ShieldCheck, '#ff897a'], ['Merchant health', 'Portfolio performance by merchant and segment.', Building2, '#34d399']].map(([label, description, IconComponent, color]) => <button key={label as string} onClick={() => { setName(label as string); setType(label === 'Risk review' ? 'Risk & compliance' : label === 'Merchant health' ? 'Merchant health' : 'Executive summary'); setOpen(true); }} className="panel group p-5 text-left" data-testid={`button-template-${(label as string).toLowerCase().replaceAll(' ', '-')}`}><div className="mb-8 flex items-start justify-between"><div className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: `${color}20`, color: color as string }}><IconComponent size={17}/></div><Plus size={15} className="text-[#526e83] group-hover:text-[#8b5cf6]"/></div><div className="font-semibold text-[#e3f1f4]">{label as string}</div><p className="mt-1 text-[11px] leading-5 text-[#7892a5]">{description as string}</p></button>)}</div>
    <div className="mt-8"><div className="mb-4 flex items-center justify-between"><div><div className="kicker mb-1">Saved reports</div><div className="text-sm font-semibold text-[#e0eef1]">Your report library</div></div><button onClick={() => toast.success('Report library is synced')} className="text-[11px] text-[#8b5cf6]" data-testid="button-refresh-reports"><RefreshCw size={12} className="mr-1 inline"/> Sync</button></div><div className="panel divide-y divide-[#1a3346]">{reports.map((report) => <div key={report.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#173244] text-[#7fcbd3]"><FileBarChart2 size={16}/></div><div className="min-w-0 flex-1"><div className="font-medium text-[#e2e8f0]">{report.name}</div><div className="mt-1 text-[11px] text-[#758ea1]">{report.type} <span className="mx-1">閳ワ拷</span>{report.date}</div></div><Status>{report.status}</Status><button onClick={() => exportReport(report.name)} className="btn-quiet flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[11px]" data-testid={`button-export-report-${report.id}`}><Download size={13}/> Export</button><button onClick={() => toast.success(`Opened ${report.name}`)} className="btn-quiet rounded-md px-3 py-2 text-[11px]" data-testid={`button-open-report-${report.id}`}>Open</button><button onClick={() => { deleteReport(report.id); toast.success('Report deleted'); }} className="rounded-md p-2 text-[#6e879a] hover:bg-[#193346] hover:text-[#ff897a]" data-testid={`button-delete-report-${report.id}`}><X size={14}/></button></div>)}</div></div>
    {open && <Modal title="Create report" onClose={() => setOpen(false)}><div className="space-y-4"><label className="block"><span className="kicker mb-2 block">Report name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="input-dark h-10 w-full rounded-lg px-3 text-sm" placeholder="October operating review" data-testid="input-report-name"/></label><label className="block"><span className="kicker mb-2 block">Report type</span><select value={type} onChange={(event) => setType(event.target.value)} className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="select-report-type"><option>Executive summary</option><option>Risk & compliance</option><option>Merchant health</option><option>Finance close</option></select></label><button onClick={() => { if (!name.trim()) { toast.error('Add a report name'); return; } addReport({ name: name.trim(), type }); setOpen(false); setName(''); toast.success('Report generated from live data'); }} className="btn-primary w-full rounded-lg py-2.5 text-xs" data-testid="button-generate-report">Generate report</button></div></Modal>}
  </div>;
}

function AnalyticsV2() {
  const { transactions, customers, merchants } = usePlatform();
  const [metric, setMetric] = useState<'volume' | 'success' | 'customers' | 'growth'>('volume');
  const [period, setPeriod] = useState('30D');
  const values = metric === 'volume' ? [34, 42, 38, 54, 51, 67, 62, 74, 68, 82, 79, 91] : metric === 'success' ? [76, 79, 78, 83, 82, 86, 85, 89, 91, 90, 94, 97] : metric === 'customers' ? [42, 44, 47, 49, 54, 57, 61, 64, 69, 72, 76, 82] : merchants.map((merchant) => Math.min(99, Math.max(20, merchant.growth + 60)));
  const total = metric === 'volume' ? `$${transactions.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}` : metric === 'success' ? `${Math.round(transactions.filter((item) => item.status === 'Captured').length / Math.max(transactions.length, 1) * 100)}%` : metric === 'customers' ? String(customers.length) : `${(merchants.reduce((sum, item) => sum + item.growth, 0) / Math.max(merchants.length, 1)).toFixed(1)}%`;
  return <div className="mx-auto max-w-[1300px]"><SectionHeader eyebrow="Intelligence / analytics" title="See the signal in the noise." description="Interactive trends connected to the live transaction, customer, and merchant records." action={<div className="flex gap-2">{['7D', '30D', '90D'].map((item) => <button key={item} onClick={() => setPeriod(item)} className={`rounded-lg border px-3 py-2 text-[11px] ${period === item ? 'border-[#428fa1] bg-[#153743] text-[#68dce8]' : 'border-[#30235d] text-[#7892a5]'}`} data-testid={`button-analytics-${item}`}>{item}</button>)}</div>}/><div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]"><div className="panel p-5 md:p-6"><div className="mb-7 flex flex-wrap items-center justify-between gap-3"><div><div className="kicker mb-1">Trend explorer / {period}</div><div className="text-sm font-semibold text-[#deedf1]">{metric === 'volume' ? 'Payment volume' : metric === 'success' ? 'Authorization success' : metric === 'customers' ? 'Active customers' : 'Merchant growth'}</div></div><select value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)} className="input-dark rounded-lg px-3 py-2 text-[11px]" data-testid="select-analytics-metric"><option value="volume">Payment volume</option><option value="success">Authorization rate</option><option value="customers">Customer growth</option><option value="growth">Merchant growth</option></select></div><div className="relative h-[260px]"><div className="absolute inset-0 flex flex-col justify-between text-[10px] text-[#536d81]">{['100', '75', '50', '25', '0'].map((item) => <span key={item}>{metric === 'volume' ? `$${item}K` : item}</span>)}</div><div className="ml-10 h-full"><div className="flex h-full flex-col justify-between">{[0, 1, 2, 3, 4].map((item) => <div key={item} className="border-t border-dashed border-[#21394d]"/>)}</div><div className="absolute bottom-5 left-10 right-0 top-0"><Sparkline values={values} color="#8b5cf6" fill/><div className="absolute bottom-[-22px] left-0 right-0 flex justify-between text-[10px] text-[#536d81]">{['Sep 10', 'Sep 15', 'Sep 20', 'Sep 25', 'Sep 30', 'Oct 05', 'Today'].map((item) => <span key={item}>{item}</span>)}</div></div></div></div><div className="mt-8 flex items-center justify-between border-t border-[#1b3448] pt-4 text-[11px]"><span className="text-[#7891a3]">Period total</span><span className="mono text-[#dcecf0]">{total}</span></div></div><div className="panel p-5"><div className="kicker mb-1">Breakdown</div><div className="mb-5 text-sm font-semibold text-[#deedf1]">Portfolio distribution</div>{[['North America', 48, '#8b5cf6'], ['Europe', 27, '#ce9eff'], ['APAC', 16, '#f6c76d'], ['LATAM', 9, '#34d399']].map(([label, width, color]) => <div key={label as string} className="mb-4"><div className="mb-1 flex justify-between text-[11px]"><span className="text-[#a2b6c1]">{label as string}</span><span className="text-[#d4e6eb]">{width}%</span></div><div className="h-2 rounded-full bg-[#142c3d]"><div className="h-full rounded-full" style={{ width: `${width}%`, background: color as string }}/></div></div>)}<div className="signal-line my-6"/><div className="flex items-center gap-3 rounded-lg bg-[#10283a] p-3"><TrendingUp size={17} className="text-[#34d399]"/><div><div className="text-[11px] font-semibold text-[#cfe3e8]">Strongest signal</div><div className="mt-1 text-[10px] text-[#7c96a7]">EU card volume is up 22% week over week.</div></div></div></div></div><div className="mt-5 grid gap-4 md:grid-cols-3">{[['Checkout conversion', '74.8%', '+4.2%', Target], ['Avg. ticket', '$184.62', '+8.9%', CreditCard], ['Settlement speed', '1.8 days', '-0.4d', Clock3]].map(([label, value, delta, IconComponent]) => <div className="panel p-5" key={label as string}><div className="flex items-center justify-between"><div className="kicker">{label as string}</div><IconComponent size={16} className="text-[#668ba0]"/></div><div className="mt-3 display-font text-2xl font-semibold text-[#e3f0f3]">{value as string}</div><div className="mt-1 text-[11px] text-[#34d399]">{delta as string} <span className="text-[#6e879c]">vs last period</span></div><div className="mt-4"><TinyBars color="#34d399"/></div></div>)}</div></div>;
}

function ProfilePage() {
  const { user, updateUser } = usePlatform();
  const [draft, setDraft] = useState(user);
  return <div className="mx-auto max-w-[900px]"><SectionHeader eyebrow="Workspace / identity" title="Your profile." description="Manage the identity and operating context shown to your FinOS team."/><div className="grid gap-5 md:grid-cols-[220px_1fr]"><div className="panel flex flex-col items-center p-6 text-center"><div className="grid h-20 w-20 place-items-center rounded-3xl bg-[#cb9eeb] text-xl font-bold text-[#182033]">{user.initials}</div><div className="mt-4 text-lg font-semibold text-[#e6f2f4]">{user.name}</div><div className="mt-1 text-[11px] text-[#7e96a8]">{user.role}</div><Link href="/settings" className="btn-quiet mt-6 rounded-lg px-3 py-2 text-[11px]">Workspace settings</Link></div><div className="panel p-5 md:p-6"><div className="space-y-4"><label className="block"><span className="kicker mb-2 block">Full name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, initials: event.target.value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="input-profile-name"/></label><label className="block"><span className="kicker mb-2 block">Work email</span><input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} type="email" className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="input-profile-email"/></label><label className="block"><span className="kicker mb-2 block">Title</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="input-profile-title"/></label><label className="block"><span className="kicker mb-2 block">Timezone</span><select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} className="input-dark h-10 w-full rounded-lg px-3 text-sm" data-testid="select-profile-timezone"><option>Pacific Time (US & Canada)</option><option>Eastern Time (US & Canada)</option><option>London</option><option>Central European Time</option></select></label><button onClick={() => { updateUser(draft); toast.success('Profile updated'); }} className="btn-primary rounded-lg px-4 py-2.5 text-xs" data-testid="button-save-profile">Save profile</button></div></div></div></div>;
}

function NotificationsPage() {
  const { notifications, unreadNotifications, markNotificationRead, markAllNotificationsRead } = usePlatform();
  return <div className="mx-auto max-w-[900px]"><SectionHeader eyebrow={`Workspace / ${unreadNotifications} unread`} title="Notifications center." description="Review signals, operational updates, and recommendations from your FinOS team." action={<button onClick={markAllNotificationsRead} className="btn-quiet flex items-center gap-2 rounded-lg px-3 py-2 text-xs" data-testid="button-mark-all-read"><CheckCheck size={14}/> Mark all read</button>}/><div className="panel divide-y divide-[#1a3346]">{notifications.map((item) => <button key={item.id} onClick={() => markNotificationRead(item.id)} className={`flex w-full gap-4 p-5 text-left hover:bg-[#10283a] ${item.read ? 'opacity-70' : ''}`} data-testid={`notification-${item.id}`}><div className={`mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.kind === 'signal' ? 'bg-[#3c2028] text-[#ff897a]' : item.kind === 'success' ? 'bg-[#0d3b2c] text-[#6fe0bd]' : 'bg-[#173746] text-[#8b5cf6]'}`}>{item.kind === 'signal' ? <CircleAlert size={15}/> : item.kind === 'success' ? <Check size={15}/> : <Bell size={15}/>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-[#e2e8f0]">{item.title}</span><span className="text-[10px] text-[#70899d]">{item.time}</span></div><p className="mt-1 text-[12px] leading-5 text-[#8098a8]">{item.detail}</p></div>{!item.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#8b5cf6]"/>}</button>)}</div></div>;
}

function AssistantPage() {
  const { tenant, user, transactions, customers, merchants, reports } = usePlatform();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([{ role: 'assistant', text: 'I閳ユ獡 FinOS AI. Ask me about payments, customer health, merchant performance, or your latest reports.' }]);
  const answer = (question: string) => {
    const normalized = question.toLowerCase();
    if (normalized.includes('transaction') || normalized.includes('payment')) return `There are ${transactions.length} payment records in this workspace. ${transactions.filter((item) => item.status === 'Review').length} currently need review, with ${transactions.filter((item) => item.status === 'Captured').length} captured successfully.`;
    if (normalized.includes('customer')) return `Customer health is currently ${Math.round(customers.filter((item) => item.health === 'Healthy').length / Math.max(customers.length, 1) * 100)}% healthy. ${customers.filter((item) => item.health === 'At risk').length} account(s) are at risk.`;
    if (normalized.includes('merchant')) return `${merchants.length} merchants are connected. The strongest growth signal is ${merchants.sort((a, b) => b.growth - a.growth)[0]?.name || 'not available'} at ${merchants.sort((a, b) => b.growth - a.growth)[0]?.growth || 0}%.`;
    if (normalized.includes('report')) return `You have ${reports.length} saved reports. The latest is 閳ワ拷${reports[0]?.name || 'not available'}閳ワ拷.`;
    return 'I can summarize transactions, customer health, merchant growth, or your saved reports. Try asking 閳ユ凡hat needs review?閳ワ拷 or 閳ユ窏ow are merchants doing?閳ワ拷';
  };
  const send = () => {
    if (!message.trim()) return;
    const question = message.trim();
    setMessages((current) => [...current, { role: 'user', text: question }, { role: 'assistant', text: answer(question) }]);
    reportWorkspaceActivity(tenant.id, user.email, {
      event_type: 'ai_employee_usage',
      metadata: { surface: 'workspace_assistant', questionLength: question.length },
      usage_metric_type: 'ai_requests',
      usage_value: 1,
    });
    setMessage('');
  };
  return <div className="mx-auto max-w-[1000px]"><SectionHeader eyebrow="Command center / AI" title="Ask FinOS anything." description="A workspace-aware assistant for fast operational answers, grounded in the mock financial data already in your workspace."/><div className="panel overflow-hidden"><div className="flex min-h-[420px] flex-col space-y-4 p-5 md:p-7">{messages.map((item, index) => <div key={index} className={`max-w-[80%] rounded-xl p-4 text-[13px] leading-6 ${item.role === 'user' ? 'ml-auto bg-[#183947] text-[#c8e1e6]' : 'bg-[#10283a] text-[#a9c0cb]'}`}><div className="kicker mb-1">{item.role === 'user' ? 'You' : 'FinOS AI'}</div>{item.text}</div>)}<div className="mt-auto flex flex-wrap gap-2 pt-4">{['What needs review?', 'How are customers doing?', 'Show merchant growth'].map((prompt) => <button key={prompt} onClick={() => { setMessage(prompt); }} className="btn-quiet rounded-lg px-3 py-2 text-[11px]" data-testid={`button-prompt-${prompt.toLowerCase().replaceAll(' ', '-')}`}>{prompt}</button>)}</div></div><div className="flex gap-2 border-t border-[#1b3448] p-4"><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} className="input-dark h-10 min-w-0 flex-1 rounded-lg px-3 text-sm" placeholder="Ask about your operation..." data-testid="input-assistant-message"/><button onClick={send} className="btn-primary grid h-10 w-10 place-items-center rounded-lg" data-testid="button-send-assistant"><Send size={15}/></button></div></div></div>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [accountType, setAccountType] = useState<'company' | 'individual'>('company');
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [subscription, setSubscription] = useState<'basic' | 'premium'>('basic');
  const [fullName, setFullName] = useState('');
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [error, setError] = useState('');

  const finishLogin = (account: StoredAuthAccount) => {
    const tenant = accountTenant(account);
    localStorage.setItem('finos-active-tenant', JSON.stringify(tenant));
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, JSON.stringify(account));
    const initials = account.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    localStorage.setItem(`finos:${tenant.id}:user`, JSON.stringify({
      name: account.name,
      email: account.email,
      role: account.role,
      initials,
      title: account.role,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
    localStorage.setItem('finos-auth', '1');
    localStorage.setItem('finos-auth-at', String(Date.now()));
    onLogin();
  };

  const enter = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error('Enter a valid email address');
      return;
    }
    if (!password) {
      toast.error('Enter your password');
      return;
    }
    setLoading(true);
    try {
      const passwordHash = await hashPassword(password);
      const account = getStoredAccounts().find((candidate) => normalizeEmail(candidate.email) === normalizedEmail && candidate.passwordHash === passwordHash);
      if (!account) {
        setError('Email or password is incorrect. Use an account created from this registration flow.');
        return;
      }
      finishLogin(account);
      if (!isPlatformOwner(account.email)) {
        reportWorkspaceActivity(account.tenantId, account.email, { event_type: 'login', metadata: { method: 'email_password', accountType: account.accountType } });
      }
      toast.success(`Welcome to ${account.name}`);
    } catch {
      setError('Unable to verify the account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const beginOnboarding = (type: 'company' | 'individual') => {
    setError('');
    setAccountType(type);
    setOnboarding(true);
    setStep(1);
    setPassword('');
    setIdDocument(null);
  };

  const nextOnboardingStep = () => {
    setError('');
    if (step === 1 && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email)) || password.length < 8 || !fullName.trim())) {
      setError('Enter your name, a valid email, and a password of at least 8 characters.');
      return;
    }
    if (step === 2 && (accountType === 'company' ? (!companyName.trim() || !industry || !companySize || !subscription) : !idDocument)) {
      setError(accountType === 'company' ? 'Complete the company profile and choose a subscription.' : 'Attach an ID document before continuing.');
      return;
    }
    setStep((current) => current + 1);
  };

  const createAccount = async () => {
    setError('');
    if (!idDocument) {
      setError('An ID/document attachment is required for every new account.');
      return;
    }
    setLoading(true);
    try {
      const normalizedEmail = normalizeEmail(email);
      const passwordHash = await hashPassword(password);
      const existing = getStoredAccounts();
      if (existing.some((candidate) => normalizeEmail(candidate.email) === normalizedEmail)) {
        setError('An account with this email already exists.');
        return;
      }

      let tenantId = `local-${accountType}-${Date.now()}`;
      let tenantName = accountType === 'company' ? companyName.trim() : `${fullName.trim()} workspace`;
      let role = accountType === 'company' ? 'Workspace admin' : 'Individual merchant';

      if (accountType === 'company') {
        try {
          const result = await createCompanyOnboarding({
            name: companyName.trim(),
            email: normalizedEmail,
            industry,
            company_size: companySize,
          });
          tenantId = result.organization.id;
          tenantName = result.organization.name;
          role = result.user.role;
        } catch {
          // The UI still creates a local account if the optional onboarding API is unavailable.
        }
      }

      const account: StoredAuthAccount = {
        email: normalizedEmail,
        passwordHash,
        name: fullName.trim(),
        role,
        accountType,
        subscription: accountType === 'company' ? subscription : 'basic',
        tenantId,
        tenantName,
        idDocument: { name: idDocument.name, type: idDocument.type, size: idDocument.size },
        createdAt: new Date().toISOString(),
      };
      saveStoredAccounts([...existing, account]);
      finishLogin(account);
      toast.success(`${accountType === 'company' ? 'Company' : 'Individual'} account created`);
    } catch {
      setError('Account creation failed. Check the fields and try again.');
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = 'input-dark h-11 w-full rounded-lg px-3 text-sm';
  const onboardingPanel = (
    <>
      <div className="mb-7 flex items-center justify-between">
        <div><div className="kicker mb-2">Public account registration</div><h2 className="display-font text-[30px] font-semibold tracking-[-.04em] text-[#ebf5f7]">{accountType === 'company' ? 'Create a company account.' : 'Create an individual account.'}</h2></div>
        <button onClick={() => { setOnboarding(false); setStep(1); setError(''); }} className="btn-quiet rounded-lg px-3 py-2 text-[11px]" data-testid="button-back-to-login">Back</button>
      </div>
      <div className="mb-7 grid grid-cols-3 gap-2">
        {['Identity & password', accountType === 'company' ? 'Company & subscription' : 'ID verification', 'Review'].map((label, index) => <div key={label} className={`border-t-2 pt-2 text-[10px] ${step >= index + 1 ? 'border-[#8b5cf6] text-[#c8e4e9]' : 'border-[#214057] text-[#607b90]'}`}>{index + 1}. {label}</div>)}
      </div>
      {step === 1 && <div className="space-y-4">
        <label className="block"><span className="kicker mb-2 block">Full name</span><input autoFocus value={fullName} onChange={(event) => setFullName(event.target.value)} className={fieldClass} placeholder="Your full name" data-testid="input-signup-name"/></label>
        <label className="block"><span className="kicker mb-2 block">Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className={fieldClass} placeholder="you@company.com" data-testid="input-signup-email"/></label>
        <label className="block"><span className="kicker mb-2 block">Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className={fieldClass} placeholder="At least 8 characters" data-testid="input-signup-password"/></label>
        <div className="grid gap-2 sm:grid-cols-2"><button onClick={() => setAccountType('company')} className={`rounded-lg border px-3 py-3 text-left text-[11px] ${accountType === 'company' ? 'border-[#8b5cf6] bg-[#21183f] text-white' : 'border-[#24465c] text-[#7892a5]'}`}><b>Company</b><span className="mt-1 block">Subscription workspace</span></button><button onClick={() => setAccountType('individual')} className={`rounded-lg border px-3 py-3 text-left text-[11px] ${accountType === 'individual' ? 'border-[#8b5cf6] bg-[#21183f] text-white' : 'border-[#24465c] text-[#7892a5]'}`}><b>Individual</b><span className="mt-1 block">Merchant / small business</span></button></div>
      </div>}
      {step === 2 && accountType === 'company' && <div className="space-y-4">
        <label><span className="kicker mb-2 block">Company name</span><input autoFocus value={companyName} onChange={(event) => setCompanyName(event.target.value)} className={fieldClass} placeholder="Company name" data-testid="input-onboarding-company-name"/></label>
        <label><span className="kicker mb-2 block">Industry</span><select value={industry} onChange={(event) => setIndustry(event.target.value)} className={fieldClass} data-testid="select-onboarding-industry"><option value="">Select an industry</option><option>Financial services</option><option>Payments</option><option>Commerce</option><option>Technology</option><option>Professional services</option><option>Other</option></select></label>
        <label><span className="kicker mb-2 block">Company size</span><select value={companySize} onChange={(event) => setCompanySize(event.target.value)} className={fieldClass} data-testid="select-onboarding-company-size"><option value="">Select company size</option><option>1鈥�10</option><option>11鈥�50</option><option>51鈥�200</option><option>201鈥�500</option><option>501鈥�1,000</option><option>1,000+</option></select></label>
        <label><span className="kicker mb-2 block">Subscription</span><select value={subscription} onChange={(event) => setSubscription(event.target.value as 'basic' | 'premium')} className={fieldClass} data-testid="select-onboarding-subscription"><option value="basic">Basic subscription</option><option value="premium">Premium subscription</option></select></label>
        <label><span className="kicker mb-2 block">ID / company document <span className="normal-case tracking-normal text-[#536f84]">(required)</span></span><input type="file" accept="image/*,.pdf" onChange={(event) => setIdDocument(event.target.files?.[0] || null)} className="input-dark block w-full rounded-lg px-3 py-2 text-xs" data-testid="input-onboarding-id-document"/>{idDocument && <span className="mt-2 block text-[10px] text-[#6fe0bd]">{idDocument.name}</span>}</label>
      </div>}
      {step === 2 && accountType === 'individual' && <div className="space-y-4">
        <div className="rounded-xl border border-[#3a2a6a] bg-[#0c2130] p-4 text-[11px] leading-5 text-[#8aa1b0]">Individual merchant accounts are for people with small jobs/businesses. A subscription is required before the workspace becomes active.</div>
        <label><span className="kicker mb-2 block">Subscription</span><select value={subscription} onChange={(event) => setSubscription(event.target.value as 'basic' | 'premium')} className={fieldClass}><option value="basic">Basic subscription</option><option value="premium">Premium subscription</option></select></label>
        <label><span className="kicker mb-2 block">ID card / identity document <span className="normal-case tracking-normal text-[#536f84]">(required)</span></span><input type="file" accept="image/*,.pdf" onChange={(event) => setIdDocument(event.target.files?.[0] || null)} className="input-dark block w-full rounded-lg px-3 py-2 text-xs" data-testid="input-individual-id-document"/>{idDocument && <span className="mt-2 block text-[10px] text-[#6fe0bd]">{idDocument.name} 鈥� ready to attach</span>}</label>
      </div>}
      {step === 3 && <div className="rounded-xl border border-[#3a2a6a] bg-[#0c2130] p-4"><div className="kicker mb-3">Account review</div><div className="space-y-3 text-[12px]"><div className="flex justify-between gap-4"><span className="text-[#7892a5]">Name</span><span className="text-right text-[#e2e8f0]">{fullName}</span></div><div className="flex justify-between gap-4"><span className="text-[#7892a5]">Email</span><span className="text-right text-[#e2e8f0]">{email}</span></div><div className="flex justify-between gap-4"><span className="text-[#7892a5]">Account</span><span className="text-right text-[#e2e8f0]">{accountType}</span></div>{accountType === 'company' && <div className="flex justify-between gap-4"><span className="text-[#7892a5]">Company</span><span className="text-right text-[#e2e8f0]">{companyName}</span></div>}<div className="flex justify-between gap-4"><span className="text-[#7892a5]">Subscription</span><span className="text-right capitalize text-[#e2e8f0]">{subscription}</span></div><div className="flex justify-between gap-4"><span className="text-[#7892a5]">ID/document</span><span className="text-right text-[#6fe0bd]">{idDocument?.name || 'Missing'}</span></div><div className="mt-4 border-t border-[#214057] pt-3 text-[11px] leading-5 text-[#8aa1b0]">Password is stored only as a SHA-256 verifier in this frontend demo. Production authentication and document storage must be handled by the server.</div></div></div>}
      {error && <div className="mt-4 rounded-lg border border-[#6d3840] bg-[#3b2028] px-3 py-2 text-[11px] leading-5 text-[#ffb4aa]" role="alert">{error}</div>}
      <button onClick={step === 3 ? createAccount : nextOnboardingStep} disabled={loading} className="btn-primary mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm">{loading ? <RefreshCw size={15} className="animate-spin"/> : step === 3 ? <UserPlus size={15}/> : <ArrowUpRight size={15}/>} {loading ? 'Creating account...' : step === 3 ? 'Create account' : 'Continue'}</button>
      {step > 1 && <button onClick={() => { setStep((current) => current - 1); setError(''); }} className="btn-quiet mt-2 h-10 w-full rounded-lg text-[11px]">Previous step</button>}
    </>
  );

  return (
    <div className="noise flex min-h-[100dvh] bg-[#07111f]">
      <div className="relative hidden w-[48%] overflow-hidden border-r border-[#193149] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(56,168,187,.23),transparent_30%),radial-gradient(circle_at_80%_80%,rgba(103,71,160,.19),transparent_35%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div className="max-w-[420px]">
            <div className="mb-7 flex items-center gap-2 text-[11px] uppercase tracking-[.16em] text-[#8b5cf6]"><span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" /> Payment operations, with perspective</div>
            <h1 className="display-font text-[54px] font-semibold leading-[1.03] tracking-[-.06em] text-[#f8fafc]">The calm<br/><span className="text-[#8b5cf6]">behind</span> every<br/>transaction.</h1>
            <p className="mt-7 max-w-[360px] text-[14px] leading-6 text-[#8299ad]">FinOS gives your finance, risk, and merchant teams a shared view of money in motion 鈥� with an AI team that knows what to do next.</p>
          </div>
          <div className="flex items-center gap-6 text-[11px] text-[#637d92]"><span className="flex items-center gap-2"><ShieldCheck size={14} className="text-[#34d399]" />Secure access</span><span className="flex items-center gap-2"><Globe2 size={14} className="text-[#8b5cf6]" />Built for global commerce</span></div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[390px]">
          <div className="mb-10 lg:hidden"><Logo /></div>
          {onboarding ? onboardingPanel : (
            <>
              <div className="kicker mb-3">Welcome back</div>
              <h2 className="display-font text-[30px] font-semibold tracking-[-.04em] text-[#ebf5f7]">Sign in to your workspace.</h2>
              <p className="mt-2 text-[13px] text-[#8299ad]">Email and password are required. Demo access has been removed.</p>
              <div className="mt-8 space-y-4">
                <label className="block"><span className="kicker mb-2 block">Email</span><input autoFocus value={email} onChange={event => setEmail(event.target.value)} type="email" placeholder="you@company.com" className={fieldClass} data-testid="input-login-email"/></label>
                <label className="block"><span className="kicker mb-2 block">Password</span><input value={password} onChange={event => setPassword(event.target.value)} type="password" placeholder="Your password" className={fieldClass} onKeyDown={(event) => event.key === 'Enter' && void enter()} data-testid="input-login-password"/></label>
                <button onClick={() => void enter()} disabled={loading} className="btn-primary flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm" data-testid="button-login">{loading ? <RefreshCw size={15} className="animate-spin"/> : <ArrowUpRight size={15}/>} {loading ? 'Signing in...' : 'Sign in'}</button>
                <button onClick={() => beginOnboarding('company')} className="btn-quiet mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm" data-testid="button-create-company"><Building2 size={15}/> Create company account</button>
                <button onClick={() => beginOnboarding('individual')} className="btn-quiet flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm" data-testid="button-create-individual"><UserPlus size={15}/> Create individual / merchant account</button>
                {error && <div className="rounded-lg border border-[#6d3840] bg-[#3b2028] px-3 py-2 text-[11px] leading-5 text-[#ffb4aa]" role="alert">{error}</div>}
                <p className="mt-6 text-center text-[10px] leading-5 text-[#637e93]">No demo bypass. Every workspace requires a registered email and password.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

}

function EmptyState({title,description,compact=false}:{title:string;description:string;compact?:boolean}) { return <div className={`flex flex-col items-center justify-center text-center ${compact?'py-10':'py-20'}`}><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[#163347] text-[#8b5cf6]"><Search size={18}/></div><div className="text-sm font-semibold text-[#cfe0e7]">{title}</div><div className="mt-1 text-[11px] text-[#71899d]">{description}</div></div>; }

const KNOWLEDGE_FILE_ACCEPT = '.pdf,.docx,.xls,.xlsx,.csv,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain';

function knowledgeMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split('.').pop();
  const mimeByExtension: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
  };
  return mimeByExtension[extension || ''] || 'application/octet-stream';
}

function formatKnowledgeFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function knowledgeErrorMessage(error: unknown): string {
  const candidate = error as { data?: { error?: string }; message?: string };
  return candidate.data?.error || candidate.message || 'Something went wrong. Please try again.';
}

function CompanyKnowledgePage() {
  const { tenant, user } = usePlatform();
  const { employees: roster } = useEmployees();
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const workspaceHeaders = useMemo(() => ({
    'x-finos-organization-id': tenant.id,
    'x-finos-user-email': user.email,
  }), [tenant.id, user.email]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      setError('');
      const result = await listKnowledgeFiles({ headers: workspaceHeaders });
      setFiles(result);
    } catch (requestError) {
      setError(knowledgeErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFiles();
  }, [tenant.id, user.email]);

  const uploadFile = async (file: File) => {
    const mimeType = knowledgeMimeType(file);
    setUploading(true);
    setError('');
    try {
      const upload = await requestKnowledgeFileUploadUrl({
        original_file_name: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
        employee_key: selectedEmployee || null,
      }, { headers: workspaceHeaders });
      const storageResponse = await fetch(upload.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: file,
      });
      if (!storageResponse.ok) {
        throw new Error(`Private storage rejected the upload (${storageResponse.status}).`);
      }
      await finalizeKnowledgeFile({
        original_file_name: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
        storage_key: upload.storage_key,
        employee_key: selectedEmployee || null,
      }, { headers: workspaceHeaders });
      setSelectedEmployee('');
      toast.success(`${file.name} added to company knowledge`);
      await loadFiles();
    } catch (requestError) {
      const message = knowledgeErrorMessage(requestError);
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = async (file: KnowledgeFile) => {
    if (!window.confirm(`Delete ${file.original_file_name} from company knowledge?`)) return;
    setDeletingId(file.id);
    try {
      await deleteKnowledgeFile(file.id, { headers: workspaceHeaders });
      setFiles((current) => current.filter((candidate) => candidate.id !== file.id));
      toast.success(`${file.original_file_name} deleted`);
    } catch (requestError) {
      const message = knowledgeErrorMessage(requestError);
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const downloadFile = async (file: KnowledgeFile) => {
    try {
      const result = await getKnowledgeFileDownloadUrl(file.id, { headers: workspaceHeaders });
      window.open(result.download_url, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      const message = knowledgeErrorMessage(requestError);
      setError(message);
      toast.error(message);
    }
  };

  return <div className="mx-auto max-w-[1180px]">
    <SectionHeader
      eyebrow={`Intelligence / ${tenant.name}`}
      title="Company knowledge."
      description="Keep the source material behind your AI workforce in one secure, company-owned workspace."
      action={<label className={`btn-primary flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs ${uploading ? 'pointer-events-none opacity-60' : ''}`} data-testid="button-upload-knowledge">
        {uploading ? <RefreshCw size={14} className="animate-spin"/> : <FileUp size={14}/>}
        {uploading ? 'Uploading...' : 'Upload file'}
        <input
          type="file"
          className="hidden"
          accept={KNOWLEDGE_FILE_ACCEPT}
          disabled={uploading}
          data-testid="input-knowledge-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            if (file) void uploadFile(file);
          }}
        />
      </label>}
    />
    <div className="mb-6 grid gap-4 md:grid-cols-3">
      <MetricCard label="Company files" value={loading ? '閳ワ拷' : String(files.length)} delta="organization-scoped" icon={FileText} />
      <MetricCard label="Storage status" value="Private" delta="signed access only" icon={ShieldCheck} color="#34d399" />
      <MetricCard label="Accepted formats" value="06" delta="PDF 璺� DOCX 璺� Excel 璺� CSV 璺� TXT" icon={Database} color="#cb9eeb" />
    </div>
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-[#3a2a6a] bg-[#0c2130] p-4 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[#e2e8f0]">Link new files to an AI employee</div>
        <div className="mt-1 text-[11px] leading-5 text-[#7892a5]">Optional. The selected employee will see this association when knowledge access is introduced.</div>
      </div>
      <select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} className="input-dark h-10 w-full rounded-lg px-3 text-sm md:w-[260px]" data-testid="select-knowledge-employee">
        <option value="">No employee association</option>
        {roster.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} 璺� {employee.role}</option>)}
      </select>
    </div>
    {error && <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#6d3840] bg-[#3b2028] px-4 py-3 text-[11px] leading-5 text-[#ffb4aa]" role="alert"><CircleAlert size={15} className="mt-0.5 shrink-0"/><span>{error}</span></div>}
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#1b3448] px-5 py-4 md:px-6">
        <div><div className="text-sm font-semibold text-[#e2e8f0]">Uploaded files</div><div className="mt-1 text-[11px] text-[#71899d]">Only files belonging to {tenant.name} are shown.</div></div>
        <button onClick={() => void loadFiles()} disabled={loading} className="btn-quiet flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]" data-testid="button-refresh-knowledge"><RefreshCw size={13} className={loading ? 'animate-spin' : ''}/> Refresh</button>
      </div>
      {loading ? <div className="px-6 py-14 text-center text-sm text-[#71899d]">Loading company knowledge...</div> : files.length === 0 ? <EmptyState title="No company files yet" description="Upload a PDF, DOCX, spreadsheet, CSV, or text file to start your company knowledge library." compact/> : <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead><tr className="border-b border-[#1b3448] text-[10px] uppercase tracking-[.14em] text-[#668197]"><th className="px-6 py-3 font-medium">File</th><th className="px-4 py-3 font-medium">Uploader</th><th className="px-4 py-3 font-medium">Linked AI employee</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Status</th><th className="px-6 py-3 text-right font-medium">Actions</th></tr></thead>
          <tbody>{files.map((file) => <tr key={file.id} className="border-b border-[#162d40] last:border-0">
            <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#173b48] text-[#8b5cf6]"><FileText size={16}/></div><div className="min-w-0"><div className="truncate text-[12px] font-semibold text-[#e2e8f0]">{file.original_file_name}</div><div className="mt-1 text-[10px] uppercase tracking-[.12em] text-[#6c879b]">{file.file_type} 璺� {formatKnowledgeFileSize(file.size_bytes)}</div></div></div></td>
            <td className="px-4 py-4 text-[12px] text-[#b4c8d2]">{file.uploader_name}</td>
            <td className="px-4 py-4 text-[12px] text-[#b4c8d2]">{file.employee_name || <span className="text-[#607b90]">Workspace-wide</span>}</td>
            <td className="px-4 py-4 text-[11px] text-[#8ca4b5]">{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(file.created_at))}</td>
            <td className="px-4 py-4"><Status>{file.status}</Status></td>
            <td className="px-6 py-4"><div className="flex justify-end gap-1"><button onClick={() => void downloadFile(file)} className="rounded-lg p-2 text-[#8ba1b4] hover:bg-[#26194d] hover:text-[#8b5cf6]" title="Download file" data-testid={`button-download-knowledge-${file.id}`}><Download size={15}/></button><button onClick={() => void removeFile(file)} disabled={deletingId === file.id} className="rounded-lg p-2 text-[#8ba1b4] hover:bg-[#3b2028] hover:text-[#ff9b90]" title="Delete file" data-testid={`button-delete-knowledge-${file.id}`}>{deletingId === file.id ? <RefreshCw size={15} className="animate-spin"/> : <Trash2 size={15}/>}</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
  </div>;
}

function formatPlatformCurrency(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPlatformBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function PlatformAdminPage() {
  const { user } = usePlatform();
  const adminEmail = user.email.trim().toLowerCase();
  const analyticsQuery = useGetPlatformAnalytics({
    request: {
      headers: { 'x-finos-platform-admin-email': adminEmail },
    },
  });
  const analytics = analyticsQuery.data;
  const errorData = analyticsQuery.error as { data?: { error?: string }; message?: string } | null;
  const errorMessage = errorData?.data?.error || errorData?.message || 'Platform analytics are unavailable.';

  if (analyticsQuery.isLoading) {
    return <div className="mx-auto max-w-[1450px]"><SectionHeader eyebrow="Platform owner" title="Loading platform analytics." description="Checking the platform owner scope and preparing the company portfolio."/><div className="panel flex min-h-[320px] items-center justify-center text-sm text-[#7892a5]"><RefreshCw size={16} className="mr-2 animate-spin text-[#8b5cf6]"/> Loading aggregate metrics...</div></div>;
  }

  const fallbackCompanies = [{
    id: 'current-workspace',
    name: 'Current workspace',
    registration_date: new Date().toISOString(),
    subscription_plan: 'premium',
    subscription_status: 'active',
    monthly_price_cents: 0,
    user_count: 1,
    ai_employee_count: 0,
    knowledge_file_count: 0,
    storage_bytes: 0,
    last_activity: new Date().toISOString(),
    status: 'active',
  }];
  const fallbackSummary = {
    total_companies: 1,
    subscribed_companies: 1,
    monthly_expected_revenue_cents: 0,
    basic_subscriptions: 0,
    premium_subscriptions: 1,
    active_users: 1,
    total_storage_bytes: 0,
    total_knowledge_files: 0,
    total_ai_conversations: 0,
    total_ai_requests: 0,
    total_responses: 0,
    companies_registered_last_30_days: 1,
    total_employees: 0,
  };
  const summary = analytics?.summary || fallbackSummary;
  const companies = analytics?.companies || fallbackCompanies;
  const recentActivity = analytics?.recent_activity || [];
  const analyticsUnavailable = Boolean(analyticsQuery.isError || !analytics);
  const activeCompanies = companies.filter((company) => company.status.toLowerCase() === 'active').length;
  const activeSubscriptionRate = summary.total_companies ? Math.round((summary.subscribed_companies / summary.total_companies) * 100) : 0;

  return <div className="mx-auto max-w-[1450px]">
    <SectionHeader eyebrow="Platform owner / portfolio intelligence" title="The company network, in view." description="A read-only operating picture across every FinOS company, with subscriptions, usage, activity, and growth kept outside customer workspace scope." action={<button onClick={() => void analyticsQuery.refetch()} disabled={analyticsQuery.isFetching} className="btn-quiet flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]" data-testid="button-refresh-platform-analytics"><RefreshCw size={13} className={analyticsQuery.isFetching ? 'animate-spin' : ''}/> Refresh portfolio</button>}/>
    {analyticsUnavailable && <div className="mb-6 rounded-xl border border-[#6d3840] bg-[#241923] px-4 py-3 text-[11px] leading-5 text-[#d7a7a8]">Platform API analytics are unavailable right now. The page remains open and is showing the local workspace fallback; connect the backend platform analytics endpoint to see the full company portfolio.</div>}
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-[#3a2a6a] bg-[#0c2130] px-4 py-3 text-[12px]"><span className="live-dot h-2 w-2 rounded-full bg-[#34d399]"/><span className="text-[#c3dbe3]">Platform scope verified</span><span className="text-[#718da1]">閳ワ拷</span><span className="text-[#7e9aad]">Analytics are aggregated from organization-owned records</span><span className="mono ml-auto hidden text-[10px] text-[#5f8194] md:block">{adminEmail}</span></div>
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Subscribed companies" value={String(summary.subscribed_companies)} delta={`${activeSubscriptionRate}% of portfolio`} icon={Building2}/>
      <MetricCard label="Monthly expected revenue" value={formatPlatformCurrency(summary.monthly_expected_revenue_cents)} delta={`${summary.basic_subscriptions} Basic 璺� ${summary.premium_subscriptions} Premium`} icon={CircleDollarSign} color="#34d399"/>
      <MetricCard label="Active users" value={summary.active_users.toLocaleString()} delta={`${activeCompanies} active companies`} icon={Users} color="#f2c66a"/>
      <MetricCard label="Knowledge storage" value={formatPlatformBytes(summary.total_storage_bytes)} delta={`${summary.total_knowledge_files} uploaded files`} icon={Database} color="#cb9eeb"/>
    </div>
     <div className="mb-6 grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
      <div className="panel p-5 md:p-6">
        <div className="mb-5 flex items-start justify-between"><div><div className="kicker mb-2">Revenue foundation</div><div className="display-font text-[22px] font-semibold text-[#e8f4f7]">Subscription mix</div><div className="mt-1 text-[11px] text-[#71899d]">Expected recurring revenue from active and trialing subscriptions.</div></div><CircleDollarSign size={18} className="text-[#34d399]"/></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[#214057] bg-[#0c2030] p-4"><div className="kicker mb-2">Basic</div><div className="display-font text-[24px] font-semibold text-[#e9f5f7]">{summary.basic_subscriptions}</div><div className="mt-1 text-[11px] text-[#7892a5]">{formatPlatformCurrency(summary.basic_subscriptions * 100_000)} / mo</div></div>
          <div className="rounded-lg border border-[#214057] bg-[#0c2030] p-4"><div className="kicker mb-2">Premium</div><div className="display-font text-[24px] font-semibold text-[#e9f5f7]">{summary.premium_subscriptions}</div><div className="mt-1 text-[11px] text-[#7892a5]">{formatPlatformCurrency(summary.premium_subscriptions * 200_000)} / mo</div></div>
          <div className="rounded-lg border border-[#214057] bg-[#0c2030] p-4"><div className="kicker mb-2">30-day growth</div><div className="display-font text-[24px] font-semibold text-[#e9f5f7]">{summary.companies_registered_last_30_days}</div><div className="mt-1 text-[11px] text-[#7892a5]">new companies</div></div>
        </div>
      </div>
       <div className="panel p-5 md:p-6"><div className="mb-5 flex items-start justify-between"><div><div className="kicker mb-2">Usage foundation</div><div className="display-font text-[22px] font-semibold text-[#e8f4f7]">AI workforce signals</div></div><Bot size={18} className="text-[#8b5cf6]"/></div><div className="space-y-4"><div><div className="mb-2 flex justify-between text-[11px]"><span className="text-[#8aa1b0]">Conversations</span><span className="mono text-[#d9e9ee]">{summary.total_ai_conversations.toLocaleString()}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#19354a]"><div className="h-full rounded-full bg-[#8b5cf6]" style={{ width: `${Math.min(summary.total_ai_conversations ? 100 : 0, 100)}%` }}/></div></div><div><div className="mb-2 flex justify-between text-[11px]"><span className="text-[#8aa1b0]">AI requests</span><span className="mono text-[#d9e9ee]">{summary.total_ai_requests.toLocaleString()}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#19354a]"><div className="h-full rounded-full bg-[#34d399]" style={{ width: `${Math.min(summary.total_ai_requests ? 100 : 0, 100)}%` }}/></div></div><div><div className="mb-2 flex justify-between text-[11px]"><span className="text-[#8aa1b0]">Responses</span><span className="mono text-[#d9e9ee]">{summary.total_responses.toLocaleString()}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#19354a]"><div className="h-full rounded-full bg-[#cb9eeb]" style={{ width: `${Math.min(summary.total_responses ? 100 : 0, 100)}%` }}/></div></div></div></div>
    </div>
    <div className="panel mb-6 overflow-hidden"><div className="flex items-center justify-between border-b border-[#1b3448] px-5 py-4 md:px-6"><div><div className="text-sm font-semibold text-[#e2e8f0]">Companies</div><div className="mt-1 text-[11px] text-[#71899d]">Subscription, workforce, knowledge, and activity visibility without entering any customer workspace.</div></div><span className="rounded-full border border-[#4a3a78] bg-[#102c3e] px-2.5 py-1 text-[10px] text-[#8dcbd4]">{companies.length} organizations</span></div><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left"><thead><tr className="border-b border-[#1b3448] text-[10px] uppercase tracking-[.14em] text-[#668197]"><th className="px-6 py-3 font-medium">Company</th><th className="px-4 py-3 font-medium">Subscription</th><th className="px-4 py-3 font-medium">Users</th><th className="px-4 py-3 font-medium">AI employees</th><th className="px-4 py-3 font-medium">Knowledge</th><th className="px-4 py-3 font-medium">Last activity</th><th className="px-6 py-3 text-right font-medium">State</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id} className="border-b border-[#162d40] last:border-0"><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#173b48] text-[11px] font-bold text-[#75dbe5]">{company.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><div><div className="text-[12px] font-semibold text-[#e2e8f0]">{company.name}</div><div className="mt-1 text-[10px] text-[#688399]">Registered {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(company.registration_date))}</div></div></div></td><td className="px-4 py-4"><div className="text-[12px] capitalize text-[#d4e3e8]">{company.subscription_plan}</div><div className="mt-1 text-[10px] text-[#71899d]">{company.subscription_status} 璺� {formatPlatformCurrency(company.monthly_price_cents)}/mo</div></td><td className="px-4 py-4 text-[12px] text-[#b4c8d2]">{company.user_count}</td><td className="px-4 py-4 text-[12px] text-[#b4c8d2]">{company.ai_employee_count}</td><td className="px-4 py-4"><div className="text-[12px] text-[#b4c8d2]">{company.knowledge_file_count} files</div><div className="mt-1 text-[10px] text-[#71899d]">{formatPlatformBytes(company.storage_bytes)}</div></td><td className="px-4 py-4 text-[11px] text-[#8ca4b5]">{company.last_activity ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(company.last_activity)) : 'No activity yet'}</td><td className="px-6 py-4 text-right"><Status>{company.status === 'active' ? 'Healthy' : company.status}</Status></td></tr>)}</tbody></table></div></div>
    <div className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
      <div className="panel p-5 md:p-6"><div className="mb-5 flex items-start justify-between"><div><div className="kicker mb-2">System</div><div className="display-font text-[22px] font-semibold text-[#e8f4f7]">Platform footprint</div></div><Activity size={18} className="text-[#f2c66a]"/></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-[#10283a] p-3"><div className="kicker">Companies</div><div className="mt-2 text-xl font-semibold text-[#e9f5f7]">{summary.total_companies}</div></div><div className="rounded-lg bg-[#10283a] p-3"><div className="kicker">Employees</div><div className="mt-2 text-xl font-semibold text-[#e9f5f7]">{summary.total_employees}</div></div><div className="rounded-lg bg-[#10283a] p-3"><div className="kicker">Files</div><div className="mt-2 text-xl font-semibold text-[#e9f5f7]">{summary.total_knowledge_files}</div></div><div className="rounded-lg bg-[#10283a] p-3"><div className="kicker">Events</div><div className="mt-2 text-xl font-semibold text-[#e9f5f7]">{recentActivity.length}</div></div></div></div>
      <div className="panel p-5 md:p-6"><div className="mb-5 flex items-start justify-between"><div><div className="kicker mb-2">Company activity</div><div className="display-font text-[22px] font-semibold text-[#e8f4f7]">Recent events</div></div><Clock4 size={18} className="text-[#8b5cf6]"/></div>{recentActivity.length === 0 ? <EmptyState title="No activity recorded yet" description="Onboarding and knowledge lifecycle events will appear here." compact/> : <div className="space-y-3">{recentActivity.slice(0, 6).map((event) => { const company = companies.find((candidate) => candidate.id === event.organization_id); return <div key={event.id} className="flex items-center gap-3 border-b border-[#162d40] pb-3 last:border-0 last:pb-0"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#173b48] text-[#8b5cf6]"><Activity size={13}/></div><div className="min-w-0 flex-1"><div className="truncate text-[12px] text-[#d7e7eb]">{event.event_type.replaceAll('_', ' ')}</div><div className="mt-1 text-[10px] text-[#71899d]">{company?.name || event.organization_id}</div></div><div className="shrink-0 text-[10px] text-[#7892a5]">{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(event.created_at))}</div></div>; })}</div>}</div>
    </div>
  </div>;
}

function AppRouter({onLogout}:{onLogout:()=>void}) {
  const { employees: roster } = useEmployees();
  const { user } = usePlatform();
  const owner = isPlatformOwner(user.email);
  return <Shell onLogout={onLogout}><Switch><Route path="/" component={Dashboard}/><Route path="/platform-admin" component={PlatformAdminPage}/><Route path="/ai-employees" component={AIDirectory}/><Route path="/ai-employees/builder" component={EmployeeBuilderPage}/>{roster.map((employee) => <Route key={`${employee.id}-details`} path={`/ai-employees/${employee.id}/details`} component={() => <EmployeeDetailsPage employee={employee}/>}/>)}{roster.map((employee) => <Route key={employee.id} path={`/ai-employees/${employee.id}`} component={() => <AIWorkspace employee={employee}/>}/>)}<Route path="/transactions" component={() => <DataPageV2 kind="transactions"/>}/><Route path="/customers" component={() => <DataPageV2 kind="customers"/>}/>{owner && <Route path="/merchants" component={() => <DataPageV2 kind="merchants"/>}/>}<Route path="/reports" component={ReportsV2}/><Route path="/analytics" component={AnalyticsV2}/><Route path="/knowledge" component={CompanyKnowledgePage}/><Route path="/assistant" component={AssistantPage}/><Route path="/profile" component={ProfilePage}/><Route path="/notifications" component={NotificationsPage}/><Route path="/settings" component={SettingsV2}/><Route component={NotFound}/></Switch></Shell>;
}

function Root() {
  const sessionValid = () => {
    const hasSession = localStorage.getItem('finos-auth') === '1';
    const at = Number(localStorage.getItem('finos-auth-at') || 0);
    const activeAccount = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    return hasSession && Boolean(activeAccount) && Date.now() - at < 8 * 60 * 60 * 1000;
  };
  const [authed, setAuthed] = useState(sessionValid);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!authed && location !== '/login') setLocation('/login');
  }, [authed, location, setLocation]);

  useEffect(() => {
    if (!authed) return;
    const interval = window.setInterval(() => {
      if (!sessionValid()) {
        localStorage.removeItem('finos-auth');
        localStorage.removeItem('finos-auth-at');
        localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
        setAuthed(false);
        setLocation('/login');
        toast.info('Your session expired. Please sign in again.');
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [authed, setLocation]);

  if (!authed) return <Route path="/login"><Login onLogin={() => { setAuthed(true); setLocation('/'); }}/></Route>;

  return <PlatformProvider><EmployeesProvider><AppRouter onLogout={() => { localStorage.removeItem('finos-auth'); localStorage.removeItem('finos-auth-at'); localStorage.removeItem(ACTIVE_ACCOUNT_KEY); setAuthed(false); setLocation('/login'); }}/></EmployeesProvider></PlatformProvider>;
}

function FinOSVisualTheme() {
  return <style>{`
    .app-shell { background:radial-gradient(circle at 78% 4%,rgba(99,102,241,.09),transparent 28%),#070914 !important; }
    .panel { background:rgba(13,16,32,.82) !important; border-color:rgba(139,92,246,.18) !important; box-shadow:0 14px 45px rgba(0,0,0,.22); backdrop-filter:blur(18px); }
    .nav-link { color:#7f8aa3 !important; }
    .nav-link:hover { background:rgba(139,92,246,.08) !important; color:#ddd6fe !important; }
    .nav-link.active { background:linear-gradient(90deg,rgba(139,92,246,.18),rgba(99,102,241,.06)) !important; color:#ddd6fe !important; border-left:2px solid #8b5cf6; }
    .btn-primary { background:linear-gradient(135deg,#8b5cf6,#6366f1) !important; border-color:transparent !important; color:white !important; box-shadow:0 8px 24px rgba(99,102,241,.22); }
    .btn-quiet { background:rgba(255,255,255,.035) !important; border-color:rgba(255,255,255,.08) !important; color:#cbd5e1 !important; }
    .input-dark { background:#0b0e1b !important; border-color:rgba(139,92,246,.16) !important; color:#e2e8f0 !important; }
    .table-row:hover { background:rgba(139,92,246,.045) !important; }
  `}</style>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><FinOSVisualTheme/><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Root/></WouterRouter><Toaster theme="dark" position="bottom-right" toastOptions={{style:{background:'#102538',border:'1px solid #2a5266',color:'#dbeef2',fontSize:'12px'}}}/></TooltipProvider></QueryClientProvider>;
}

export default App;
