import React, { useState, useEffect } from 'react';
import { BonusSettings } from '../types';
import { X, Save, Settings, Coins } from 'lucide-react';

interface BonusSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BonusSettings;
  onSave: (settings: BonusSettings) => Promise<void>;
}

export const BonusSettingsModal: React.FC<BonusSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave
}) => {
  const [enabled, setEnabled] = useState(settings.bonusEnabled);
  const [delayType, setDelayType] = useState<string>('1');
  const [customDelay, setCustomDelay] = useState<number>(3);
  const [minMonthlyCollection, setMinMonthlyCollection] = useState<number>(settings.minimumMonthlyCollection);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setEnabled(settings.bonusEnabled);
    setMinMonthlyCollection(settings.minimumMonthlyCollection);
    
    const delay = settings.bonusDelayMonths;
    if (delay >= 1 && delay <= 6) {
      setDelayType(delay.toString());
    } else {
      setDelayType('custom');
      setCustomDelay(delay);
    }
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const delayMonths = delayType === 'custom' ? customDelay : parseInt(delayType, 10);
      await onSave({
        bonusEnabled: enabled,
        bonusDelayMonths: delayMonths,
        minimumMonthlyCollection: minMonthlyCollection
      });
      onClose();
    } catch (e) {
      console.error("Failed to save bonus settings", e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300 border border-slate-100 ring-1 ring-black/5">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 flex justify-between items-center text-white">
          <div className="flex items-center space-x-3">
            <Settings className="w-5 h-5 text-indigo-100 animate-spin-slow" />
            <div>
              <h3 className="font-bold text-base tracking-tight">Bonus Settings</h3>
              <p className="text-indigo-100 text-[11px] mt-0.5">Configure system-wide book eligibility criteria</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSaveSubmit} className="p-6 space-y-5">
          
          {/* Toggle Enable Bonus */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">Enable Bonus Calculation</label>
              <span className="text-[11px] text-slate-500 mt-0.5 block">Toggle book eligibility & bonus payouts</span>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                enabled ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className={`space-y-4 transition-all duration-300 ${enabled ? 'opacity-100 pointer-events-auto' : 'opacity-40 pointer-events-none select-none'}`}>
            
            {/* Bonus Delay Option */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Bonus Delay (Months)</label>
              <select
                value={delayType}
                onChange={(e) => setDelayType(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-700"
              >
                <option value="1">1 Month</option>
                <option value="2">2 Months</option>
                <option value="3">3 Months</option>
                <option value="4">4 Months</option>
                <option value="5">5 Months</option>
                <option value="6">6 Months</option>
                <option value="custom">Custom...</option>
              </select>
            </div>

            {/* Custom Delay input */}
            {delayType === 'custom' && (
              <div className="space-y-1.5 p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100/50 animate-in slide-in-from-top-2 duration-200">
                <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider block">Custom Months Delay</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={customDelay}
                  onChange={(e) => setCustomDelay(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-bold text-slate-800"
                  placeholder="Enter months..."
                  required={delayType === 'custom'}
                />
              </div>
            )}

            {/* Minimum Monthly Collection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Minimum Monthly Collection</label>
              <div className="relative">
                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="number"
                  min="0"
                  value={minMonthlyCollection}
                  onChange={(e) => setMinMonthlyCollection(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                  placeholder="600"
                  required
                />
              </div>
            </div>

          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-lg text-sm active:scale-[0.98] transition-all text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-lg text-sm active:scale-[0.98] transition-all flex justify-center items-center space-x-2 shadow-md shadow-indigo-600/10 disabled:opacity-50"
            >
              <Save size={16} />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
