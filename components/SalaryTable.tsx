import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { SalaryRow, SalaryEntry, AccountOpening, CommissionStructure, BonusSettings, CenterCollectionRecord } from '../types';
import { recalculateEntry } from '../services/logic';
import { validateAccount, getMonthlyTotalCollection, checkAccountBonusEligibility } from '../services/accountService';
import { calculateBonus } from '../services/salaryCalculation';
import { googleSheetService } from '../services/googleSheetService';
import { Lock, ScanBarcode, CheckCircle2, FileText, Download, Loader2, Coins, Search, Plus, X, User, Save } from 'lucide-react';
import SalarySlip from './SalarySlip';
import { downloadSinglePDF, createPDFBlob, saveZip } from '../services/pdfGenerator';

interface SalaryTableProps {
  rows: SalaryRow[];
  accounts: AccountOpening[];
  commissionRates: Record<string, CommissionStructure>;
  onUpdateRow: (updatedEntry: SalaryEntry) => void;
  onAccountScanned: (code: string) => void;
  onSaveScannedAccounts: (codes: string[]) => Promise<void>;
  readOnly?: boolean;
  month: string;
  bonusSettings?: BonusSettings;
  collections?: CenterCollectionRecord[];
}

const SalaryTableRow: React.FC<{
  row: SalaryRow;
  accounts: AccountOpening[];
  commissionRates: Record<string, CommissionStructure>;
  onUpdateRow: (updatedEntry: SalaryEntry) => void;
  onAccountScanned: (code: string) => void;
  onSaveScannedAccounts: (codes: string[]) => Promise<void>;
  readOnly: boolean;
  month: string;
  onGenerateSlip: (row: SalaryRow) => void;
  branchTotalCollection: number; // Passed from parent to help estimate incentive
  bonusSettings?: BonusSettings;
  collections?: CenterCollectionRecord[];
  onOpenOtherOpkModal?: (row: SalaryRow) => void;
}> = ({ row, accounts, commissionRates, onUpdateRow, onAccountScanned, onSaveScannedAccounts, readOnly, month, onGenerateSlip, branchTotalCollection, bonusSettings, collections = [], onOpenOtherOpkModal }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successField, setSuccessField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scannedCodes, setScannedCodes] = useState<string[]>([]);

  // Dynamic Scan Visual Highlights and Toast States
  const [scanStatus, setScanStatus] = useState<'idle' | 'success' | 'not-eligible' | 'error' | 'duplicate'>('idle');
  const [scanToast, setScanToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<any>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const playErrorSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime); // Low pitch error buzz
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn("AudioContext not supported or blocked by browser policy", e);
    }
  };

  const playSuccessSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime); // High pitch success chime
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn("AudioContext not supported or blocked by browser policy", e);
    }
  };

  const showToast = (message: string, type: 'success' | 'warning' | 'error' | 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setScanToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setScanToast(null);
    }, 3500);
  };

  const logOpkIncrease = (scannedCode: string, reason: string = "Invalid Account Number") => {
    try {
      const savedUser = localStorage.getItem('currentUser');
      const currentUser = savedUser ? JSON.parse(savedUser) : null;
      const createdBy = currentUser?.name || currentUser?.username || 'System';

      const now = new Date();
      const localDateStr = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD
      const localTimeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS

      const newLog = {
        employeeId: row.employee.id,
        employeeName: row.employee.name,
        scannedCode: scannedCode,
        date: localDateStr,
        time: localTimeStr,
        reason: reason,
        penaltyAmount: 300,
        createdBy: createdBy
      };

      const existingLogsStr = localStorage.getItem('multi_branch_opk_logs');
      const existingLogs = existingLogsStr ? JSON.parse(existingLogsStr) : [];
      existingLogs.push(newLog);
      localStorage.setItem('multi_branch_opk_logs', JSON.stringify(existingLogs));
      console.log("[OPK LOG] Saved:", newLog);
    } catch (err) {
      console.error("Failed to log OPK:", err);
    }
  };

  const logAuditScan = (scannedCode: string, result: string, foundAccount?: AccountOpening) => {
    try {
      const savedUser = localStorage.getItem('currentUser');
      const currentUser = savedUser ? JSON.parse(savedUser) : null;
      const createdBy = currentUser?.name || currentUser?.username || 'System';
      const ipUser = currentUser?.name || currentUser?.username || 'User';

      const now = new Date();
      const timestamp = now.toISOString();

      const newLog = {
        employeeId: row.employee.id,
        employeeName: row.employee.name,
        branch: row.branch.name,
        accountCode: scannedCode,
        bookType: foundAccount ? `Type ${foundAccount.term}Y` : 'N/A',
        bookDuration: foundAccount ? `${foundAccount.term} Years` : 'N/A',
        validationResult: result,
        timestamp: timestamp,
        ipUser: ipUser,
        createdBy: createdBy
      };

      const existingLogsStr = localStorage.getItem('multi_branch_audit_logs');
      const existingLogs = existingLogsStr ? JSON.parse(existingLogsStr) : [];
      existingLogs.push(newLog);
      localStorage.setItem('multi_branch_audit_logs', JSON.stringify(existingLogs));
      console.log("[AUDIT LOG] Saved:", newLog);
    } catch (err) {
      console.error("Failed to log audit:", err);
    }
  };

  const persistScanResult = async (updatedRow: SalaryEntry, accountCode: string, isScannedAccount: boolean) => {
    try {
      // 1. Save Salary Entry to Spreadsheet DB
      await googleSheetService.upsertSalaryEntry(updatedRow, month);
      
      // 2. Save Scanned Account if applicable
      if (isScannedAccount) {
         await onSaveScannedAccounts([accountCode]);
      }
      console.log(`[ScanPersist] Successfully auto-saved state for code: ${accountCode}`);
    } catch (err) {
      console.error("[ScanPersist] Error in background auto-save:", err);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
        console.log(`[SalaryTableRow] Saving row for ${row.employee.name}. Scanned codes:`, scannedCodes);

        // 1. Save Salary Entry
        await googleSheetService.upsertSalaryEntry(row, month);
        
        // 2. Save Scanned Accounts Status
        if (scannedCodes.length > 0) {
            await onSaveScannedAccounts(scannedCodes);
            setScannedCodes([]); // Clear pending codes after successful save
        } else {
            console.log("[SalaryTableRow] No scanned codes to save.");
        }

        setSuccessField('save');
        setTimeout(() => setSuccessField(null), 2000);
    } catch (e) {
        console.error("Failed to save:", e);
        setError("Failed to save");
    } finally {
        setIsSaving(false);
    }
  };

  const handleInputChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>, 
    field: keyof SalaryEntry
  ) => {
    if (readOnly) return;
    
    // Check if it's a number field or the string-based commission_type
    let value: string | number = e.target.value;
    if (field !== 'commission_type') {
       value = parseFloat(value as string) || 0;
    }
    
    const updatedEntry: SalaryEntry = {
      ...row,
      [field]: value
    };

    // Calculate with employee's commission type (prefer updated entry type, else fallback)
    const commTypeForCalc = (field === 'commission_type' ? (value as string) : row.commission_type) as string;
    
    // Determine context for Manager Incentive Recalculation (Local Estimate)
    const isManager = row.employee.designation === 'Branch Manager';
    
    // Adjust Branch Total if the edited field affects collection
    let effectiveBranchTotal = branchTotalCollection;
    if (field === 'center_collection') {
        const oldVal = row.center_collection || 0;
        const newVal = (value as number) || 0;
        effectiveBranchTotal = branchTotalCollection - oldVal + newVal;
    }

    const recalculate = recalculateEntry(
        updatedEntry, 
        row.employee.base_salary, 
        commissionRates,
        commTypeForCalc || row.employee.commission_type || 'A',
        { isManager, branchTotalCollection: effectiveBranchTotal }
    );
    onUpdateRow(recalculate);
  }, [row, onUpdateRow, readOnly, commissionRates, branchTotalCollection]);

  const handleCodeBlur = () => {
    if (!code.trim() || readOnly) return;

    const scannedCode = code.trim();
    const normalizedCode = scannedCode.toLowerCase();

    // STEP 1: Search the database for the scanned Account Code
    const foundAccount = accounts.find(a => a.account_code.toLowerCase() === normalizedCode);

    // --- CASE 1: ACCOUNT DOES NOT EXIST ---
    if (!foundAccount) {
      // Increase Book OPK count (misconductDeduction) by 1
      const newVal = (row.misconductDeduction || 0) + 1;
      const updatedEntry = { ...row, misconductDeduction: newVal };

      // Highlight the Scan Account field in red
      setScanStatus('error');
      playErrorSound();

      setError("❌ Invalid Account Number");
      showToast("❌ Invalid Account Number", 'error');

      // Log to OPK LOG
      logOpkIncrease(scannedCode, "Invalid Account Number");

      // Log to AUDIT LOG
      logAuditScan(scannedCode, 'Wrong Account');

      // Recalculate with existing commission type & context
      const isManager = row.employee.designation === 'Branch Manager';
      const recalculated = recalculateEntry(
          updatedEntry, 
          row.employee.base_salary, 
          commissionRates,
          row.commission_type || row.employee.commission_type || 'A',
          { isManager, branchTotalCollection }
      );
      onUpdateRow(recalculated);

      // Auto-save the OPK/misconduct increment to Google Sheets in background
      persistScanResult(recalculated, scannedCode, false);

      // Clear the Scan field automatically and Focus cursor back on the Scan field
      setCode('');
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
      return;
    }

    // --- INVALID STATUS CHECK ---
    const statusUpper = foundAccount.status?.toUpperCase() || 'ACTIVE';
    const invalidStatuses = ['CLOSED', 'CANCELLED', 'BLOCKED', 'INACTIVE', 'TRANSFERRED', 'FROZEN'];
    if (invalidStatuses.includes(statusUpper)) {
      setScanStatus('error');
      playErrorSound();
      setError(`❌ ${statusUpper} Account`);
      showToast(`❌ Account status is ${statusUpper}`, 'error');
      
      logAuditScan(scannedCode, `${statusUpper} Account`, foundAccount);

      setCode('');
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
      return;
    }

    // --- DUPLICATE PROTECTION ---
    const isDuplicate = scannedCodes.some(c => c.toLowerCase() === normalizedCode);
    if (isDuplicate) {
      setScanStatus('duplicate');
      playErrorSound();
      setError("Already Scanned");
      showToast("Already Scanned", 'info');
      logAuditScan(scannedCode, 'Duplicate', foundAccount);

      setCode('');
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
      return;
    }

    // --- CASE: DUPLICATE BONUS ATTEMPT / COMPLETED BONUS BOOK ---
    if (foundAccount.is_counted) {
      // Increase Book OPK by 1
      const newVal = (row.misconductDeduction || 0) + 1;
      const updatedEntry = { ...row, misconductDeduction: newVal };

      setScanStatus('error');
      playErrorSound();
      setError("❌ Duplicate Bonus Attempt");
      showToast("❌ Duplicate Bonus Attempt (Account Already Counted)", 'error');

      // Log to OPK LOG
      logOpkIncrease(scannedCode, "Duplicate Bonus Attempt");

      // Log to AUDIT LOG
      logAuditScan(scannedCode, 'Duplicate Bonus Attempt', foundAccount);

      const isManager = row.employee.designation === 'Branch Manager';
      const recalculated = recalculateEntry(
          updatedEntry, 
          row.employee.base_salary, 
          commissionRates,
          row.commission_type || row.employee.commission_type || 'A',
          { isManager, branchTotalCollection }
      );
      onUpdateRow(recalculated);

      // Save
      persistScanResult(recalculated, scannedCode, false);

      setCode('');
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
      return;
    }

    // --- CASE: WRONG BOOK / INVALID COMMISSION BOOK ---
    const term = parseFloat(String(foundAccount.term));
    const supportedTerms = [1.5, 3, 5, 8, 10, 12];
    if (!supportedTerms.includes(term)) {
      // Increase Book OPK by 1
      const newVal = (row.misconductDeduction || 0) + 1;
      const updatedEntry = { ...row, misconductDeduction: newVal };

      setScanStatus('error');
      playErrorSound();
      setError("❌ Invalid Commission Book");
      showToast("❌ Invalid Commission Book (Wrong Book Duration)", 'error');

      // Log to OPK LOG
      logOpkIncrease(scannedCode, "Wrong Book Duration");

      // Log to AUDIT LOG
      logAuditScan(scannedCode, 'Wrong Book', foundAccount);

      const isManager = row.employee.designation === 'Branch Manager';
      const recalculated = recalculateEntry(
          updatedEntry, 
          row.employee.base_salary, 
          commissionRates,
          row.commission_type || row.employee.commission_type || 'A',
          { isManager, branchTotalCollection }
      );
      onUpdateRow(recalculated);

      // Save
      persistScanResult(recalculated, scannedCode, false);

      setCode('');
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
      return;
    }

    // --- CASE 2: ACCOUNT EXISTS. DETERMINE BONUS ELIGIBILITY ---
    const settings = bonusSettings || {
      bonusEnabled: true,
      bonusDelayMonths: 1,
      minimumMonthlyCollection: 600
    };

    const eligibilityResult = checkAccountBonusEligibility(foundAccount, month, collections, settings, {
      employeeId: row.employee.id,
      branchId: row.branch.id,
      employee: row.employee
    });
    const isEligible = eligibilityResult.eligible;

    // --- CASE 3: ACCOUNT EXISTS BUT NOT BONUS ELIGIBLE ---
    if (!isEligible) {
      // Increase Book OPK count (misconductDeduction) by 1
      const newVal = (row.misconductDeduction || 0) + 1;
      const updatedEntry = { ...row, misconductDeduction: newVal };

      // Set yellow highlight
      setScanStatus('not-eligible');
      playErrorSound();
      setError(`⚠ Not Eligible: ${eligibilityResult.reason}`);
      showToast(`⚠ Not Eligible: ${eligibilityResult.reason}`, 'warning');
      
      // Log to OPK LOG
      logOpkIncrease(scannedCode, `Account Not Eligible: ${eligibilityResult.reason}`);

      // Log to AUDIT LOG
      logAuditScan(scannedCode, 'Not Eligible', foundAccount);

      // Call onAccountScanned so it records the scan status under No Bns or counted state
      onAccountScanned(foundAccount.account_code);
      setScannedCodes(prev => [...prev, foundAccount.account_code]);

      const isManager = row.employee.designation === 'Branch Manager';
      const recalculated = recalculateEntry(
          updatedEntry, 
          row.employee.base_salary, 
          commissionRates,
          row.commission_type || row.employee.commission_type || 'A',
          { isManager, branchTotalCollection }
      );
      onUpdateRow(recalculated);

      // Auto-save in background
      persistScanResult(recalculated, foundAccount.account_code, false);

      setCode('');
      setTimeout(() => {
        scanInputRef.current?.focus();
      }, 50);
      return;
    }

    // --- CASE 4: ACCOUNT EXISTS AND BONUS ELIGIBLE ---
    // Automatically detect Book Duration
    let field: keyof SalaryEntry | null = null;
    if (term === 1.5) field = 'book_1_5';
    else if (term === 3) field = 'book_3';
    else if (term === 5) field = 'book_5';
    else if (term === 8) field = 'book_8';
    else if (term === 10) field = 'book_10';
    else if (term === 12) field = 'book_12';

    if (field) {
      // Increase ONLY the matching book counter by +1
      const newVal = (row[field] as number) + 1;
      const updatedEntry = { ...row, [field]: newVal };

      // Track scanned code
      setScannedCodes(prev => [...prev, foundAccount.account_code]);
      onAccountScanned(foundAccount.account_code);

      // Recalculate with existing commission type & context
      const isManager = row.employee.designation === 'Branch Manager';
      const recalculated = recalculateEntry(
          updatedEntry, 
          row.employee.base_salary, 
          commissionRates,
          row.commission_type || row.employee.commission_type || 'A',
          { isManager, branchTotalCollection }
      );
      onUpdateRow(recalculated);

      // Auto-save the account status & salary entry in background
      persistScanResult(recalculated, foundAccount.account_code, true);

      setScanStatus('success');
      playSuccessSound();
      showToast("✅ Collection Added Successfully", 'success');
      logAuditScan(foundAccount.account_code, 'Eligible', foundAccount);

      setSuccessField(field);
      setTimeout(() => setSuccessField(null), 2000);
      setError(null);
    } else {
      setError("Unsupported Book Term Duration");
      showToast("Unsupported Book Term Duration", 'warning');
    }

    setCode('');
    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 50);
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  // UI STYLES
  const baseInputClass = "w-full py-2 px-2 text-sm text-center font-medium outline-none transition-all rounded-md";
  const editableInputClass = `${baseInputClass} bg-white border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm text-slate-800`;
  const readOnlyInputClass = `${baseInputClass} bg-[#E5E7EB] border border-[#E5E7EB] text-slate-500 cursor-not-allowed select-none`;
  const opokormoInputClass = `${editableInputClass} border-red-200 bg-red-50 text-red-700 focus:border-red-500 focus:ring-red-100 font-bold`;

  const countBox = (field: string) => `
    flex items-center justify-center h-9 text-xs font-bold rounded-md border
    ${successField === field 
      ? 'bg-green-100 text-green-700 border-green-300 scale-110 transition-transform shadow-md' 
      : 'bg-white text-slate-600 border-slate-200'}
  `;

  const rowClass = "border-b border-[#E5E7EB] hover:bg-blue-50 transition-colors group";

  // Commission Rates for Display
  const commType = row.commission_type || row.employee.commission_type || 'A';
  const rates = commissionRates[commType] || { own: 0, office: 0 };

  return (
    <tr className={rowClass}>
      {/* Employee Info - Sticky Left */}
      <td className="p-4 sticky left-0 bg-white z-10 border-r border-slate-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] min-w-[220px]">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <div>
               <span className="font-bold text-slate-800 text-base">{row.employee.name}</span>
               <div className="flex items-center gap-2 mt-0.5">
                 <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono">{row.employee.id}</span>
                 <span className="text-xs text-slate-500">{row.employee.designation}</span>
               </div>
               
               {/* EDITABLE COMMISSION TYPE */}
               <div className="mt-1.5 flex items-center gap-1.5">
                   {readOnly ? (
                       <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold bg-blue-50 text-blue-700 border-blue-200`}>
                          Type {commType}
                       </span>
                   ) : (
                       <select 
                          className="text-[10px] font-bold border border-slate-300 rounded py-0.5 px-1 bg-white focus:ring-1 focus:ring-blue-500 outline-none text-slate-700 cursor-pointer hover:border-blue-400 transition-colors shadow-sm"
                          value={commType}
                          onChange={(e) => handleInputChange(e, 'commission_type')}
                       >
                          {Object.keys(commissionRates).map(type => (
                              <option key={type} value={type}>Type {type}</option>
                          ))}
                       </select>
                   )}
                   <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                      (Own:{rates.own}%/Off:{rates.office}%)
                   </span>
               </div>
            </div>
            <button 
              onClick={() => onGenerateSlip(row)}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title="Generate Slip"
            >
              <FileText size={18} />
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className={`p-2 rounded-md transition-colors ${successField === 'save' ? 'text-green-600 bg-green-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
              title="Save Entry"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : (successField === 'save' ? <CheckCircle2 size={18} /> : <Save size={18} />)}
            </button>
          </div>
          
          <div className="flex items-center justify-between mt-1 pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Basic Pay</span>
            <input 
              disabled={readOnly}
              type="number" 
              className="w-24 py-1 px-2 text-sm font-bold text-right border border-slate-200 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-slate-700"
              value={row.basic_salary || 0} 
              onChange={(e) => handleInputChange(e, 'basic_salary')} 
            />
          </div>
        </div>
      </td>

      {/* --- GROUP: SOMITY & CENTER --- */}
      <td className="p-3 bg-[#F1F5F9] border-r border-slate-200/50">
        <input readOnly type="number" className={readOnlyInputClass} value={row.own_somity_count || 0} placeholder="-" />
      </td>
      <td className="p-3 bg-[#F1F5F9] border-r border-slate-200/50">
        <input readOnly type="number" className={readOnlyInputClass} value={row.own_somity_collection || 0} placeholder="-" />
      </td>
      
      <td className="p-3 bg-[#F1F5F9] border-r border-slate-200/50">
        <input readOnly type="number" className={readOnlyInputClass} value={row.office_somity_count || 0} placeholder="-" />
      </td>
      <td className="p-3 bg-[#F1F5F9] border-r border-slate-200/50">
        <input readOnly type="number" className={readOnlyInputClass} value={row.office_somity_collection || 0} placeholder="-" />
      </td>

      <td className="p-3 bg-[#fffbeb] border-r border-yellow-100">
        <input disabled={readOnly} type="number" className={editableInputClass} value={row.center_count || ''} onChange={(e) => handleInputChange(e, 'center_count')} placeholder="-" />
      </td>
      <td className="p-3 bg-[#fffbeb] border-r border-slate-200">
        <input disabled={readOnly} type="number" className={editableInputClass} value={row.center_collection || ''} onChange={(e) => handleInputChange(e, 'center_collection')} placeholder="-" />
      </td>

      {/* --- SCANNER --- */}
      <td className="p-3 bg-white border-r border-slate-200 min-w-[160px]">
        <div className="relative group/scan">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
             <ScanBarcode size={18} />
          </div>
          <input 
            ref={scanInputRef}
            disabled={readOnly}
            type="text" 
            autoComplete="off"
            className={`w-full pl-10 pr-3 py-2 text-sm border rounded-md outline-none transition-all font-mono shadow-sm
              ${scanStatus === 'success' 
                ? 'border-emerald-500 bg-emerald-50/50 text-emerald-800 focus:ring-2 focus:ring-emerald-100 focus:border-emerald-600' 
                : scanStatus === 'not-eligible'
                ? 'border-amber-500 bg-amber-50/50 text-amber-800 focus:ring-2 focus:ring-amber-100 focus:border-amber-600'
                : scanStatus === 'duplicate'
                ? 'border-indigo-500 bg-indigo-50/50 text-indigo-800 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600'
                : scanStatus === 'error'
                ? 'border-rose-500 bg-rose-50/50 text-rose-800 focus:ring-2 focus:ring-rose-100 focus:border-rose-600'
                : 'border-slate-300 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-slate-800'
              }`}
            value={code} 
            onChange={(e) => { 
              setCode(e.target.value); 
              setError(null);
              setScanStatus('idle'); // Clear highlight on typing
            }}
            onBlur={handleCodeBlur}
            onKeyDown={handleCodeKeyDown}
            placeholder="Scan Code" 
          />
        </div>
        {error && (
          <div className="absolute mt-1 bg-rose-600 text-white text-[10px] py-1 px-2 rounded shadow-md z-20 font-bold">
             {error}
          </div>
        )}

        {/* Dynamic Float Toast Overlay */}
        {scanToast && (
          <div 
            className={`fixed bottom-6 right-6 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-[100] transition-all transform duration-300 animate-bounce
              ${scanToast.type === 'success' ? 'bg-emerald-600 border border-emerald-500' : ''}
              ${scanToast.type === 'warning' ? 'bg-amber-500 border border-amber-400' : ''}
              ${scanToast.type === 'error' ? 'bg-rose-600 border border-rose-500' : ''}
              ${scanToast.type === 'info' ? 'bg-indigo-600 border border-indigo-500' : ''}
            `}
          >
            {scanToast.type === 'success' && <CheckCircle2 size={18} className="shrink-0 animate-pulse" />}
            {scanToast.type === 'warning' && <Coins size={18} className="shrink-0" />}
            {scanToast.type === 'error' && <X size={18} className="shrink-0 font-bold" />}
            {scanToast.type === 'info' && <CheckCircle2 size={18} className="shrink-0" />}
            <span className="font-bold text-sm tracking-tight">{scanToast.message}</span>
            <button 
              type="button" 
              onClick={() => setScanToast(null)} 
              className="ml-2 hover:bg-black/15 p-1 rounded-full transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </td>

      {/* --- GROUP: COMMISSIONABLE ITEMS --- */}
      <td className="p-3 bg-[#F8FAFC]"><div className={countBox('book_1_5')}>{row.book_1_5 || '-'}</div></td>
      <td className="p-3 bg-[#F8FAFC]"><div className={countBox('book_3')}>{row.book_3 || '-'}</div></td>
      <td className="p-3 bg-[#F8FAFC]"><div className={countBox('book_5')}>{row.book_5 || '-'}</div></td>
      <td className="p-3 bg-[#F8FAFC]"><div className={countBox('book_8')}>{row.book_8 || '-'}</div></td>
      <td className="p-3 bg-[#F8FAFC]"><div className={countBox('book_10')}>{row.book_10 || '-'}</div></td>
      <td className="p-3 bg-[#F8FAFC]"><div className={countBox('book_12')}>{row.book_12 || '-'}</div></td>
      
      <td className="p-3 bg-[#F8FAFC] border-r border-slate-200">
        <input disabled={readOnly} type="number" className={editableInputClass} value={row.book_no_bonus || ''} onChange={(e) => handleInputChange(e, 'book_no_bonus')} placeholder="-" />
      </td>

      {/* --- DEDUCTIONS --- */}
      <td className="p-3"><input disabled={readOnly} type="number" className={editableInputClass} value={row.deduction_cash_advance || ''} onChange={(e) => handleInputChange(e, 'deduction_cash_advance')} placeholder="-" /></td>
      
      <td className="p-3">
        <div className="relative">
          <input disabled={readOnly} type="number" className={editableInputClass} value={row.input_late_hours || ''} onChange={(e) => handleInputChange(e, 'input_late_hours')} placeholder="Hrs" />
          {row.deduction_late > 0 && <span className="absolute -bottom-4 left-0 w-full text-center text-[9px] text-red-500 font-bold">-${row.deduction_late.toFixed(0)}</span>}
        </div>
      </td>
      
      <td className="p-3">
         <div className="relative">
          <input disabled={readOnly} type="number" className={editableInputClass} value={row.input_absent_days || ''} onChange={(e) => handleInputChange(e, 'input_absent_days')} placeholder="Day" />
          {row.deduction_abs > 0 && <span className="absolute -bottom-4 left-0 w-full text-center text-[9px] text-red-500 font-bold">-${row.deduction_abs.toFixed(0)}</span>}
         </div>
      </td>
      
      <td className="p-3">
         <div className="relative">
           <input disabled={readOnly} type="number" className={opokormoInputClass} value={row.misconductDeduction || ''} onChange={(e) => handleInputChange(e, 'misconductDeduction')} placeholder="0" />
           {row.misconductDeduction > 0 && <span className="absolute -bottom-4 left-0 w-full text-center text-[9px] text-red-500 font-bold">-${(row.misconductDeduction * 300).toFixed(0)}</span>}
         </div>
      </td>
      
      <td className="p-3"><input disabled={readOnly} type="number" className={editableInputClass} value={row.deduction_unlawful || ''} onChange={(e) => handleInputChange(e, 'deduction_unlawful')} placeholder="-" /></td>
      <td className="p-3"><input disabled={readOnly} type="number" className={editableInputClass} value={row.deduction_tours || ''} onChange={(e) => handleInputChange(e, 'deduction_tours')} placeholder="-" /></td>
      <td className="p-3 border-r border-slate-200">
        <div className="flex flex-col gap-1 items-stretch">
          <div className="relative">
            <input disabled={readOnly} type="number" className={editableInputClass} value={row.deduction_others || ''} onChange={(e) => handleInputChange(e, 'deduction_others')} placeholder="-" />
          </div>
          {!readOnly && onOpenOtherOpkModal && (() => {
            const savedUser = localStorage.getItem('currentUser');
            const currentUser = savedUser ? JSON.parse(savedUser) : null;
            const isAdminOrHr = currentUser && ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'].includes(currentUser.role);
            if (!isAdminOrHr) return null;
            return (
              <button
                onClick={() => onOpenOtherOpkModal(row)}
                className="text-[9px] bg-red-100 hover:bg-red-200 text-red-700 font-bold py-0.5 px-1 rounded text-center transition-all cursor-pointer whitespace-nowrap select-none"
                title="Manage Manual Other OPK Penalties"
              >
                + Other OPK
              </button>
            );
          })()}
        </div>
      </td>

      {/* --- SUMMARY --- */}
      <td className="p-4 bg-amber-50 border-r border-amber-100">
        <div className="flex flex-col space-y-2">
          <div className="flex justify-between text-xs text-slate-600">
            <span>Books:</span>
            <span className="font-bold text-slate-900">{row.total_books}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-600">
            <span>Coll:</span>
            <span className="font-bold text-slate-900">${row.total_collection}</span>
          </div>
        </div>
      </td>

      {/* --- PAYOUT --- */}
      <td className="p-4 bg-emerald-50 min-w-[140px]">
        <div className="space-y-1 text-right">
           <div className="text-[10px] text-emerald-600 font-medium">
             +${(row.commission + row.bonus).toFixed(0)} Comm
           </div>
           {/* INCENTIVE DISPLAY */}
           {(row.manager_convenience || 0) > 0 && (
               <div className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1 rounded inline-block">
                 +${row.manager_convenience.toFixed(0)} Inc
               </div>
           )}
           <div className="text-[10px] text-red-500 font-medium">
             -${row.total_deductions.toFixed(0)} Ded
           </div>
           <div className="pt-2 border-t border-emerald-200 mt-1">
             <span className="text-lg font-bold text-emerald-700 block">${row.final_salary.toFixed(0)}</span>
           </div>
        </div>
      </td>
    </tr>
  );
};

const SalaryTable: React.FC<SalaryTableProps> = ({ rows, accounts, commissionRates, onUpdateRow, onAccountScanned, onSaveScannedAccounts, readOnly = false, month, bonusSettings, collections = [] }) => {
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [hiddenSlipData, setHiddenSlipData] = useState<SalaryRow | null>(null);

  // Center Entry and Logs Modal State
  const [isCenterModalOpen, setIsCenterModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState<'opk' | 'audit' | 'other_opk'>('opk');
  const [centerSearchTerm, setCenterSearchTerm] = useState('');
  const [centerAmount, setCenterAmount] = useState('');
  const [centerEntrySuccess, setCenterEntrySuccess] = useState<string | null>(null);
  const centerInputRef = useRef<HTMLInputElement>(null);
  const centerAmountRef = useRef<HTMLInputElement>(null);

  // Manual Other OPK states
  const [isOtherOpkModalOpen, setIsOtherOpkModalOpen] = useState(false);
  const [selectedEmployeeForOtherOpk, setSelectedEmployeeForOtherOpk] = useState<SalaryRow | null>(null);
  const [otherOpkCount, setOtherOpkCount] = useState(1);
  const [otherOpkRate, setOtherOpkRate] = useState(() => Number(localStorage.getItem('multi_branch_other_opk_rate') || '500'));
  const [otherOpkReason, setOtherOpkReason] = useState('Office Misconduct');
  const [otherOpkRemarks, setOtherOpkRemarks] = useState('');

  // Dynamic Branch Totals Calculation (Memoized from current rows state)
  const branchTotals = useMemo(() => {
      const totals: Record<string, number> = {};
      rows.forEach(r => {
          // Sum up all collections for this employee
          const total = (r.own_somity_collection || 0) + (r.office_somity_collection || 0) + (r.center_collection || 0) + (r.total_loan_collection || 0);
          totals[r.branch.id] = (totals[r.branch.id] || 0) + total;
      });
      return totals;
  }, [rows]);

  const handleGenerateSlip = async (row: SalaryRow) => {
    // Save to history before generating
    try {
        await googleSheetService.upsertSalaryEntry(row, month);
    } catch (e) {
        console.error("Failed to save salary record:", e);
    }

    setHiddenSlipData(row);
    setTimeout(async () => {
       await downloadSinglePDF('hidden-salary-slip', `Salary_Slip_${row.employee.name.replace(/\s+/g, '_')}_${month}`);
       setHiddenSlipData(null);
    }, 150);
  };

  const handleGenerateAllSlips = async () => {
    if (rows.length === 0) return;
    setIsBulkGenerating(true);

    // Save all records first
    try {
        await googleSheetService.upsertSalaryEntries(rows, month);
    } catch (e) {
        console.error("Failed to save salary records:", e);
        alert("Warning: Failed to save salary records to history. Download will continue.");
    }

    const blobs: { name: string; blob: Blob }[] = [];
    for (const row of rows) {
      setHiddenSlipData(row);
      await new Promise(resolve => setTimeout(resolve, 100));
      const blob = await createPDFBlob('hidden-salary-slip');
      if (blob) {
        const safeName = `${row.employee.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_slip.pdf`;
        blobs.push({ name: safeName, blob });
      }
    }
    if (blobs.length > 0) {
      await saveZip(blobs, `Salary_Slips_${month}`);
    } else {
      alert("Failed to generate slips. Please try again.");
    }
    setHiddenSlipData(null);
    setIsBulkGenerating(false);
  };

  const foundEmployeeRow = React.useMemo(() => {
    if (!centerSearchTerm.trim()) return null;
    const term = centerSearchTerm.trim().toLowerCase();
    return rows.find(r => r.employee.id.toLowerCase() === term);
  }, [centerSearchTerm, rows]);

  const handleCenterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundEmployeeRow || !centerAmount) return;
    const amount = parseFloat(centerAmount);
    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }
    const updatedEntry: SalaryEntry = {
        ...foundEmployeeRow,
        center_count: (foundEmployeeRow.center_count || 0) + 1,
        center_collection: (foundEmployeeRow.center_collection || 0) + amount
    };
    
    // Determine context
    const isManager = foundEmployeeRow.employee.designation === 'Branch Manager';
    // Calculate new total estimate (Current Total + Added Amount)
    const currentBranchTotal = branchTotals[foundEmployeeRow.branch.id] || 0;
    const newBranchTotal = currentBranchTotal + amount;

    // Recalculate logic including commission & incentive
    const recalculated = recalculateEntry(
        updatedEntry, 
        foundEmployeeRow.employee.base_salary,
        commissionRates,
        foundEmployeeRow.commission_type || foundEmployeeRow.employee.commission_type || 'A',
        { isManager, branchTotalCollection: newBranchTotal }
    );
    
    onUpdateRow(recalculated);
    setCenterEntrySuccess(`Added ${amount} to ${foundEmployeeRow.employee.name}`);
    setCenterAmount('');
    setCenterSearchTerm('');
    if (centerInputRef.current) centerInputRef.current.focus();
    setTimeout(() => setCenterEntrySuccess(null), 3000);
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl border border-dashed border-slate-300">
        <p className="text-slate-500 font-medium">No employees found for this sheet.</p>
        <p className="text-sm text-slate-400 mt-1">Add employees to the selected branch to get started.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#F8FAFC] rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full relative p-4">
      
      {/* Hidden Slip Render Container */}
      <div className="fixed top-0 left-0" style={{ zIndex: -1000, visibility: 'hidden' }}>
         {hiddenSlipData && (
            <div id="hidden-salary-slip" style={{ visibility: 'visible' }}>
               <SalarySlip row={hiddenSlipData} month={month} accounts={accounts} commissionRates={commissionRates} bonusSettings={bonusSettings} collections={collections} />
            </div>
         )}
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 p-3 flex justify-between items-center rounded-t-lg mb-4 shadow-sm">
         <div className="px-2 flex items-center space-x-3">
            {readOnly && (
                <div className="text-xs font-medium text-amber-700 flex items-center bg-amber-50 px-2 py-1 rounded">
                <Lock size={12} className="mr-1.5" />
                <span>Read-Only</span>
                </div>
            )}
            <button 
                onClick={() => { setIsCenterModalOpen(true); setTimeout(() => centerInputRef.current?.focus(), 100); }}
                className="flex items-center space-x-2 bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-yellow-200 transition-colors border border-yellow-200"
            >
                <Coins size={14} />
                <span>Center Entry</span>
            </button>
            <button 
                onClick={() => setIsLogsModalOpen(true)}
                className="flex items-center space-x-2 bg-rose-50 text-rose-700 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-rose-100 transition-colors border border-rose-200 shadow-sm"
            >
                <FileText size={14} className="text-rose-600" />
                <span>Scan Logs</span>
            </button>
         </div>

         <button 
            onClick={handleGenerateAllSlips}
            disabled={isBulkGenerating}
            className="flex items-center space-x-2 bg-slate-800 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-900 transition-colors disabled:opacity-70"
         >
            {isBulkGenerating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Download ZIP</span>
         </button>
      </div>
      
      {/* Modal ... */}
      {isCenterModalOpen && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-20 animate-in fade-in duration-200">
            <div className="bg-white w-96 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 ring-1 ring-slate-900/5">
                <div className="bg-gradient-to-r from-yellow-500 to-amber-500 p-4 flex justify-between items-center text-white">
                    <div className="flex items-center space-x-2">
                        <Coins size={20} className="text-yellow-100" />
                        <h3 className="font-bold">Center Collection Entry</h3>
                    </div>
                    <button onClick={() => setIsCenterModalOpen(false)} className="hover:bg-white/20 p-1 rounded transition-colors">
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleCenterSubmit} className="p-6 space-y-4">
                    {centerEntrySuccess && (
                        <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-xs font-bold flex items-center animate-in fade-in slide-in-from-top-1">
                            <CheckCircle2 size={16} className="mr-2" />
                            {centerEntrySuccess}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Employee ID Code</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input 
                                ref={centerInputRef}
                                type="text"
                                value={centerSearchTerm}
                                onChange={(e) => setCenterSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-lg focus:border-yellow-500 focus:ring-0 outline-none font-mono text-sm uppercase"
                                placeholder="Enter ID (e.g. E-101)"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className={`p-4 rounded-lg border transition-all ${foundEmployeeRow ? 'bg-indigo-50 border-indigo-100 opacity-100' : 'bg-slate-50 border-slate-100 opacity-50 grayscale'}`}>
                        {foundEmployeeRow ? (
                            <div className="flex items-start space-x-3">
                                <div className="p-2 bg-indigo-100 rounded-full text-indigo-600">
                                    <User size={20} />
                                </div>
                                <div>
                                    <p className="font-bold text-slate-800">{foundEmployeeRow.employee.name}</p>
                                    <p className="text-xs text-slate-500">{foundEmployeeRow.employee.designation}</p>
                                    <div className="mt-2 flex gap-3 text-xs">
                                        <div className="bg-white px-2 py-1 rounded border border-slate-200 text-slate-600">
                                            Count: <span className="font-bold text-indigo-600">{foundEmployeeRow.center_count || 0}</span>
                                        </div>
                                        <div className="bg-white px-2 py-1 rounded border border-slate-200 text-slate-600">
                                            Total: <span className="font-bold text-indigo-600">${foundEmployeeRow.center_collection || 0}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-xs text-slate-400 py-2">
                                Employee not found
                            </div>
                        )}
                    </div>
                    <div>
                         <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Collection Amount</label>
                         <div className="relative">
                             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                             <input 
                                ref={centerAmountRef}
                                type="number"
                                min="0"
                                disabled={!foundEmployeeRow}
                                value={centerAmount}
                                onChange={(e) => setCenterAmount(e.target.value)}
                                className="w-full pl-8 pr-4 py-2 border-2 border-slate-200 rounded-lg focus:border-yellow-500 focus:ring-0 outline-none font-bold text-slate-800 disabled:bg-slate-100"
                                placeholder="0.00"
                             />
                         </div>
                    </div>
                    <button 
                        type="submit"
                        disabled={!foundEmployeeRow || !centerAmount}
                        className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2.5 rounded-lg shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center space-x-2"
                    >
                        <Plus size={18} />
                        <span>Add Collection</span>
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* SCAN LOGS AND AUDIT VIEWER MODAL */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-10 animate-in fade-in duration-200">
            <div className="bg-white w-[750px] max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 ring-1 ring-slate-900/5 flex flex-col">
                <div className="bg-gradient-to-r from-rose-600 to-rose-700 p-4 flex justify-between items-center text-white">
                    <div className="flex items-center space-x-2">
                        <FileText size={20} className="text-rose-100" />
                        <h3 className="font-bold text-lg">Employee Collection Scan Logs</h3>
                    </div>
                    <button onClick={() => setIsLogsModalOpen(false)} className="hover:bg-white/20 p-1.5 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-slate-100 bg-slate-50 p-2">
                    <button 
                        onClick={() => setActiveLogTab('opk')}
                        className={`flex-1 py-2 px-3 text-center text-sm font-bold rounded-lg transition-colors flex items-center justify-center space-x-2
                          ${activeLogTab === 'opk' 
                            ? 'bg-rose-100 text-rose-700' 
                            : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                        <span>Scan Deductions (Book OPK Logs)</span>
                        <span className="bg-rose-200 text-rose-800 text-xs px-2 py-0.5 rounded-full font-bold">
                            {JSON.parse(localStorage.getItem('multi_branch_opk_logs') || '[]').length}
                        </span>
                    </button>
                    <button 
                        onClick={() => setActiveLogTab('other_opk')}
                        className={`flex-1 py-2 px-3 text-center text-sm font-bold rounded-lg transition-colors flex items-center justify-center space-x-2
                          ${activeLogTab === 'other_opk' 
                            ? 'bg-rose-100 text-rose-700' 
                            : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                        <span>Manual Penalties (Other OPK Logs)</span>
                        <span className="bg-rose-200 text-rose-800 text-xs px-2 py-0.5 rounded-full font-bold">
                            {JSON.parse(localStorage.getItem('multi_branch_other_opk_logs') || '[]').length}
                        </span>
                    </button>
                    <button 
                        onClick={() => setActiveLogTab('audit')}
                        className={`flex-1 py-2 px-3 text-center text-sm font-bold rounded-lg transition-colors flex items-center justify-center space-x-2
                          ${activeLogTab === 'audit' 
                            ? 'bg-rose-100 text-rose-700' 
                            : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                        <span>Scan Audit Trail</span>
                        <span className="bg-slate-200 text-slate-800 text-xs px-2 py-0.5 rounded-full font-bold">
                            {JSON.parse(localStorage.getItem('multi_branch_audit_logs') || '[]').length}
                        </span>
                    </button>
                </div>

                {/* Search Bar & Actions */}
                <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text"
                            placeholder="Search by employee name, ID or account code..."
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-rose-500 text-sm"
                            id="logs-search-input"
                            onChange={(e) => {
                              const val = e.target.value.toLowerCase();
                              const rows = document.querySelectorAll('.log-row');
                              rows.forEach(row => {
                                const text = row.textContent?.toLowerCase() || '';
                                if (text.includes(val)) {
                                  row.classList.remove('hidden');
                                } else {
                                  row.classList.add('hidden');
                                }
                              });
                            }}
                        />
                    </div>
                    <button
                        onClick={() => {
                          let label = 'Audit';
                          let key = 'multi_branch_audit_logs';
                          if (activeLogTab === 'opk') {
                            label = 'Opk';
                            key = 'multi_branch_opk_logs';
                          } else if (activeLogTab === 'other_opk') {
                            label = 'Other Opk';
                            key = 'multi_branch_other_opk_logs';
                          }
                          if (confirm(`Are you sure you want to clear all ${label} logs?`)) {
                            localStorage.removeItem(key);
                            // Trigger state update to re-render
                            setActiveLogTab(activeLogTab); 
                          }
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-3 rounded-lg transition-colors"
                    >
                        Clear Logs
                    </button>
                </div>

                {/* Log List View */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50 custom-scrollbar">
                    {activeLogTab === 'opk' ? (
                      (() => {
                        const logs = JSON.parse(localStorage.getItem('multi_branch_opk_logs') || '[]').reverse();
                        if (logs.length === 0) {
                          return (
                            <div className="text-center py-12 text-slate-400 text-sm">
                              No wrong operation logs found.
                            </div>
                          );
                        }
                        return (
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                  <th className="p-3">Employee</th>
                                  <th className="p-3">Scanned Code</th>
                                  <th className="p-3">Date / Time</th>
                                  <th className="p-3">Reason</th>
                                  <th className="p-3">Recorded By</th>
                                </tr>
                              </thead>
                              <tbody>
                                {logs.map((log: any, idx: number) => (
                                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 log-row">
                                    <td className="p-3 font-bold text-slate-800">{log.employeeName} <span className="font-mono text-slate-400 font-normal">({log.employeeId})</span></td>
                                    <td className="p-3 font-mono text-rose-600 font-bold bg-rose-50/30">{log.scannedCode}</td>
                                    <td className="p-3 text-slate-500 font-medium">{log.date} at {log.time}</td>
                                    <td className="p-3"><span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold text-[10px]">{log.reason}</span></td>
                                    <td className="p-3 text-slate-600">{log.createdBy}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()
                    ) : activeLogTab === 'other_opk' ? (
                      (() => {
                        const logs = JSON.parse(localStorage.getItem('multi_branch_other_opk_logs') || '[]').reverse();
                        if (logs.length === 0) {
                          return (
                            <div className="text-center py-12 text-slate-400 text-sm">
                              No manual penalty logs found.
                            </div>
                          );
                        }
                        return (
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                  <th className="p-3">Employee</th>
                                  <th className="p-3">Reason</th>
                                  <th className="p-3">Remarks</th>
                                  <th className="p-3">Deduction</th>
                                  <th className="p-3">Date / Time</th>
                                  <th className="p-3">Recorded By</th>
                                </tr>
                              </thead>
                              <tbody>
                                {logs.map((log: any, idx: number) => (
                                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 log-row">
                                    <td className="p-3 font-bold text-slate-800">{log.employeeName} <span className="font-mono text-slate-400 font-normal">({log.employeeId})</span></td>
                                    <td className="p-3 font-bold text-red-600 bg-red-50/20">{log.reason}</td>
                                    <td className="p-3 text-slate-500 max-w-[200px] truncate" title={log.remarks}>{log.remarks || '-'}</td>
                                    <td className="p-3 font-bold text-red-800">৳{log.totalDeduction.toLocaleString()} <span className="text-slate-400 font-normal">({log.penaltyCount} × ৳{log.penaltyRate})</span></td>
                                    <td className="p-3 text-slate-500 font-medium">{log.date} at {log.time}</td>
                                    <td className="p-3 text-slate-600 font-medium">{log.createdBy}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()
                    ) : (
                      (() => {
                        const logs = JSON.parse(localStorage.getItem('multi_branch_audit_logs') || '[]').reverse();
                        if (logs.length === 0) {
                          return (
                            <div className="text-center py-12 text-slate-400 text-sm">
                              No audit trail logs found.
                            </div>
                          );
                        }
                        return (
                          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                  <th className="p-3">Employee</th>
                                  <th className="p-3 font-semibold text-slate-500">Account Code</th>
                                  <th className="p-3">Book Type</th>
                                  <th className="p-3">Result</th>
                                  <th className="p-3">Timestamp</th>
                                  <th className="p-3">User/IP</th>
                                </tr>
                              </thead>
                              <tbody>
                                {logs.map((log: any, idx: number) => (
                                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 log-row">
                                    <td className="p-3 font-bold text-slate-800">{log.employeeName || log.employee} <span className="font-mono text-slate-400 font-normal">({log.employeeId})</span></td>
                                    <td className="p-3 font-mono font-bold text-slate-600">{log.accountCode}</td>
                                    <td className="p-3 text-slate-500 font-medium">{log.bookType || 'N/A'}</td>
                                    <td className="p-3">
                                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px]
                                        ${log.validationResult === 'Success' || log.validationResult === 'Eligible' ? 'bg-emerald-100 text-emerald-800' : ''}
                                        ${log.validationResult === 'Not Eligible' ? 'bg-amber-100 text-amber-800' : ''}
                                        ${log.validationResult === 'Duplicate' ? 'bg-indigo-100 text-indigo-800' : ''}
                                        ${log.validationResult === 'Invalid' || log.validationResult === 'Wrong Account' || log.validationResult.includes('Account') ? 'bg-rose-100 text-rose-800' : ''}
                                        ${!['Success', 'Eligible', 'Not Eligible', 'Duplicate', 'Invalid', 'Wrong Account'].includes(log.validationResult) ? 'bg-slate-100 text-slate-800' : ''}
                                      `}>
                                        {log.validationResult}
                                      </span>
                                    </td>
                                    <td className="p-3 text-slate-500 font-mono">{new Date(log.timestamp).toLocaleString()}</td>
                                    <td className="p-3 text-slate-600 font-medium">{log.ipUser}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()
                    )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button 
                        onClick={() => setIsLogsModalOpen(false)}
                        className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-6 rounded-lg text-sm shadow transition-colors"
                    >
                        Close Logs
                    </button>
                </div>
            </div>
        </div>
      )}
      
      {/* MAIN TABLE AREA */}
      <div className="overflow-x-auto custom-scrollbar flex-1 bg-white rounded-lg shadow-inner border border-slate-200">
        <table className="w-full text-left border-collapse">
          <thead>
            {/* Top Level Headers with Group Backgrounds */}
            <tr className="text-slate-700 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
              <th className="p-4 sticky left-0 bg-white z-20 shadow-[2px_0_5px_-4px_rgba(0,0,0,0.1)] min-w-[200px]">Employee</th>
              
              {/* Somity & Center Group - #F1F5F9 */}
              <th className="p-3 text-center border-r border-slate-200 bg-[#F1F5F9]" colSpan={6}>Somity & Center Collection</th>
              
              {/* Scan - White */}
              <th className="p-3 bg-white border-r border-slate-200"></th>

              {/* Books Group - #F8FAFC */}
              <th className="p-3 text-center border-r border-slate-200 bg-[#F8FAFC]" colSpan={8}>Commissionable Items (Books)</th>
              
              {/* Deductions Group - White/Light Red */}
              <th className="p-3 text-center border-r border-slate-200 bg-red-50/20" colSpan={7}>Deductions</th>
              
              <th className="p-3 text-center border-r border-slate-200 bg-amber-50 min-w-[100px]">Summary</th>
              <th className="p-3 text-center bg-emerald-50 min-w-[140px]">Payout</th>
            </tr>
            
            {/* Sub Headers with Group Backgrounds */}
            <tr className="text-[11px] font-semibold text-slate-500 border-b border-slate-200">
              <th className="p-3 sticky left-0 bg-white z-20 shadow-[2px_0_5px_-4px_rgba(0,0,0,0.1)]">Details & Contract</th>
              
              {/* Somity - #F1F5F9 */}
              <th className="p-3 text-center min-w-[70px] bg-[#F1F5F9]">Own #</th>
              <th className="p-3 text-center min-w-[90px] border-r border-slate-200 bg-[#F1F5F9]">Own $</th>
              <th className="p-3 text-center min-w-[70px] bg-[#F1F5F9]">Off #</th>
              <th className="p-3 text-center min-w-[90px] border-r border-slate-200 bg-[#F1F5F9]">Off $</th>

              {/* Center - Highlighted */}
              <th className="p-3 text-center min-w-[70px] bg-[#fffbeb] text-yellow-800">Center #</th>
              <th className="p-3 text-center min-w-[90px] border-r border-slate-200 bg-[#fffbeb] text-yellow-800">Center $</th>

              {/* Scanner */}
              <th className="p-3 text-left min-w-[160px] bg-white border-r border-slate-200 pl-4">
                 Scan Account Code
              </th>

              {/* Books - #F8FAFC */}
              <th className="p-3 text-center min-w-[50px] bg-[#F8FAFC]">1.5</th>
              <th className="p-3 text-center min-w-[50px] bg-[#F8FAFC]">3</th>
              <th className="p-3 text-center min-w-[50px] bg-[#F8FAFC]">5</th>
              <th className="p-3 text-center min-w-[50px] bg-[#F8FAFC]">8</th>
              <th className="p-3 text-center min-w-[50px] bg-[#F8FAFC]">10</th>
              <th className="p-3 text-center min-w-[50px] bg-[#F8FAFC]">12</th>
              
              <th className="p-3 text-center min-w-[60px] border-r border-slate-200 bg-[#F8FAFC]">No Bns</th>

              {/* Deductions */}
              <th className="p-3 text-center min-w-[70px] bg-white">Adv.</th>
              <th className="p-3 text-center min-w-[70px] bg-white">Late</th>
              <th className="p-3 text-center min-w-[70px] bg-white">Abs</th>
              <th className="p-3 text-center min-w-[70px] bg-red-50 text-red-700">Opk.</th>
              <th className="p-3 text-center min-w-[70px] bg-white">Unlaw</th>
              <th className="p-3 text-center min-w-[70px] bg-white">Tour</th>
              <th className="p-3 text-center min-w-[70px] border-r border-slate-200 bg-white">Other</th>

              <th className="p-3 text-center bg-amber-50">Totals</th>
              <th className="p-3 text-center bg-emerald-50">Calculated</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {rows.map((row) => (
              <SalaryTableRow 
                key={row.employee_id} 
                row={row} 
                accounts={accounts}
                commissionRates={commissionRates}
                onUpdateRow={onUpdateRow} 
                onAccountScanned={onAccountScanned}
                onSaveScannedAccounts={onSaveScannedAccounts}
                readOnly={readOnly}
                month={month}
                onGenerateSlip={handleGenerateSlip}
                branchTotalCollection={branchTotals[row.branch.id] || 0} // Passing context
                bonusSettings={bonusSettings}
                collections={collections}
                onOpenOtherOpkModal={(r) => {
                  setSelectedEmployeeForOtherOpk(r);
                  setOtherOpkCount(1);
                  setOtherOpkReason('Office Misconduct');
                  setOtherOpkRemarks('');
                  setOtherOpkRate(Number(localStorage.getItem('multi_branch_other_opk_rate') || '500'));
                  setIsOtherOpkModalOpen(true);
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* OTHER OPK MANUAL ENTRY MODAL */}
      {isOtherOpkModalOpen && selectedEmployeeForOtherOpk && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-20 animate-in fade-in duration-200">
            <div className="bg-white w-[480px] rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 ring-1 ring-slate-900/5">
                <div className="bg-gradient-to-r from-red-600 to-rose-600 p-4 flex justify-between items-center text-white">
                    <div className="flex items-center space-x-2">
                        <Coins size={20} className="text-red-100" />
                        <h3 className="font-bold">Manual Other OPK Penalty Entry</h3>
                    </div>
                    <button onClick={() => setIsOtherOpkModalOpen(false)} className="hover:bg-white/20 p-1 rounded transition-colors">
                        <X size={18} />
                    </button>
                </div>
                
                <div className="p-6 space-y-4">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                        <span className="block font-bold text-slate-700">Employee: {selectedEmployeeForOtherOpk.employee.name}</span>
                        <span className="block text-slate-500 font-mono">ID: {selectedEmployeeForOtherOpk.employee.id} • Designation: {selectedEmployeeForOtherOpk.employee.designation}</span>
                        <span className="block text-slate-500">Current Other Deduction: ৳{selectedEmployeeForOtherOpk.deduction_others || 0}</span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason for Penalty</label>
                        <select 
                            value={otherOpkReason}
                            onChange={(e) => setOtherOpkReason(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-800 focus:outline-none focus:border-red-500 cursor-pointer"
                        >
                            <option value="Office Misconduct">Office Misconduct</option>
                            <option value="Customer Complaint">Customer Complaint</option>
                            <option value="Rule Violation">Rule Violation</option>
                            <option value="Discipline Issue">Discipline Issue</option>
                            <option value="Late Office Work">Late Office Work</option>
                            <option value="Manual Penalty">Manual Penalty</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Penalty Count</label>
                            <input 
                                type="number"
                                min="1"
                                value={otherOpkCount}
                                onChange={(e) => setOtherOpkCount(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:border-red-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Penalty Rate (BDT)</label>
                            <input 
                                type="number"
                                min="0"
                                value={otherOpkRate}
                                onChange={(e) => {
                                  const rate = Math.max(0, parseInt(e.target.value) || 0);
                                  setOtherOpkRate(rate);
                                  localStorage.setItem('multi_branch_other_opk_rate', String(rate));
                                }}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:border-red-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Remarks / Details</label>
                        <textarea 
                            value={otherOpkRemarks}
                            onChange={(e) => setOtherOpkRemarks(e.target.value)}
                            placeholder="Add detailed explanation of the incident..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-red-500 h-20 resize-none"
                        />
                    </div>

                    <div className="bg-red-50 p-3 rounded-lg border border-red-100 flex justify-between items-center text-sm">
                        <span className="font-bold text-red-800">Total Deduction BDT:</span>
                        <span className="font-bold text-red-800 text-lg font-mono">৳{(otherOpkCount * otherOpkRate).toLocaleString()}</span>
                    </div>

                    <div className="flex justify-end space-x-3 pt-2">
                        <button 
                            onClick={() => setIsOtherOpkModalOpen(false)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={async () => {
                              // Perform the update
                              const totalDeduction = otherOpkCount * otherOpkRate;
                              const updatedEntry: SalaryEntry = {
                                ...selectedEmployeeForOtherOpk,
                                deduction_others: totalDeduction
                              };

                              // Recalculate
                              const isManager = selectedEmployeeForOtherOpk.employee.designation === 'Branch Manager';
                              const recalculated = recalculateEntry(
                                updatedEntry, 
                                selectedEmployeeForOtherOpk.employee.base_salary, 
                                commissionRates,
                                selectedEmployeeForOtherOpk.commission_type || selectedEmployeeForOtherOpk.employee.commission_type || 'A',
                                { isManager, branchTotalCollection: branchTotals[selectedEmployeeForOtherOpk.branch.id] || 0 }
                              );

                              // Update in parent
                              onUpdateRow(recalculated);

                              // Save to database
                              await googleSheetService.upsertSalaryEntry(recalculated, month);

                              // Log the Other OPK addition
                              try {
                                const savedUser = localStorage.getItem('currentUser');
                                const currentUser = savedUser ? JSON.parse(savedUser) : null;
                                const createdBy = currentUser?.name || currentUser?.username || 'System';

                                const now = new Date();
                                const localDateStr = now.toLocaleDateString('sv-SE');
                                const localTimeStr = now.toTimeString().split(' ')[0];

                                const newLog = {
                                  employeeId: selectedEmployeeForOtherOpk.employee.id,
                                  employeeName: selectedEmployeeForOtherOpk.employee.name,
                                  reason: otherOpkReason,
                                  remarks: otherOpkRemarks,
                                  penaltyCount: otherOpkCount,
                                  penaltyRate: otherOpkRate,
                                  totalDeduction: totalDeduction,
                                  date: localDateStr,
                                  time: localTimeStr,
                                  createdBy: createdBy
                                };

                                const existingLogsStr = localStorage.getItem('multi_branch_other_opk_logs');
                                const existingLogs = existingLogsStr ? JSON.parse(existingLogsStr) : [];
                                existingLogs.push(newLog);
                                localStorage.setItem('multi_branch_other_opk_logs', JSON.stringify(existingLogs));
                              } catch (err) {
                                console.error("Failed to log manual OPK:", err);
                              }

                              // Close modal
                              setIsOtherOpkModalOpen(false);
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg text-sm shadow transition-all active:scale-[0.98]"
                        >
                            Save Penalty
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default SalaryTable;