import { useState } from 'react';

export default function QuickCalc() {
  const [open, setOpen] = useState(false);

  // Pcs ↔ Dz
  const [pcs, setPcs] = useState('');
  const [dz,  setDz]  = useState('');

  const onPcsChange = (v) => {
    setPcs(v);
    const n = parseFloat(v);
    setDz(isNaN(n) ? '' : (n / 12 % 1 === 0 ? String(n / 12) : (n / 12).toFixed(3).replace(/\.?0+$/, '')));
  };
  const onDzChange = (v) => {
    setDz(v);
    const n = parseFloat(v);
    setPcs(isNaN(n) ? '' : String(n * 12));
  };

  // Adder
  const [addText, setAddText] = useState('');
  const addNums = addText
    .split(/[\n,]+/)
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n));
  const addSum = addNums.reduce((s, n) => s + n, 0);

  const inputCls = 'w-full border border-gray-300 dark:border-[rgba(84,84,88,0.65)] rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-[#2C2C2E] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-right font-mono';

  return (
    <div className="border border-gray-200 dark:border-[rgba(84,84,88,0.65)] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-[#2C2C2E] hover:bg-gray-100 dark:hover:bg-[#3A3A3C] transition-colors text-left"
      >
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
          🧮 Quick Calculator
        </span>
        <span className="text-gray-400 dark:text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 bg-white dark:bg-[#1C1C1E] grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Pcs ↔ Dozen */}
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Pcs ↔ Dozen
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 dark:text-gray-500 font-medium block mb-0.5">Pcs</label>
                <input
                  type="number"
                  min="0"
                  value={pcs}
                  onChange={e => onPcsChange(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <span className="text-gray-400 dark:text-gray-500 text-sm mt-4 shrink-0">⇄</span>
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 dark:text-gray-500 font-medium block mb-0.5">Dozen</label>
                <input
                  type="number"
                  min="0"
                  value={dz}
                  onChange={e => onDzChange(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            </div>
            {pcs !== '' && dz !== '' && (
              <p className="text-[11px] text-blue-500 dark:text-[#0A84FF] mt-1.5">
                {pcs} pcs = {dz} dz
              </p>
            )}
          </div>

          {/* Qty Adder */}
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Qty Adder
            </p>
            <textarea
              value={addText}
              onChange={e => setAddText(e.target.value)}
              placeholder={'Enter numbers,\none per line or comma separated\ne.g. 12, 48, 36'}
              rows={4}
              className="w-full border border-gray-300 dark:border-[rgba(84,84,88,0.65)] rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-[#2C2C2E] dark:text-white dark:placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-none"
            />
            {addNums.length > 0 && (
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {addNums.length} number{addNums.length !== 1 ? 's' : ''}
                </span>
                <span className="text-sm font-bold text-green-700 dark:text-[#30D158]">
                  = {addSum % 1 === 0 ? addSum : addSum.toFixed(3).replace(/\.?0+$/, '')}
                </span>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
