import React, { useState, useMemo } from 'react';
import { Loan, Branch, Employee, CenterCollectionRecord, AccountOpening } from '../types';
import { googleSheetService } from '../services/googleSheetService';
import { Plus, Search, FileText, CheckCircle, XCircle, Edit2 } from 'lucide-react';

interface LoansProps {
  loans: Loan[];
  branches: Branch[];
  employees: Employee[];
  collections: CenterCollectionRecord[];
  accounts: AccountOpening[];
  onAddLoan: (loan: Loan) => void;
  onUpdateLoan: (loan: Loan) => void;
  onAddCollection?: (record: Omit<CenterCollectionRecord, 'id' | 'createdAt'>) => void;
}

const Loans: React.FC<LoansProps> = ({ loans, branches, employees, collections, accounts, onAddLoan, onUpdateLoan, onAddCollection }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [payingLoan, setPayingLoan] = useState<Loan | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  const [formData, setFormData] = useState<Partial<Loan>>({
    memberId: '',
    memberName: '',
    loanAmount: 0,
    interest: 0,
    totalInstallments: 0,
    startDate: new Date().toISOString().split('T')[0],
    issuedBy: '',
    approvedBy: '',
    branchId: ''
  });

    const [payFormData, setPayFormData] = useState({
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      type: 'OWN' as 'OWN' | 'OFFICE',
      employeeId: '',
      branchId: '',
    });
  
    const openAddModal = () => {
    setEditingLoan(null);
    setFormData({
      memberId: '',
      memberName: '',
      loanAmount: 0,
      interest: 0,
      totalInstallments: 0,
      startDate: new Date().toISOString().split('T')[0],
      issuedBy: '',
      approvedBy: '',
      branchId: ''
    });
    setShowAddModal(true);
  };

  const openEditModal = (loan: Loan) => {
    setEditingLoan(loan);
    setFormData({
      memberId: loan.memberId,
      memberName: loan.memberName || '',
      loanAmount: loan.loanAmount,
      interest: loan.interest ? (loan.interest / loan.loanAmount) * 100 : 0,
      totalInstallments: loan.totalInstallments,
      startDate: loan.startDate,
      issuedBy: loan.issuedBy || '',
      approvedBy: loan.approvedBy || '',
      branchId: loan.branchId || ''
    });
    setShowAddModal(true);
  };

  const openPayModal = (loan: any) => {
    setPayingLoan(loan);
    setPayFormData({
      amount: loan.installmentAmount,
      date: new Date().toISOString().split('T')[0],
      type: 'OWN',
      employeeId: loan.issuedBy || '',
      branchId: loan.branchId || '',
    });
    setShowPayModal(true);
  };

  const calculatedInstallment = useMemo(() => {
    if (!formData.loanAmount || !formData.totalInstallments) return 0;
    const loanAmt = Number(formData.loanAmount);
    const interestRate = Number(formData.interest || 0);
    const totalInterest = loanAmt * (interestRate / 100);
    const total = loanAmt + totalInterest;
    return Math.ceil(total / Number(formData.totalInstallments));
  }, [formData.loanAmount, formData.interest, formData.totalInstallments]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const loanAmt = Number(formData.loanAmount);
    const interestRate = Number(formData.interest || 0);
    const totalInterest = loanAmt * (interestRate / 100);

    if (editingLoan) {
      const updatedLoan: Loan = {
        ...editingLoan,
        memberId: formData.memberId!,
        memberName: formData.memberName || '',
        loanAmount: loanAmt,
        interest: totalInterest,
        totalInstallments: Number(formData.totalInstallments),
        installmentAmount: calculatedInstallment,
        dueAmount: loanAmt + totalInterest - (editingLoan.paidAmount || 0),
        startDate: formData.startDate!,
        issuedBy: formData.issuedBy,
        approvedBy: formData.approvedBy,
        branchId: formData.branchId
      };
      
      try {
        await googleSheetService.updateLoan(updatedLoan);
        onUpdateLoan(updatedLoan);
        setShowAddModal(false);
      } catch (error) {
        console.error("Error updating loan:", error);
        alert("Failed to update loan");
      }
    } else {
      const newLoan: Loan = {
        id: Date.now().toString(),
        memberId: formData.memberId!,
        memberName: formData.memberName || '',
        loanAmount: loanAmt,
        interest: totalInterest,
        totalInstallments: Number(formData.totalInstallments),
        installmentAmount: calculatedInstallment,
        paidAmount: 0,
        dueAmount: loanAmt + totalInterest,
        status: 'ACTIVE',
        startDate: formData.startDate!,
        issuedBy: formData.issuedBy,
        approvedBy: formData.approvedBy,
        branchId: formData.branchId
      };
      
      try {
        await googleSheetService.addLoan(newLoan);
        onAddLoan(newLoan);
        setShowAddModal(false);
      } catch (error) {
        console.error("Error adding loan:", error);
        alert("Failed to add loan");
      }
    }
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingLoan || !onAddCollection) return;

    const collectionRecord = {
      branchId: payFormData.branchId,
      employeeId: payFormData.employeeId,
      centerCode: parseInt(payingLoan.memberId) || 0,
      accountId: payingLoan.memberId,
      amount: 0,
      loanAmount: Number(payFormData.amount),
      type: payFormData.type,
      collectionDate: payFormData.date,
      submittedAt: new Date().toISOString()
    };

    try {
      // Create collection record
      await onAddCollection(collectionRecord);
      
      // Compute updated paid/due on the loan itself for consistency in DB:
      // Note: we use dynamicPaid + new amount because dynamicPaid already reflects previous collections
      const newPaidAmount = (payingLoan as any).dynamicPaid + Number(payFormData.amount);
      const newDueAmount = (payingLoan.loanAmount + (payingLoan.interest || 0)) - newPaidAmount;
      
      const updatedLoan: Loan = {
        ...payingLoan,
        paidAmount: newPaidAmount,
        dueAmount: newDueAmount,
        status: newDueAmount <= 0 ? 'CLOSED' : 'ACTIVE'
      };
      
      await googleSheetService.updateLoan(updatedLoan);
      onUpdateLoan(updatedLoan);
      
      setShowPayModal(false);
    } catch (error) {
      console.error("Error submitting payment:", error);
      alert("Failed to process payment");
    }
  };

  // Calculate dynamic paid/due amounts
  const enrichedLoans = useMemo(() => {
    const filtered = loans.map(loan => {
      // Find all collections for this member
      const memberCollections = collections.filter(c => c.centerCode.toString() === loan.memberId || c.accountId === loan.memberId);
      const totalPaid = memberCollections.reduce((sum, c) => sum + (c.loanAmount || 0), 0);
      const totalDue = (loan.loanAmount + (loan.interest || 0)) - totalPaid;
      const installmentsPaid = loan.installmentAmount > 0 ? Math.floor(totalPaid / loan.installmentAmount) : 0;
      
      return {
        ...loan,
        dynamicPaid: totalPaid,
        dynamicDue: totalDue,
        installmentsPaid,
        installmentsRemaining: loan.totalInstallments - installmentsPaid
      };
    }).filter(l => {
      const matchesSearch = l.memberId.toLowerCase().includes(searchTerm.toLowerCase()) || l.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchesBranch = true;
      if (selectedBranch) {
        if (l.branchId) {
          matchesBranch = l.branchId === selectedBranch;
        } else {
          const account = accounts.find(a => a.account_code === l.memberId);
          matchesBranch = account ? account.branch_id === selectedBranch : false;
        }
      }

      let matchesEmployee = true;
      if (selectedEmployee) {
        matchesEmployee = l.issuedBy === selectedEmployee || l.approvedBy === selectedEmployee;
      }
      
      return matchesSearch && matchesBranch && matchesEmployee;
    });
    return filtered;
  }, [loans, collections, searchTerm, selectedBranch, selectedEmployee, accounts]);

  const metrics = useMemo(() => {
    let expected = 0;
    let collected = 0;
    let totalDueMembers = 0;
    let overdueInstallments = 0;
    let membersPaidInPeriod = 0;

    const getInstallmentsInPeriod = (startDateStr: string, filterStartStr: string, filterEndStr: string, totalInstallments: number) => {
      if (!filterStartStr && !filterEndStr) return 0;
      
      const startDate = new Date(startDateStr);
      const filterStart = filterStartStr ? new Date(filterStartStr) : new Date('2000-01-01');
      const filterEnd = filterEndStr ? new Date(filterEndStr) : new Date('2100-01-01');
      const isWeekly = totalInstallments > 24; // Heuristic: >24 installments is weekly, else monthly
      
      let count = 0;
      for (let i = 1; i <= totalInstallments; i++) {
        let instDate = new Date(startDate);
        if (isWeekly) {
          instDate.setDate(instDate.getDate() + (i * 7));
        } else {
          instDate.setMonth(instDate.getMonth() + i);
        }
        
        instDate.setHours(0, 0, 0, 0);
        filterStart.setHours(0, 0, 0, 0);
        filterEnd.setHours(0, 0, 0, 0);
        
        if (instDate >= filterStart && instDate <= filterEnd) {
          count++;
        }
      }
      return count;
    };

    enrichedLoans.forEach(loan => {
      // Consider a loan active if its status is ACTIVE or if it still has dues
      if (loan.status === 'ACTIVE' || loan.dynamicDue > 0) {
        if (filterStartDate || filterEndDate) {
          const installmentsInPeriod = getInstallmentsInPeriod(loan.startDate, filterStartDate, filterEndDate, loan.totalInstallments);
          expected += loan.installmentAmount * installmentsInPeriod;
          
          const memberCollections = collections.filter(c => 
            (c.centerCode.toString() === loan.memberId || c.accountId === loan.memberId) &&
            (!filterStartDate || c.collectionDate >= filterStartDate) &&
            (!filterEndDate || c.collectionDate <= filterEndDate)
          );
          
          const paidInPeriod = memberCollections.reduce((sum, c) => sum + (c.loanAmount || 0), 0);
          collected += paidInPeriod;
          
          if (paidInPeriod > 0) {
            membersPaidInPeriod++;
          }
        } else {
          expected += (loan.loanAmount + (loan.interest || 0));
          collected += loan.dynamicPaid;
        }

        if (loan.dynamicDue > 0) {
          totalDueMembers++;
          overdueInstallments += loan.installmentsRemaining;
        }
      }
    });

    return { expected, collected, totalDueMembers, overdueInstallments, membersPaidInPeriod };
  }, [enrichedLoans, collections, filterStartDate, filterEndDate]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Loan Management</h2>
        <button 
          onClick={openAddModal}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors"
        >
          <Plus size={20} />
          <span>Add Loan</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500 font-medium">Expected Collection</p>
          <p className="text-2xl font-bold text-slate-800">৳{metrics.expected.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500 font-medium">Actual Collected</p>
          <p className="text-2xl font-bold text-emerald-600">৳{metrics.collected.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500 font-medium">Members with Dues</p>
          <p className="text-2xl font-bold text-rose-600">{metrics.totalDueMembers}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500 font-medium">{(filterStartDate || filterEndDate) ? 'Members Paid' : 'Remaining Installments'}</p>
          <p className="text-2xl font-bold text-amber-600">{(filterStartDate || filterEndDate) ? metrics.membersPaidInPeriod : metrics.overdueInstallments}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4 flex-wrap">
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 flex-1 min-w-[200px]">
          <Search size={18} className="text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by Member ID..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-sm"
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
          >
            <option value="">All Branches</option>
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-48">
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
          >
            <option value="">All Field Officers</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
            title="Start Date"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
            title="End Date"
          />
          {(filterStartDate || filterEndDate) && (
            <button 
              onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}
              className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
              title="Clear Dates"
            >
              <XCircle size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
              <tr>
                <th className="p-4">Member ID</th>
                <th className="p-4">Member Name</th>
                <th className="p-4">Start Date</th>
                <th className="p-4">Disbursed Amount</th>
                <th className="p-4">Total Loan</th>
                <th className="p-4">Installment</th>
                <th className="p-4">Paid</th>
                <th className="p-4">Due</th>
                <th className="p-4">Issued By</th>
                <th className="p-4">Approved By</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrichedLoans.map(loan => (
                <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-medium text-slate-800">{loan.memberId}</td>
                  <td className="p-4 text-slate-600">{loan.memberName || '-'}</td>
                  <td className="p-4 text-slate-600">{loan.startDate}</td>
                  <td className="p-4 text-slate-800 font-medium">৳{loan.loanAmount.toLocaleString()}</td>
                  <td className="p-4 text-slate-800 font-medium">৳{(loan.loanAmount + (loan.interest || 0)).toLocaleString()}</td>
                  <td className="p-4 text-slate-600">
                    ৳{loan.installmentAmount.toLocaleString()} <br/>
                    <span className="text-xs text-slate-400">{loan.installmentsPaid} / {loan.totalInstallments} paid</span>
                  </td>
                  <td className="p-4 text-emerald-600 font-medium">৳{loan.dynamicPaid.toLocaleString()}</td>
                  <td className="p-4 text-rose-600 font-medium">৳{loan.dynamicDue.toLocaleString()}</td>
                  <td className="p-4 text-slate-600 text-xs">{employees.find(e => e.id === loan.issuedBy)?.name || loan.issuedBy || '-'}</td>
                  <td className="p-4 text-slate-600 text-xs">{employees.find(e => e.id === loan.approvedBy)?.name || loan.approvedBy || '-'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      loan.dynamicDue <= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {loan.dynamicDue <= 0 ? 'CLOSED' : 'ACTIVE'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => openPayModal(loan)}
                        className="text-emerald-600 hover:text-emerald-800 p-1 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors"
                        title="Pay EMI"
                      >
                        Pay EMI
                      </button>
                      <button 
                        onClick={() => openEditModal(loan)}
                        className="text-indigo-600 hover:text-indigo-800 p-1"
                        title="Edit Loan"
                      >
                        <Edit2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {enrichedLoans.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-500">
                    No loans found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">{editingLoan ? 'Edit Loan' : 'Add New Loan'}</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Member ID / Account Code</label>
                  <input 
                    type="text" required
                    value={formData.memberId}
                    onChange={(e) => {
                      const memberId = e.target.value;
                      const account = accounts.find(a => a.account_code === memberId);
                      setFormData({
                        ...formData, 
                        memberId,
                        memberName: account ? account.customer_name : formData.memberName
                      });
                    }}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Enter member ID"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Member Name</label>
                  <input 
                    type="text" required
                    value={formData.memberName || ''}
                    onChange={(e) => setFormData({...formData, memberName: e.target.value})}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Enter member name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Loan Amount</label>
                  <input 
                    type="number" required min="0"
                    value={formData.loanAmount || ''}
                    onChange={(e) => setFormData({...formData, loanAmount: Number(e.target.value)})}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Interest Rate (%)</label>
                  <input 
                    type="number" min="0" step="0.01"
                    value={formData.interest || ''}
                    onChange={(e) => setFormData({...formData, interest: Number(e.target.value)})}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Total Installments</label>
                  <input 
                    type="number" required min="1"
                    value={formData.totalInstallments || ''}
                    onChange={(e) => setFormData({...formData, totalInstallments: Number(e.target.value)})}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Installment Amount</label>
                  <input 
                    type="number" readOnly
                    value={calculatedInstallment}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                  <input 
                    type="date" required
                    value={formData.startDate}
                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Branch</label>
                  <select
                    value={formData.branchId || ''}
                    onChange={(e) => setFormData({...formData, branchId: e.target.value})}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  >
                    <option value="">Select Branch</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Issued By</label>
                  <select
                    value={formData.issuedBy || ''}
                    onChange={(e) => setFormData({...formData, issuedBy: e.target.value})}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Approved By</label>
                  <select
                    value={formData.approvedBy || ''}
                    onChange={(e) => setFormData({...formData, approvedBy: e.target.value})}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  {editingLoan ? 'Update Loan' : 'Save Loan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPayModal && payingLoan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">Pay Installment</h3>
              <button onClick={() => setShowPayModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={20} />
              </button>
            </div>
            <form onSubmit={handlePaySubmit} className="p-4 space-y-4">
              <div className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p><strong>Member ID:</strong> {payingLoan.memberId}</p>
                <p><strong>Name:</strong> {payingLoan.memberName || '-'}</p>
                <p><strong>Installment Amount:</strong> ৳{payingLoan.installmentAmount}</p>
                <p><strong>Remaining Dues:</strong> ৳{(payingLoan as any).dynamicDue}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Payment Amount (৳)</label>
                <input 
                  type="number" required min="1"
                  value={payFormData.amount || ''}
                  onChange={(e) => setPayFormData({...payFormData, amount: Number(e.target.value)})}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Payment Date</label>
                <input 
                  type="date" required
                  value={payFormData.date}
                  onChange={(e) => setPayFormData({...payFormData, date: e.target.value})}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Branch</label>
                  <select
                    value={payFormData.branchId}
                    onChange={(e) => setPayFormData({...payFormData, branchId: e.target.value})}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    required
                  >
                    <option value="">Select Branch</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                  <select
                    value={payFormData.type}
                    onChange={(e) => setPayFormData({...payFormData, type: e.target.value as 'OWN' | 'OFFICE'})}
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    required
                  >
                    <option value="OWN">Own (নিজের)</option>
                    <option value="OFFICE">Office (অফিস)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Collected By</label>
                <select
                  value={payFormData.employeeId}
                  onChange={(e) => setPayFormData({...payFormData, employeeId: e.target.value})}
                  className="w-full p-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  required
                >
                  <option value="">Select Field Officer</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Loans;
