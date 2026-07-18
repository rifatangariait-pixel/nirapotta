import React, { useState, useMemo } from 'react';
import { DollarSign, TrendingUp, TrendingDown, CreditCard, Activity, PieChart, BarChart3, Download, Printer, Plus, X } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';
import { Branch, CenterCollectionRecord, Expense, ExpenseCategory, Loan } from '../types';

interface SummaryReportProps {
  month: string;
  branchId: string;
  branches: Branch[];
  collections: CenterCollectionRecord[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  loans: Loan[];
  onAddExpense: (expense: Expense) => Promise<void>;
  onAddCategory: (category: ExpenseCategory) => Promise<void>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const SummaryReport: React.FC<SummaryReportProps> = ({ 
  month, 
  branchId, 
  branches, 
  collections, 
  expenses, 
  expenseCategories,
  loans,
  onAddExpense,
  onAddCategory
}) => {
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  
  // Expense Form State
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(`${month}-01`);
  const [expCat, setExpCat] = useState('');
  const [expBranch, setExpBranch] = useState(branchId === 'all' ? (branches[0]?.id || '') : branchId);
  const [expNotes, setExpNotes] = useState('');
  
  // Category Form State
  const [newCatName, setNewCatName] = useState('');

  const data = useMemo(() => {
    // Filter by month and branch
    const filteredCollections = collections.filter(c => 
      c.collectionDate.startsWith(month) && 
      (branchId === 'all' || c.branchId === branchId)
    );
    
    const filteredExpenses = expenses.filter(e => 
      e.date.startsWith(month) && 
      (branchId === 'all' || e.branchId === branchId)
    );

    const filteredLoans = loans.filter(l => 
      l.startDate.startsWith(month)
      // If loans had branchId, we would filter by it here
    );

    let totalCollection = 0;
    let totalLoanGiven = 0;
    let totalProfit = 0; // Assuming 15% of collection is profit for this demo, or we could add a profit field
    
    filteredCollections.forEach(c => {
      totalCollection += c.amount;
    });

    filteredLoans.forEach(l => {
      totalLoanGiven += l.loanAmount;
    });

    totalProfit = Math.floor(totalCollection * 0.15); // Mock 15% profit

    const totalExpense = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const totalIncome = totalCollection + totalProfit;
    const netProfit = totalIncome - totalExpense;
    
    // Outstanding Loan = sum of dueAmount for all loans given up to the selected month
    const outstandingLoan = loans.filter(l => l.startDate <= `${month}-31`).reduce((sum, l) => {
      const memberCollections = collections.filter(c => 
        (c.centerCode.toString() === l.memberId || c.accountId === l.memberId) && 
        c.collectionDate <= `${month}-31`
      );
      const totalPaid = memberCollections.reduce((s, c) => s + (c.loanAmount || 0), 0);
      const due = (l.loanAmount + (l.interest || 0)) - totalPaid;
      return sum + Math.max(0, due);
    }, 0);

    // Daily Breakdown
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const dailyMap = new Map();
    
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${month}-${i.toString().padStart(2, '0')}`;
      dailyMap.set(dateStr, { date: dateStr, collection: 0, expense: 0 });
    }

    filteredCollections.forEach(c => {
      if (dailyMap.has(c.collectionDate)) {
        dailyMap.get(c.collectionDate).collection += c.amount;
      }
    });

    filteredExpenses.forEach(e => {
      if (dailyMap.has(e.date)) {
        dailyMap.get(e.date).expense += e.amount;
      }
    });

    // Expense by Category
    const expByCategory: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const catName = expenseCategories.find(c => c.id === e.categoryId)?.name || 'Unknown';
      expByCategory[catName] = (expByCategory[catName] || 0) + e.amount;
    });

    const expensePieData = Object.entries(expByCategory).map(([name, value]) => ({ name, value }));

    return {
      totalCollection,
      totalProfit,
      totalExpense,
      totalLoanGiven,
      totalIncome,
      netProfit,
      outstandingLoan,
      dailyBreakdown: Array.from(dailyMap.values()),
      expensePieData
    };
  }, [month, branchId, collections, expenses, expenseCategories]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(amount);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadExcel = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    
    // Summary Sheet
    const summaryData = [
      ['Financial Summary', `Month: ${month}`, `Branch: ${branchId === 'all' ? 'All Branches' : branches.find(b => b.id === branchId)?.name}`],
      [],
      ['Metric', 'Amount (BDT)'],
      ['Total Collection', data.totalCollection],
      ['Total Profit', data.totalProfit],
      ['Total Income', data.totalIncome],
      ['Total Expense', data.totalExpense],
      ['Net Profit', data.netProfit],
      ['Total Loan Given', data.totalLoanGiven],
      ['Outstanding Loan', data.outstandingLoan],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Daily Breakdown Sheet
    const dailyData = [['Date', 'Collection', 'Expense'], ...data.dailyBreakdown.map(d => [d.date, d.collection, d.expense])];
    const wsDaily = XLSX.utils.aoa_to_sheet(dailyData);
    XLSX.utils.book_append_sheet(wb, wsDaily, 'Daily Breakdown');

    XLSX.writeFile(wb, `Summary_Report_${month}.xlsx`);
  };

  const handleDownloadPDF = async () => {
    const printArea = document.getElementById('print-area');
    if (!printArea) {
      alert('Report area not found.');
      return;
    }

    try {
      // Temporarily ensure the element is visible and styled correctly for capture
      const originalStyle = printArea.style.cssText;
      printArea.style.backgroundColor = '#ffffff';
      printArea.style.padding = '20px';
      
      const reportActions = document.getElementById('report-actions');
      let originalActionsStyle = '';
      if (reportActions) {
        originalActionsStyle = reportActions.style.display;
        reportActions.style.display = 'none';
      }

      const printHeader = document.getElementById('print-header');
      let originalHeaderStyle = '';
      if (printHeader) {
        originalHeaderStyle = printHeader.style.display;
        printHeader.style.display = 'block';
      }

      // Scroll to top to prevent blank capture issues with html2canvas
      const originalScrollY = window.scrollY;
      window.scrollTo(0, 0);
      
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(printArea, {
        scale: 2, // High quality
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollY: 0
      });

      // Restore original state
      window.scrollTo(0, originalScrollY);
      printArea.style.cssText = originalStyle;
      if (reportActions) {
        reportActions.style.display = originalActionsStyle;
      }
      if (printHeader) {
        printHeader.style.display = originalHeaderStyle;
      }

      const imgData = canvas.toDataURL('image/png');
      
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`Summary_Report_${month}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF.');
    }
  };

  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expAmount || !expCat || !expBranch || !expDate) return;
    
    await onAddExpense({
      id: `exp_${Date.now()}`,
      amount: Number(expAmount),
      categoryId: expCat,
      branchId: expBranch,
      date: expDate,
      notes: expNotes
    });
    
    setShowExpenseModal(false);
    setExpAmount('');
    setExpNotes('');
  };

  const handleAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return;
    
    await onAddCategory({
      id: `cat_${Date.now()}`,
      name: newCatName
    });
    
    setShowCategoryModal(false);
    setNewCatName('');
  };

  const SummaryCard = ({ title, amount, icon: Icon, colorClass }: any) => (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
          <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
        </div>
      </div>
      <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
      <p className="text-2xl font-bold text-slate-800">{formatCurrency(amount)}</p>
    </div>
  );

  return (
    <>
      <style>
        {`
          @media print {
            body * {
              visibility: hidden;
            }
            #print-area, #print-area * {
              visibility: visible;
            }
            #print-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
            .print\\:hidden {
              display: none !important;
            }
          }
        `}
      </style>
      <div id="print-area" className="space-y-6 animate-in fade-in duration-300 print:m-0 print:p-0">
      <div id="report-actions" className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Financial Summary</h2>
          <p className="text-sm text-slate-500">Overview for {new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowExpenseModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            <Plus size={16} /> Add Expense
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium border border-slate-200">
            <Printer size={16} /> Print
          </button>
          <button onClick={handleDownloadExcel} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-100 transition-colors text-sm font-medium border border-emerald-200">
            <Download size={16} /> Excel
          </button>
          <button onClick={handleDownloadPDF} className="flex items-center gap-2 bg-rose-50 text-rose-700 px-4 py-2 rounded-lg hover:bg-rose-100 transition-colors text-sm font-medium border border-rose-200">
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      {/* Printable Header */}
      <div id="print-header" className="hidden print:block mb-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Financial Summary Report</h1>
        <p className="text-slate-600 mt-2">Month: {new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
        <p className="text-slate-600">Branch: {branchId === 'all' ? 'All Branches' : branches.find(b => b.id === branchId)?.name}</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-2">
        <SummaryCard title="Total Collection" amount={data.totalCollection} icon={DollarSign} colorClass="bg-blue-500" />
        <SummaryCard title="Total Income" amount={data.totalIncome} icon={TrendingUp} colorClass="bg-emerald-500" />
        <SummaryCard title="Total Expense" amount={data.totalExpense} icon={TrendingDown} colorClass="bg-rose-500" />
        <SummaryCard title="Net Profit" amount={data.netProfit} icon={Activity} colorClass="bg-indigo-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3">
        <SummaryCard title="Total Profit" amount={data.totalProfit} icon={PieChart} colorClass="bg-amber-500" />
        <SummaryCard title="Total Loan Given" amount={data.totalLoanGiven} icon={CreditCard} colorClass="bg-cyan-500" />
        <SummaryCard title="Outstanding Loan" amount={data.outstandingLoan} icon={BarChart3} colorClass="bg-violet-500" />
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ pageBreakInside: 'avoid' }}>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100 lg:col-span-2">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-800">Collection vs Expense (Daily)</h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyBreakdown} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCollection" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={(val) => val.split('-')[2]} axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `৳${val / 1000}k`} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), undefined]} />
                <Legend />
                <Area type="monotone" dataKey="collection" name="Collection" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCollection)" />
                <Area type="monotone" dataKey="expense" name="Expense" stroke="#f43f5e" fillOpacity={1} fill="url(#colorExpense)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-800">Expense by Category</h3>
          </div>
          <div className="h-80 w-full">
            {data.expensePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={data.expensePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {data.expensePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No expenses recorded
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Add New Expense</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddExpenseSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input type="date" required value={expDate} onChange={e => setExpDate(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Branch</label>
                <select required value={expBranch} onChange={e => setExpBranch(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                  <option value="">Select Branch</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-700">Category</label>
                  <button type="button" onClick={() => setShowCategoryModal(true)} className="text-xs text-blue-600 hover:underline">
                    + New Category
                  </button>
                </div>
                <select required value={expCat} onChange={e => setExpCat(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                  <option value="">Select Category</option>
                  {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (BDT)</label>
                <input type="number" required min="0" value={expAmount} onChange={e => setExpAmount(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                <textarea value={expNotes} onChange={e => setExpNotes(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" rows={2} placeholder="Expense details..." />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[60] p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">New Category</h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddCategorySubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category Name</label>
                <input type="text" required value={newCatName} onChange={e => setNewCatName(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="e.g. Office Rent" />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowCategoryModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default SummaryReport;
