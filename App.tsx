import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { 
  User, Branch, Employee, AccountOpening, Center, 
  CenterCollectionRecord, SalaryRow, CommissionStructure, 
  Target, Advance, SalaryEntry, DEFAULT_COMMISSION_RATES,
  Expense, ExpenseCategory, Loan, BonusSettings
} from './types';
import { googleSheetService } from './services/googleSheetService';
import { createEmptyEntry, recalculateEntry } from './services/logic';
import { getMonthlyTotalCollection, checkAccountBonusEligibility } from './services/accountService';

// Core & Static Components
import Login from './components/Login';
import UserAvatar from './components/UserAvatar';
import { BonusSettingsModal } from './components/BonusSettingsModal';

// Lazy-loaded views/pages
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const SalaryTable = React.lazy(() => import('./components/SalaryTable'));
const AddEmployeeForm = React.lazy(() => import('./components/AddEmployeeForm'));
const AddAccountForm = React.lazy(() => import('./components/AddAccountForm'));
const ManageBranches = React.lazy(() => import('./components/ManageBranches'));
const ManageCenters = React.lazy(() => import('./components/ManageCenters'));
const ManageUsers = React.lazy(() => import('./components/ManageUsers'));
const ManageCommissions = React.lazy(() => import('./components/ManageCommissions'));
const ManageTargets = React.lazy(() => import('./components/ManageTargets'));
const ManageAdvances = React.lazy(() => import('./components/ManageAdvances'));
const CenterCalculation = React.lazy(() => import('./components/CenterCalculation'));
const AccountReport = React.lazy(() => import('./components/AccountReport'));
const CenterReport = React.lazy(() => import('./components/CenterReport'));
const Leaderboard = React.lazy(() => import('./components/Leaderboard'));
const SummaryReport = React.lazy(() => import('./components/SummaryReport'));
const Loans = React.lazy(() => import('./components/Loans'));

import { 
  LayoutDashboard, Users, UserPlus, Building, Calculator, 
  FileText, LogOut, Menu, X, Settings, Target as TargetIcon,
  CreditCard, MapPin, Database, Award, FilePlus, Calendar, Filter, PieChart,
  RefreshCw
} from 'lucide-react';

enum View {
  DASHBOARD = 'DASHBOARD',
  SALARY_SHEET = 'SALARY_SHEET',
  ADD_EMPLOYEE = 'ADD_EMPLOYEE',
  ADD_ACCOUNT = 'ADD_ACCOUNT',
  MANAGE_BRANCHES = 'MANAGE_BRANCHES',
  MANAGE_CENTERS = 'MANAGE_CENTERS',
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_COMMISSIONS = 'MANAGE_COMMISSIONS',
  MANAGE_TARGETS = 'MANAGE_TARGETS',
  MANAGE_ADVANCES = 'MANAGE_ADVANCES',
  LOANS = 'LOANS',
  CENTER_CALCULATION = 'CENTER_CALCULATION',
  ACCOUNT_REPORT = 'ACCOUNT_REPORT',
  CENTER_REPORT = 'CENTER_REPORT',
  SUMMARY_REPORT = 'SUMMARY_REPORT',
  LEADERBOARD = 'LEADERBOARD',
}

const App: React.FC = () => {
  // Auth State
  const [user, setUser] = useState<User | null>(() => {
      const saved = localStorage.getItem('currentUser');
      return saved ? JSON.parse(saved) : null;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [isLoading, setIsLoading] = useState(false);

  // Persist user on change
  useEffect(() => {
      if (user) {
          localStorage.setItem('currentUser', JSON.stringify(user));
      } else {
          localStorage.removeItem('currentUser');
      }
  }, [user]);

  // Data State
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<AccountOpening[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [centerRecords, setCenterRecords] = useState<CenterCollectionRecord[]>([]);
  const [commissionRates, setCommissionRates] = useState<Record<string, CommissionStructure>>(DEFAULT_COMMISSION_RATES);
  const [targets, setTargets] = useState<Target[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  
  // Bonus settings configuration state
  const [bonusSettings, setBonusSettings] = useState<BonusSettings>({
    bonusEnabled: true,
    bonusDelayMonths: 1,
    minimumMonthlyCollection: 600
  });
  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
  
  // Salary Sheet State
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [salaryRows, setSalaryRows] = useState<SalaryRow[]>([]);
  const [salaryHistory, setSalaryHistory] = useState<SalaryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const lastFetchedMonthRef = useRef<string>('');

  // Initial Load
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [data, history] = await Promise.all([
        googleSheetService.fetchAllData(),
        googleSheetService.getSalaryHistory(selectedMonth, [])
      ]);
      
      lastFetchedMonthRef.current = selectedMonth;

      let fetchedBranches = data.branches;
      
      // Auto-seed "কোদালপুর" branch if missing (User Request)
      if (!fetchedBranches.some(b => b.name === "কোদালপুর")) {
          const newBranch = { 
              id: `b_${Date.now()}`, 
              name: "কোদালপুর", 
              status: 'ACTIVE' as const,
              address: "Kodalpur",
              phone: "" 
          };
          await googleSheetService.addBranch(newBranch);
          fetchedBranches = [...fetchedBranches, newBranch];
          console.log("Auto-created branch: কোদালপুর");
      }

      setBranches(fetchedBranches);
      setEmployees(data.employees);
      setAccounts(data.accounts);
      setCenters(data.centers);
      setCenterRecords(data.collections);
      setCommissionRates(Object.keys(data.commissions).length > 0 ? data.commissions : DEFAULT_COMMISSION_RATES);
      setTargets(data.targets);
      setAdvances(data.advances);
      setUsers(data.users);
      setExpenses(data.expenses);
      setExpenseCategories(data.expenseCategories);
      setLoans(data.loans || []);
      if (data.bonusSettings) {
        setBonusSettings(data.bonusSettings);
      }
      setSalaryHistory(history);

    } catch (error) {
      console.error("Error fetching data:", error);
      alert("Failed to load data. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  // Handle month selection change fetching
  useEffect(() => {
    if (!user) return;
    if (lastFetchedMonthRef.current === selectedMonth) {
      return; // Already fetched
    }
    
    const fetchHistoryForMonth = async () => {
      setIsHistoryLoading(true);
      try {
        lastFetchedMonthRef.current = selectedMonth;
        const history = await googleSheetService.getSalaryHistory(selectedMonth, []);
        setSalaryHistory(history);
      } catch (e) {
        console.error("Failed to load salary history for month:", e);
      } finally {
        setIsHistoryLoading(false);
      }
    };

    fetchHistoryForMonth();
  }, [user, selectedMonth]);

  // Salary Row Generation Logic
  useEffect(() => {
    if (!user || employees.length === 0) return;

    // Filter collections by month
    const monthlyCollections = centerRecords.filter(r => r.collectionDate.startsWith(selectedMonth));
    
    // Date components for book logic
    const [sheetYear, sheetMonthNum] = selectedMonth.split('-').map(Number);

    // Calculate Branch Totals for Manager Incentive context
    const branchTotals: Record<string, number> = {};
    monthlyCollections.forEach(r => {
         branchTotals[r.branchId] = (branchTotals[r.branchId] || 0) + r.amount + (r.loanAmount || 0);
    });

    const rows: SalaryRow[] = employees.map(emp => {
        const entry = createEmptyEntry('temp', emp.id, emp.base_salary, emp.commission_type);
        const savedEntry = salaryHistory.find(h => h.employee_id === emp.id);
        
        // Apply manually saved additions/deductions
        if (savedEntry) {
            entry.center_count = savedEntry.center_count || 0;
            entry.center_collection = savedEntry.center_collection || 0;
            entry.input_late_hours = savedEntry.input_late_hours || 0;
            entry.input_absent_days = savedEntry.input_absent_days || 0;
            entry.deduction_cash_advance = savedEntry.deduction_cash_advance || 0;
            entry.misconductDeduction = savedEntry.misconductDeduction || 0;
            entry.deduction_unlawful = savedEntry.deduction_unlawful || 0;
            entry.deduction_tours = savedEntry.deduction_tours || 0;
            entry.deduction_others = savedEntry.deduction_others || 0;
            entry.commission_type = savedEntry.commission_type || emp.commission_type;
            entry.basic_salary = savedEntry.basic_salary || emp.base_salary;
        }

        // --- AGGREGATE COLLECTIONS WITH STRICT CENTER MANAGEMENT RULES ---
        const empRecords = monthlyCollections.filter(r => r.employeeId === emp.id);
        
        let ownCollection = 0;
        let officeCollection = 0;
        const ownCenterCodes = new Set<number>();
        const officeCenterCodes = new Set<number>();
        const countedCenters = new Set<number>(); 
        let ownMemberCount = 0;
        let officeMemberCount = 0;
        
        let loanCollection = 0;

        empRecords.forEach(r => {
            loanCollection += (r.loanAmount || 0);

            // STRICT LOOKUP: Match Center by Code and Branch from the Record
            const center = centers.find(c => c.centerCode === r.centerCode && c.branchId === r.branchId);
            
            let resolvedType = r.type; // Fallback to record type if center missing

            if (center) {
                if (center.type === 'OFFICE') {
                    resolvedType = 'OFFICE';
                } else if (center.assignedEmployeeId === emp.id) {
                    resolvedType = 'OWN';
                } else {
                    resolvedType = 'OFFICE';
                }
            }

            if (resolvedType === 'OWN') {
                ownCollection += r.amount;
                ownCenterCodes.add(r.centerCode);
                
                if (center && !countedCenters.has(r.centerCode)) {
                    ownMemberCount += (center.memberCount || 0);
                    countedCenters.add(r.centerCode);
                }
            } else {
                officeCollection += r.amount;
                officeCenterCodes.add(r.centerCode);
                
                if (center && !countedCenters.has(r.centerCode)) {
                    officeMemberCount += (center.memberCount || 0);
                    countedCenters.add(r.centerCode);
                }
            }
        });

        // Populate Entry
        entry.own_somity_collection = ownCollection;
        entry.office_somity_collection = officeCollection;
        entry.own_somity_count = ownCenterCodes.size;
        entry.office_somity_count = officeCenterCodes.size;
        entry.own_somity_member_count = ownMemberCount;
        entry.office_somity_member_count = officeMemberCount;
        
        entry.total_loan_collection = loanCollection;

        // --- END AGGREGATION ---
        
        // --- BOOK ADDITION (Only Scanned/Counted books) ---
        const empAccounts = accounts.filter(a => a.opened_by_employee_id === emp.id);
        empAccounts.forEach(acc => {
            if (acc.counted_month === selectedMonth) {
                const eligibility = checkAccountBonusEligibility(acc, selectedMonth, centerRecords, bonusSettings, {
                    employeeId: emp.id,
                    branchId: emp.branch_id,
                    ignoreIsCounted: true,
                    employee: emp
                });
                const isBonusEligible = eligibility.eligible;
                
                if (!isBonusEligible) {
                    entry.book_no_bonus = (entry.book_no_bonus || 0) + 1;
                } else {
                    switch(acc.term) {
                        case 1.5: entry.book_1_5 = (entry.book_1_5 || 0) + 1; break;
                        case 3: entry.book_3 = (entry.book_3 || 0) + 1; break;
                        case 5: entry.book_5 = (entry.book_5 || 0) + 1; break;
                        case 8: entry.book_8 = (entry.book_8 || 0) + 1; break;
                        case 10: entry.book_10 = (entry.book_10 || 0) + 1; break;
                        case 12: entry.book_12 = (entry.book_12 || 0) + 1; break;
                        default: entry.book_no_bonus = (entry.book_no_bonus || 0) + 1; break;
                    }
                }
            }
        });
        // -------------------------------

        // Inject Manager Context
        const isManager = emp.designation === 'Branch Manager';
        const branchTotal = branchTotals[emp.branch_id] || 0;

        const recalculated = recalculateEntry(
            entry, 
            entry.basic_salary || emp.base_salary, 
            commissionRates, 
            entry.commission_type || emp.commission_type,
            { isManager, branchTotalCollection: branchTotal }
        );
        
        return {
            ...recalculated,
            employee: emp,
            branch: branches.find(b => b.id === emp.branch_id) || { id: 'unknown', name: 'Unknown' }
        };
    });
    setSalaryRows(rows);
  }, [user, employees, branches, commissionRates, selectedMonth, centerRecords, centers, accounts, bonusSettings, salaryHistory]);

  // --- Handlers ---

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    setCurrentView(View.DASHBOARD);
  };

  const handleLogout = () => {
    setUser(null);
    setUsers([]);
    setBranches([]);
    setEmployees([]);
  };

  // Improved Row Update Handler with Manager Recalculation
  const handleRowUpdate = (updatedEntry: SalaryEntry) => {
      setSalaryRows(prevRows => {
          // 1. Update the specific row
          const tempRows = prevRows.map(r => r.employee_id === updatedEntry.employee_id ? { ...r, ...updatedEntry } : r);
          
          // 2. Identify Branch of updated employee
          const branchId = tempRows.find(r => r.employee_id === updatedEntry.employee_id)?.branch.id;
          if (!branchId) return tempRows;

          // 3. Recalculate Branch Total (Dynamic Sum of all rows in branch)
          const branchRows = tempRows.filter(r => r.branch.id === branchId);
          const branchTotal = branchRows.reduce((sum, r) => 
              sum + (r.own_somity_collection || 0) + (r.office_somity_collection || 0) + (r.center_collection || 0) + (r.total_loan_collection || 0)
          , 0);

          // 4. Update Managers in that branch
          return tempRows.map(r => {
              if (r.branch.id === branchId && r.employee.designation === 'Branch Manager') {
                  const recalc = recalculateEntry(
                      r, 
                      r.employee.base_salary, 
                      commissionRates, 
                      r.commission_type, 
                      { isManager: true, branchTotalCollection: branchTotal }
                  );
                  return { ...recalc, employee: r.employee, branch: r.branch };
              }
              return r;
          });
      });
  };

  // ... (Other CRUD handlers same as before) ...
  const handleAddEmployee = async (empData: Omit<Employee, 'id'> & { id?: string }) => {
    const newId = empData.id || `E-${1000 + employees.length + 1}`;
    const newEmp = { ...empData, id: newId, status: 'ACTIVE' as const };
    setEmployees(prev => [...prev, newEmp as Employee]);
    await googleSheetService.addEmployee(newEmp);
    alert(`Employee ${newEmp.name} added successfully!`);
  };

  const handleBulkAddEmployees = async (newEmps: Employee[]) => {
      setEmployees(prev => [...prev, ...newEmps]);
      await googleSheetService.addEmployees(newEmps);
      alert(`Imported ${newEmps.length} employees.`);
  };

  const handleUpdateEmployee = async (id: string, data: Partial<Employee>) => {
      const emp = employees.find(e => e.id === id);
      if (emp) {
          const updated = { ...emp, ...data };
          setEmployees(prev => prev.map(e => e.id === id ? updated : e));
          await googleSheetService.updateEmployee(updated);
      }
  };

  const handleDeleteEmployee = async (id: string) => {
      setEmployees(prev => prev.filter(e => e.id !== id));
      const emp = employees.find(e => e.id === id);
      if (emp) {
          await googleSheetService.updateEmployee({ ...emp, status: 'INACTIVE' });
      }
  };

  const handleAddAccount = async (accData: Omit<AccountOpening, 'id'>) => {
      const newAcc = { ...accData, id: Date.now() + Math.random() };
      // Optimistic update
      setAccounts(prev => [...prev, newAcc as AccountOpening]);
      await googleSheetService.addAccount(newAcc);
      // Re-fetch to ensure sync
      await new Promise(resolve => setTimeout(resolve, 1000));
      const freshAccounts = await googleSheetService.getAccounts();
      setAccounts(freshAccounts);
  };

  const handleBulkAddAccounts = async (newAccs: Omit<AccountOpening, 'id'>[]) => {
      const withIds = newAccs.map(a => ({ ...a, id: Math.floor(Date.now() + Math.random() * 1000) }));
      
      // Optimistic update
      setAccounts(prev => [...prev, ...withIds as AccountOpening[]]);
      
      try {
          // 1. Save Accounts
          await googleSheetService.addAccounts(withIds);
          
          // 2. Create Collection Records for Initial Deposits (if > 0)
          const collectionRecords: CenterCollectionRecord[] = withIds
              .filter(acc => acc.collection_amount > 0)
              .map(acc => {
                  // Determine Type Logic (Replicated from CenterCalculation/Report)
                  const center = centers.find(c => c.centerCode === acc.center_code && c.branchId === acc.branch_id);
                  let type: 'OWN' | 'OFFICE' = 'OFFICE';
                  
                  if (center) {
                      if (center.type === 'OFFICE') {
                          type = 'OFFICE';
                      } else {
                          type = center.assignedEmployeeId === acc.opened_by_employee_id ? 'OWN' : 'OFFICE';
                      }
                  } else {
                      // Fallback if center auto-creation hasn't synced yet or logic differs
                      type = acc.center_code % 2 !== 0 ? 'OWN' : 'OFFICE';
                  }

                  return {
                      id: `col_${Date.now()}_${Math.random()}`,
                      collectionDate: acc.opening_date, // Use opening date as collection date
                      submittedAt: new Date().toISOString(),
                      branchId: acc.branch_id,
                      centerCode: acc.center_code,
                      employeeId: acc.opened_by_employee_id,
                      amount: acc.collection_amount,
                      loanAmount: 0,
                      type: type,
                      status: 'ACTIVE'
                  };
              });

          if (collectionRecords.length > 0) {
              console.log(`[App] Auto-creating ${collectionRecords.length} collection records for initial deposits.`);
              await googleSheetService.addCollections(collectionRecords);
              // Refresh collections
              const freshCollections = await googleSheetService.getCollections();
              setCenterRecords(freshCollections);
          }

          // 3. Re-fetch fresh data from sheet to ensure everything is in sync
          const freshAccounts = await googleSheetService.getAccounts();
          setAccounts(freshAccounts);
          
          // Also refresh centers if any were auto-created
          const freshCenters = await googleSheetService.getCenters();
          setCenters(freshCenters);
      } catch (e) {
          console.error("Failed to sync accounts:", e);
          // Revert optimistic update on failure
          const idsToRemove = new Set(withIds.map(a => a.id));
          setAccounts(prev => prev.filter(a => !idsToRemove.has(a.id)));
          throw e;
      }
  };

  const handleUpdateAccount = async (id: number, data: Partial<AccountOpening>) => {
      // Check for duplicates if code or branch is changing
      if (data.account_code || data.branch_id) {
          const currentAccount = accounts.find(a => a.id === id);
          if (!currentAccount) return;

          const targetCode = (data.account_code || currentAccount.account_code).trim();
          const targetBranch = data.branch_id || currentAccount.branch_id;
          
          if (targetCode && targetBranch) {
              const duplicate = accounts.find(a => 
                  a.id !== id && // Exclude self
                  a.account_code.toLowerCase() === targetCode.toLowerCase() && 
                  a.branch_id === targetBranch
              );
              
              if (duplicate) {
                  alert(`Error: Account Code '${targetCode}' already exists in the target branch.`);
                  return;
              }
          }
      }

      const account = accounts.find(a => a.id === id);
      if (account) {
          const updated = { ...account, ...data };
          // Optimistic update
          setAccounts(prev => prev.map(a => a.id === id ? updated : a));
          
          try {
              await googleSheetService.updateAccount(updated);
              // Re-fetch to ensure consistency and get updated rowIndex if needed
              const freshAccounts = await googleSheetService.getAccounts();
              setAccounts(freshAccounts);
              alert("Account updated successfully!");
          } catch (error) {
              console.error("Failed to update account:", error);
              alert("Failed to update account in database. Please check console for details.");
              // Revert optimistic update if needed, but for now we keep it to avoid UI flicker
          }
      }
  };

  const handleDeleteAccount = async (id: number) => {
      setAccounts(prev => prev.filter(a => a.id !== id));
  };

  const handleAddBranch = async (data: { name: string, address?: string, phone?: string }) => {
      const newBranch = { ...data, id: `b_${Date.now()}`, status: 'ACTIVE' as const };
      setBranches(prev => [...prev, newBranch]);
      await googleSheetService.addBranch(newBranch);
  };

  const handleEditBranch = async (id: string, data: { name: string, address?: string, phone?: string }) => {
      setBranches(prev => prev.map(b => b.id === id ? { ...b, ...data } : b));
  };

  const handleDeleteBranch = async (id: string) => {
      setBranches(prev => prev.filter(b => b.id !== id));
  };

  const handleBulkAddBranches = async (newBranches: { name: string, address?: string, phone?: string }[]) => {
      const withIds = newBranches.map(b => ({ ...b, id: `b_${Date.now()}_${Math.random()}`, status: 'ACTIVE' as const }));
      setBranches(prev => [...prev, ...withIds]);
      await googleSheetService.addBranches(withIds);
  };

  const handleAddCenter = async (centerData: Omit<Center, 'id'>, silent = false) => {
      const newCenter = { ...centerData, id: `c_${Date.now()}_${Math.random()}` };
      setCenters(prev => [...prev, newCenter as Center]);
      await googleSheetService.addCenter(newCenter);
      if(!silent) alert("Center added successfully");
  };

  const handleEditCenter = async (id: string, data: Partial<Center>) => {
      const center = centers.find(c => c.id === id);
      if (center) {
          const updated = { ...center, ...data };
          setCenters(prev => prev.map(c => c.id === id ? updated : c));
          await googleSheetService.updateCenter(updated);
      }
  };

  const handleDeleteCenter = async (id: string) => {
      const center = centers.find(c => c.id === id);
      if (center) {
          const updated = { ...center, status: 'INACTIVE' as const };
          setCenters(prev => prev.filter(c => c.id !== id));
          await googleSheetService.updateCenter(updated);
      }
  };

  const handleBulkAddCenters = async (newCenters: Omit<Center, 'id'>[]) => {
      const processed = newCenters.map(c => ({ ...c, id: `c_${Date.now()}_${Math.random()}` }));
      setCenters(prev => [...prev, ...processed as Center[]]);
      for(const c of processed) {
          await googleSheetService.addCenter(c);
      }
      alert(`Imported ${processed.length} centers.`);
  };

  const handleAddUser = async (userData: Omit<User, 'id'>) => {
      const newUser = { ...userData, id: `u_${Date.now()}`, status: 'ACTIVE' as const };
      setUsers(prev => [...prev, newUser]);
      await googleSheetService.addUser(newUser);
  };

  const handleEditUser = async (id: string, data: Partial<User>) => {
      const user = users.find(u => u.id === id);
      if (user) {
          const updated = { ...user, ...data };
          setUsers(prev => prev.map(u => u.id === id ? updated : u));
          await googleSheetService.updateUser(updated);
      }
  };

  const handleDeleteUser = async (id: string) => {
      const user = users.find(u => u.id === id);
      setUsers(prev => prev.filter(u => u.id !== id));
      if (user) {
          await googleSheetService.updateUser({ ...user, status: 'INACTIVE' });
      }
  };

  const handleAddCollectionRecord = async (record: Omit<CenterCollectionRecord, 'id' | 'createdAt'>) => {
      const newRec = { ...record, id: `col_${Date.now()}`, status: 'ACTIVE' as const };
      // Optimistic update
      setCenterRecords(prev => [...prev, newRec]);
      await googleSheetService.addCollections([newRec]);
      // Re-fetch
      const freshRecords = await googleSheetService.getCollections();
      setCenterRecords(freshRecords);
  };

  const handleBulkAddCollectionRecords = async (records: CenterCollectionRecord[]) => {
      // Optimistic update
      setCenterRecords(prev => [...prev, ...records]);
      await googleSheetService.addCollections(records);
      // Re-fetch
      const freshRecords = await googleSheetService.getCollections();
      setCenterRecords(freshRecords);
  };

  const handleSaveTarget = async (target: Target) => {
      const existingIdx = targets.findIndex(t => t.id === target.id);
      if (existingIdx >= 0) {
          setTargets(prev => prev.map((t, i) => i === existingIdx ? target : t));
      } else {
          setTargets(prev => [...prev, target]);
      }
      await googleSheetService.saveTarget(target);
  };

  const handleUpdateCommissionRates = (newRates: Record<string, CommissionStructure>) => {
      setCommissionRates(newRates);
      alert("Commission rates updated locally. Sheet update not implemented in this demo.");
  };

  const handleAccountScanned = async (code: string) => {
      const account = accounts.find(a => a.account_code === code);
      if (account) {
          const updatedAccount = { 
              ...account, 
              is_counted: true, 
              counted_month: selectedMonth,
              salary_sheet_id: `SHEET_${selectedMonth}` 
          };
          
          // Optimistic update ONLY - Persistence happens on Salary Row Save
          setAccounts(prev => prev.map(a => a.id === account.id ? updatedAccount : a));
          console.log(`Account ${code} marked as used locally. Save row to persist.`);
      }
  };

  const handleSaveScannedAccounts = async (codes: string[]) => {
      console.log(`[App] Persisting ${codes.length} scanned accounts to DB...`);
      
      // Filter valid accounts that need update
      const updates = codes.map(code => {
          const acc = accounts.find(a => a.account_code === code);
          if (!acc) return null;
          return {
              ...acc,
              is_counted: true,
              counted_month: selectedMonth,
              salary_sheet_id: `SHEET_${selectedMonth}`
          };
      }).filter(Boolean) as AccountOpening[];

      if (updates.length === 0) return;

      try {
          // Loop update for reliability (or implement batch update in service if available)
          for (const acc of updates) {
              await googleSheetService.updateAccount(acc);
          }
          console.log(`[App] Successfully persisted ${updates.length} accounts.`);
          
          // Ensure local state is consistent (though handleAccountScanned should have done it)
          setAccounts(prev => {
              const updatedIds = new Set(updates.map(u => u.id));
              return prev.map(a => updatedIds.has(a.id) ? updates.find(u => u.id === a.id)! : a);
          });
      } catch (e) {
          console.error("Failed to persist scanned accounts:", e);
          alert("Failed to save account statuses. Please try saving again.");
          throw e; // Propagate to SalaryTable to show error
      }
  };

  const visibleEmployees = useMemo(() => {
      if (user?.role === 'USER' || user?.role === 'MANAGER') {
          return employees.filter(e => e.branch_id === user.branch_id);
      }
      return employees;
  }, [employees, user]);

  const visibleCenters = useMemo(() => {
      if (user?.role === 'USER' || user?.role === 'MANAGER') {
          return centers.filter(c => c.branchId === user.branch_id);
      }
      return centers;
  }, [centers, user]);

  const activeSalaryRows = useMemo(() => {
      let filtered = salaryRows.filter(row => visibleEmployees.some(e => e.id === row.employee.id));
      if (selectedBranchId !== 'all') {
          filtered = filtered.filter(row => row.branch.id === selectedBranchId);
      }
      return filtered;
  }, [salaryRows, visibleEmployees, selectedBranchId]);

  if (!user) {
    return <Login onLogin={handleLogin} users={users} />;
  }

  const NavItem = ({ view, icon: Icon, label }: { view: View, icon: any, label: string }) => (
    <button
      onClick={() => { setCurrentView(view); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors mb-1 ${
        currentView === view 
          ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <Icon size={20} strokeWidth={currentView === view ? 2.5 : 2} />
      <span className="font-medium text-sm">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 print:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="pl-3.5 pr-2 py-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
               <img 
                  src="/assets/logo.svg" 
                  alt="নিরাপত্তা লোগো" 
                  className="h-12 w-12 object-contain shrink-0" 
                  referrerPolicy="no-referrer"
               />
               <div className="flex flex-col min-w-0 font-bengali">
                  <span className="text-xl font-bold text-slate-800 leading-tight">নিরাপত্তা</span>
                  <span className="text-[10px] font-semibold text-slate-500 leading-tight tracking-tight whitespace-nowrap">
                     আঙ্গারিয়া ক্ষুদ্র ব্যবসায়ী সমবায় সমিতি লিঃ
                  </span>
               </div>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-slate-600 shrink-0 ml-1">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
             <div>
                <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Main</p>
                <NavItem view={View.DASHBOARD} icon={LayoutDashboard} label="Dashboard" />
                <NavItem view={View.LEADERBOARD} icon={Award} label="Leaderboard" />
             </div>

             <div>
                <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Operations</p>
                <NavItem view={View.CENTER_CALCULATION} icon={Calculator} label="Deposit Entry" />
                <NavItem view={View.ADD_ACCOUNT} icon={UserPlus} label="New Accounts" />
                <NavItem view={View.ADD_EMPLOYEE} icon={Users} label="Employees" />
                <NavItem view={View.SALARY_SHEET} icon={FileText} label="Salary Sheet" />
             </div>

             <div>
                <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Management</p>
                <NavItem view={View.MANAGE_BRANCHES} icon={Building} label="Branches" />
                <NavItem view={View.MANAGE_CENTERS} icon={MapPin} label="Centers" />
                <NavItem view={View.MANAGE_TARGETS} icon={TargetIcon} label="Targets" />
                <NavItem view={View.MANAGE_ADVANCES} icon={CreditCard} label="Advances" />
                <NavItem view={View.LOANS} icon={Database} label="Loans" />
             </div>

             <div>
                <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Reports</p>
                <NavItem view={View.ACCOUNT_REPORT} icon={FilePlus} label="Account Report" />
                <NavItem view={View.CENTER_REPORT} icon={FileText} label="Collection Report" />
                <NavItem view={View.SUMMARY_REPORT} icon={PieChart} label="Summary Report" />
             </div>

             {['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(user.role) && (
               <div>
                  <p className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Admin</p>
                  <NavItem view={View.MANAGE_USERS} icon={Settings} label="System Users" />
                  <NavItem view={View.MANAGE_COMMISSIONS} icon={Database} label="Commission Setup" />
               </div>
             )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
             <div className="flex items-center gap-3 mb-4 px-2">
                <UserAvatar 
                   url={user.avatar} 
                   name={user.name} 
                   className="w-10 h-10 border-2 border-white shadow-sm" 
                 />
                <div className="overflow-hidden">
                   <p className="text-sm font-bold text-slate-800 truncate">{user.name}</p>
                   <p className="text-xs text-slate-500 truncate capitalize">{user.role.replace('_', ' ').toLowerCase()}</p>
                </div>
             </div>
             <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center space-x-2 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-600 py-2 rounded-lg transition-all text-sm font-medium shadow-sm"
             >
                <LogOut size={16} />
                <span>Sign Out</span>
             </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 lg:px-8 shadow-sm z-10 print:hidden">
           <div className="flex items-center gap-3">
               <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg">
                  <Menu size={24} />
               </button>
               <h2 className="text-lg font-bold text-slate-800 capitalize">
                  {currentView.replace('_', ' ').toLowerCase()}
               </h2>
           </div>
           
           <div className="flex items-center gap-4">
              {currentView === View.SALARY_SHEET && ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(user.role) && (
                  <button
                      id="bonus-settings-btn"
                      onClick={() => setIsBonusModalOpen(true)}
                      className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-lg px-3 py-1.5 shadow-sm text-sm font-bold transition-all active:scale-95"
                  >
                      <Settings size={16} />
                      <span>Bonus Settings</span>
                  </button>
              )}
              {[View.SALARY_SHEET, View.LEADERBOARD, View.SUMMARY_REPORT].includes(currentView) && ['SUPER_ADMIN', 'ADMIN', 'OWNER'].includes(user.role) && (
                  <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                      <Filter size={16} className="text-slate-500" />
                      <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} className="bg-transparent border-none text-sm font-bold text-slate-700 outline-none focus:ring-0 p-0 cursor-pointer min-w-[100px]">
                          <option value="all">All Branches</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                  </div>
              )}

              {[View.DASHBOARD, View.SALARY_SHEET, View.LEADERBOARD, View.SUMMARY_REPORT].includes(currentView) && (
                  <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm">
                      <Calendar size={16} className="text-slate-500" />
                      <span className="text-xs font-bold text-slate-500 uppercase hidden sm:inline">Period:</span>
                      <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent border-none text-sm font-bold text-slate-700 outline-none focus:ring-0 p-0 w-32 cursor-pointer" />
                  </div>
              )}

              {isLoading && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full animate-pulse">Syncing...</span>}
           </div>
        </header>

        <div className="flex-1 overflow-auto bg-slate-50 p-6 lg:p-8 print:p-0 print:bg-white">
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
              <RefreshCw className="animate-spin text-indigo-600 w-10 h-10" />
              <p className="text-slate-500 text-sm font-medium">Loading view...</p>
            </div>
          }>
            {currentView === View.DASHBOARD && (
             <Dashboard 
                branches={branches} employees={employees} activeRows={activeSalaryRows}
                accounts={accounts} month={selectedMonth} language="en" centerRecords={centerRecords}
                targets={targets} currentUser={user} bonusSettings={bonusSettings}
             />
          )}

          {currentView === View.SUMMARY_REPORT && (
             <SummaryReport 
                month={selectedMonth} 
                branchId={selectedBranchId}
                branches={branches}
                collections={centerRecords}
                expenses={expenses}
                expenseCategories={expenseCategories}
                loans={loans}
                onAddExpense={async (expense) => {
                  try {
                    setIsLoading(true);
                    await googleSheetService.addExpense(expense);
                    setExpenses(prev => [...prev, expense]);
                  } catch (e) {
                    console.error(e);
                    alert("Failed to add expense");
                  } finally {
                    setIsLoading(false);
                  }
                }}
                onAddCategory={async (cat) => {
                  try {
                    setIsLoading(true);
                    await googleSheetService.addExpenseCategory(cat);
                    setExpenseCategories(prev => [...prev, cat]);
                  } catch (e) {
                    console.error(e);
                    alert("Failed to add category");
                  } finally {
                    setIsLoading(false);
                  }
                }}
             />
          )}

          {currentView === View.SALARY_SHEET && (
             <SalaryTable 
                rows={activeSalaryRows} accounts={accounts} commissionRates={commissionRates} 
                onUpdateRow={handleRowUpdate}
                onAccountScanned={handleAccountScanned} 
                onSaveScannedAccounts={handleSaveScannedAccounts}
                readOnly={user.role === 'USER'} month={selectedMonth}
                bonusSettings={bonusSettings}
                collections={centerRecords}
             />
          )}

          {currentView === View.ADD_EMPLOYEE && (
             <AddEmployeeForm 
                branches={branches} existingEmployees={employees} commissionRates={commissionRates} 
                onSave={handleAddEmployee} onBulkSave={handleBulkAddEmployees} onEdit={handleUpdateEmployee} 
                onDelete={handleDeleteEmployee} userRole={user.role} 
             />
          )}

          {currentView === View.ADD_ACCOUNT && (
             <AddAccountForm 
                employees={visibleEmployees} existingAccounts={accounts} centers={visibleCenters} branches={branches} 
                onSave={handleAddAccount} onBulkSave={handleBulkAddAccounts} currentUser={user} 
                onAddCenter={(c) => handleAddCenter(c, true)} 
             />
          )}

          {currentView === View.MANAGE_BRANCHES && (
             <ManageBranches branches={branches} onAdd={handleAddBranch} onEdit={handleEditBranch} onDelete={handleDeleteBranch} onBulkAdd={handleBulkAddBranches} />
          )}

          {currentView === View.MANAGE_CENTERS && (
             <ManageCenters centers={centers} branches={branches} employees={employees} records={centerRecords} onAdd={handleAddCenter} onEdit={handleEditCenter} onDelete={handleDeleteCenter} onBulkAdd={handleBulkAddCenters} />
          )}

          {currentView === View.MANAGE_USERS && (
             <ManageUsers users={users} branches={branches} employees={employees} onAddUser={handleAddUser} onEditUser={handleEditUser} onDeleteUser={handleDeleteUser} />
          )}

          {currentView === View.MANAGE_COMMISSIONS && (
             <ManageCommissions rates={commissionRates} onUpdateRates={handleUpdateCommissionRates} />
          )}

          {currentView === View.MANAGE_TARGETS && (
             <ManageTargets branches={branches} employees={employees} targets={targets} onSaveTarget={async (t) => {
                    setTargets(prev => {
                        const idx = prev.findIndex(Existing => Existing.employeeId === t.employeeId && Existing.month === t.month);
                        if (idx >= 0) { const newArr = [...prev]; newArr[idx] = t; return newArr; }
                        return [...prev, t];
                    });
                    await googleSheetService.saveTarget(t);
                }} 
             />
          )}

          {currentView === View.MANAGE_ADVANCES && (
             <ManageAdvances employees={employees} branches={branches} />
          )}

          {currentView === View.LOANS && (
             <Loans 
                loans={loans} 
                branches={branches} 
                employees={employees} 
                collections={centerRecords} 
                accounts={accounts}
                onAddLoan={(loan) => setLoans(prev => [...prev, loan])}
                onUpdateLoan={(loan) => setLoans(prev => prev.map(l => l.id === loan.id ? loan : l))}
                onAddCollection={handleAddCollectionRecord}
             />
          )}

          {currentView === View.CENTER_CALCULATION && (
             <CenterCalculation 
                records={centerRecords} onAddRecord={handleAddCollectionRecord} 
                onEditRecord={(id, data) => setCenterRecords(prev => prev.map(r => r.id === id ? { ...r, ...data } : r))}
                onDeleteRecord={(id) => setCenterRecords(prev => prev.filter(r => r.id !== id))} 
                branches={branches} employees={employees} currentUser={user} centers={centers} 
                onBulkAddRecords={handleBulkAddCollectionRecords} onCreateCenter={(c) => handleAddCenter(c, true)} 
             />
          )}

          {currentView === View.ACCOUNT_REPORT && (
             <AccountReport 
                accounts={accounts} 
                employees={employees} 
                branches={branches} 
                onEdit={handleUpdateAccount} 
                onDelete={(id) => handleDeleteAccount(id)} 
                onRefresh={fetchData}
                collections={centerRecords}
                userRole={user.role} 
                bonusSettings={bonusSettings}
             />
          )}

          {currentView === View.CENTER_REPORT && (
             <CenterReport records={centerRecords} branches={branches} employees={employees} centers={centers} />
          )}

          {currentView === View.LEADERBOARD && (
             <Leaderboard rows={activeSalaryRows} branches={branches} month={selectedMonth} accounts={accounts} />
          )}
          </Suspense>
        </div>
      </main>

      {isBonusModalOpen && (
         <BonusSettingsModal
            isOpen={isBonusModalOpen}
            onClose={() => setIsBonusModalOpen(false)}
            settings={bonusSettings}
            onSave={async (newSettings) => {
               try {
                  await googleSheetService.saveBonusSettings(newSettings);
                  setBonusSettings(newSettings);
               } catch (e) {
                  console.error("Failed to save bonus settings", e);
                  alert("Failed to save settings. Please try again.");
               }
            }}
         />
      )}
    </div>
  );
};

export default App;