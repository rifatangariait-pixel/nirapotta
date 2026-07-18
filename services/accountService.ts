import { AccountOpening, BonusSettings, CenterCollectionRecord, Employee } from '../types';

export interface BonusEligibilityResult {
  eligible: boolean;
  reason: string;
}

export function safeNum(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function getQualifyingMonthForAccount(openingDate: string, delayMonths: number): string {
  const [openY, openM] = openingDate.split('-').map(Number);
  let qualM = openM + delayMonths;
  let qualY = openY;
  while (qualM > 12) {
    qualM -= 12;
    qualY += 1;
  }
  return `${qualY}-${String(qualM).padStart(2, '0')}`;
}

export function getMonthlyTotalCollection(
  account: AccountOpening,
  month: string, // YYYY-MM
  collections: CenterCollectionRecord[]
): number {
  const normalizedCode = account.account_code.trim().toLowerCase();
  const sum = collections
    .filter(c => 
      c.accountId && 
      c.accountId.trim().toLowerCase() === normalizedCode && 
      c.collectionDate.startsWith(month)
    )
    .reduce((sum, c) => sum + safeNum(c.amount), 0);
  
  if (sum === 0) {
    return safeNum(account.collection_amount);
  }
  return sum;
}

export function checkAccountBonusEligibility(
  account: AccountOpening,
  sheetMonth: string,
  collections: CenterCollectionRecord[],
  settings: {
    bonusEnabled: boolean;
    bonusDelayMonths: number;
    minimumMonthlyCollection: number;
  },
  context?: {
    employeeId?: string;
    branchId?: string;
    ignoreIsCounted?: boolean;
    employee?: Employee;
  }
): BonusEligibilityResult {
  const accountCode = account.account_code;
  const customerName = account.customer_name || 'Unknown';
  const collectionAmount = getMonthlyTotalCollection(account, sheetMonth, collections);
  const bookDuration = account.term;
  const bookStatus = account.status || 'ACTIVE';
  const minAmount = safeNum(settings.minimumMonthlyCollection);

  let eligible = true;
  let reason = "Amount >= 600";

  // 1. Closed Status Check
  if (bookStatus.toUpperCase() === 'CLOSED') {
    eligible = false;
    reason = "Account closed";
  }
  // 2. Blocked Status Check
  else if (bookStatus.toUpperCase() === 'BLOCKED') {
    eligible = false;
    reason = "Blocked account";
  }
  // Other invalid statuses
  else if (['CANCELLED', 'INACTIVE', 'TRANSFERRED', 'FROZEN'].includes(bookStatus.toUpperCase())) {
    eligible = false;
    reason = `Account status is ${bookStatus.toUpperCase()}`;
  }
  // 3. Book Completion / Counted check
  else if (!context?.ignoreIsCounted && account.is_counted) {
    eligible = false;
    reason = "Book already completed";
  }
  // 4. Book Duration term check
  else if (![1.5, 3, 5, 8, 10, 12].includes(bookDuration)) {
    eligible = false;
    reason = "Unsupported Book Term Duration";
  }
  // 5. Ownership verification (employee mismatch)
  else if (context?.employeeId) {
    const customerAgentCode = String(account.agentCode || account.opened_by_employee_id || '').trim();
    const customerAssignedEmployeeId = String(account.assignedEmployeeId || account.opened_by_employee_id || '').trim();
    const empCode = String(context.employee?.employeeCode || context.employeeId || '').trim();
    const empId = String(context.employee?.id || context.employeeId || '').trim();

    const belongsToEmployee = (customerAgentCode === empCode && empCode !== '') || 
                              (customerAssignedEmployeeId === empId && empId !== '');

    if (!belongsToEmployee) {
      console.log("Selected Employee:");
      console.log("- id:", context.employee?.id || context.employeeId);
      console.log("- employeeCode:", context.employee?.employeeCode || context.employeeId);
      console.log("- employeeName:", context.employee?.name || 'Unknown');
      console.log("- branch:", context.employee?.branch_id || context.branchId);
      console.log("- center:", 'N/A');

      console.log("Customer:");
      console.log("- assignedEmployeeId:", account.assignedEmployeeId || account.opened_by_employee_id);
      console.log("- agentCode:", account.agentCode || account.opened_by_employee_id);
      console.log("- agentName:", account.agent_name || 'Unknown');
      console.log("- branch:", account.branch_id);
      console.log("- center:", account.center_code);

      console.log("selectedEmployee:", context.employee || { id: context.employeeId });
      console.log("customerAgent:", account.opened_by_employee_id);
      console.log("comparisonField:", "agentCode / assignedEmployeeId");
      console.log("comparisonValue:", `${customerAgentCode} vs ${empCode} | ${customerAssignedEmployeeId} vs ${empId}`);
      console.log("comparisonResult:", false);

      eligible = false;
      reason = "Belongs to another employee";
    }
  }
  // 6. Branch verification
  else if (context?.branchId && account.branch_id !== context.branchId) {
    eligible = false;
    reason = "Branch mismatch";
  }
  // 7. Bonus configuration check
  else if (!settings.bonusEnabled) {
    eligible = false;
    reason = "Bonus disabled in settings";
  }
  // 8. Collection Amount Check
  else if (collectionAmount < minAmount) {
    eligible = false;
    reason = "Amount below minimum";
  }
  // 9. Time Window Check (Opening Month + bonusDelayMonths)
  else {
    const [openY, openM] = account.opening_date.split('-').map(Number);
    const [sheetY, sheetM] = sheetMonth.split('-').map(Number);
    const monthDiff = (sheetY - openY) * 12 + (sheetM - openM);

    if (monthDiff < 0) {
      eligible = false;
      reason = "Account opened after sheet month";
    } else if (monthDiff < settings.bonusDelayMonths) {
      eligible = false;
      reason = `Pending: ${settings.bonusDelayMonths - monthDiff} month(s) remaining for eligibility`;
    } else if (monthDiff > settings.bonusDelayMonths) {
      eligible = false;
      reason = "Bonus already received";
    }
  }

  // Print exact logs as specified in requirements
  console.log("Account:", accountCode);
  console.log("Amount:", collectionAmount);
  console.log("Minimum:", minAmount);
  console.log("Book:", bookDuration);
  console.log("Closed:", bookStatus.toUpperCase() === 'CLOSED');
  console.log("Blocked:", bookStatus.toUpperCase() === 'BLOCKED');
  console.log("BonusCompleted:", account.is_counted);
  console.log("Eligible:", eligible);
  console.log("Reason:", reason);

  return { eligible, reason };
}

export function getAccountsByEmployee(id: string, allAccounts: AccountOpening[]): AccountOpening[] {
  return allAccounts.filter(a => a.opened_by_employee_id === id);
}

export function validateAccount(
  code: string, 
  employeeId: string, 
  branchId: string, 
  sheetMonth: string, // YYYY-MM
  allAccounts: AccountOpening[],
  bonusSettings?: BonusSettings,
  collections: CenterCollectionRecord[] = []
): { ok: boolean; error?: string; account?: AccountOpening } {
  // Normalize input
  const normalizedCode = code.trim().toLowerCase();
  
  // Case-insensitive search in the provided list (live data)
  // SCOPED TO BRANCH: Now matching both Code AND Branch ID
  const ac = allAccounts.find(a => 
    a.account_code.toLowerCase() === normalizedCode && 
    a.branch_id === branchId
  );

  if (!ac) return { ok: false, error: "Account not found in this branch" };

  const settings = bonusSettings || {
    bonusEnabled: true,
    bonusDelayMonths: 1,
    minimumMonthlyCollection: 600
  };

  const res = checkAccountBonusEligibility(ac, sheetMonth, collections, settings, {
    employeeId,
    branchId
  });

  if (!res.eligible) {
    return { ok: false, error: res.reason, account: ac };
  }

  return { ok: true, account: ac };
}

// Deprecated in favor of state management in App.tsx, but kept for compatibility if needed elsewhere
export function markAccountAsCounted(code: string, salarySheetId: string, month: string): void {
  // Implementation moved to App.tsx state handler
}
