import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRCode } from 'react-qr-code';

/* ─── Barcode renderer ──────────────────────────────────────────────── */
function Barcode({ value }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    import('jsbarcode').then(mod => {
      const JsBarcode = mod.default || mod;
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128', width: 1.4, height: 28,
          displayValue: true, fontSize: 7, textMargin: 1,
          margin: 0, background: '#ffffff', lineColor: '#000000',
        });
        if (ref.current) {
          ref.current.removeAttribute('width');
          ref.current.removeAttribute('height');
          ref.current.style.width = '100%';
          ref.current.style.height = 'auto';
        }
      } catch (e) { console.warn('Barcode error:', e); }
    });
  }, [value]);

  return <svg ref={ref} style={{ display: 'block', width: '100%' }} />;
}

/* ─── One 34×20 mm label ────────────────────────────────────────────── */
function StickerLabel({ product, supplier }) {
  const supplierCode = supplier
    ? supplier.name.replace(/\s+/g, '').slice(0, 8).toUpperCase()
    : '—';

  const qrValue = `CODE:${product.sku}|NAME:${product.name}|WS:${product.pricing?.wholesale || 0}|SH:${product.pricing?.shop || 0}|SUP:${supplierCode}`;

  return (
    <div
      className="label-sticker"
      style={{
        width: '34mm', height: '20mm', boxSizing: 'border-box',
        border: '0.3mm solid #bbb', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', backgroundColor: '#fff', fontFamily: 'Arial, sans-serif',
        padding: '0.7mm', gap: '0.4mm',
      }}
    >
      <div style={{ display: 'flex', flex: '0 0 auto', gap: '0.5mm', alignItems: 'stretch' }}>
        {/* Left: text info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4mm', overflow: 'hidden' }}>
          <p style={{ margin: 0, fontSize: '5.5pt', fontWeight: 'bold', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#111' }}>
            {product.name}
          </p>
          <p style={{ margin: 0, fontSize: '4.5pt', lineHeight: 1.1, color: '#444', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
            {product.sku}&nbsp;·&nbsp;SUP: {supplierCode}
          </p>
          <div style={{ display: 'flex', gap: '1mm', marginTop: '0.2mm' }}>
            {[
              { label: 'W', value: product.pricing?.wholesale, color: '#1d4ed8' },
              { label: 'S', value: product.pricing?.shop,      color: '#7e22ce' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '0.3mm' }}>
                <span style={{ fontSize: '3.5pt', fontWeight: 'bold', color, lineHeight: 1 }}>{label}:</span>
                <span style={{ fontSize: '4.5pt', fontWeight: 'bold', color, lineHeight: 1 }}>
                  ₹{(value || 0).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
        {/* Right: QR */}
        <div style={{ flexShrink: 0, width: '11mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <QRCode value={qrValue} size={120} style={{ width: '11mm', height: '11mm' }} />
        </div>
      </div>
      {/* Bottom: barcode */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 0 }}>
        <div style={{ width: '100%' }}>
          <Barcode value={product.sku} />
        </div>
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function BulkLabelPrint() {
  const { state } = useLocation();
  const navigate = useNavigate();

  // state.items = [{ product, qty, supplier? }]
  const [items, setItems] = useState(
    (state?.items || []).map(i => ({ ...i, qty: Math.max(1, i.qty || 1) }))
  );

  const setQty = (idx, val) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: Math.max(0, +val || 0) } : it));

  if (!items.length) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-lg">No products selected.</p>
        <button onClick={() => navigate(-1)} className="text-blue-600 underline text-sm">← Go back</button>
      </div>
    );
  }

  const totalLabels = items.reduce((s, i) => s + (i.qty || 0), 0);
  const allLabels = items.flatMap(i =>
    Array.from({ length: i.qty || 0 }, () => ({ product: i.product, supplier: i.supplier || null }))
  );

  return (
    <>
      <style>{`
        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          .no-print { display: none !important; }
          .label-sheet { display: flex !important; flex-wrap: wrap; }
          .label-sticker { page-break-inside: avoid; break-inside: avoid; border: 0.3mm dashed #aaa !important; }
        }
        @media screen {
          .label-preview-scale { transform: scale(3.2); transform-origin: top left; }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-10 bg-gray-900 text-white px-6 py-3 flex items-center gap-4 shadow-lg">
        <button onClick={() => navigate(-1)} className="text-gray-300 hover:text-white text-sm flex items-center gap-1">
          ← Back
        </button>
        <span className="text-gray-600">|</span>
        <span className="text-sm font-medium">{items.length} product{items.length !== 1 ? 's' : ''}</span>
        <span className="text-xs text-gray-400">{totalLabels} label{totalLabels !== 1 ? 's' : ''} total</span>
        <div className="ml-auto">
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-lg font-medium"
          >
            🖨 Print {totalLabels} Label{totalLabels !== 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {/* ── Qty adjusters ── */}
      <div className="no-print bg-white border-b px-6 py-4">
        <p className="text-xs text-gray-500 uppercase font-medium mb-3 tracking-wide">Adjust label quantities before printing</p>
        <div className="flex flex-wrap gap-3">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
              <div>
                <p className="text-sm font-semibold text-gray-800 leading-tight">{item.product.name}</p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{item.product.sku}</p>
              </div>
              <div className="flex items-center gap-1.5 ml-1">
                <button
                  onClick={() => setQty(idx, item.qty - 1)}
                  className="w-7 h-7 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-base font-bold flex items-center justify-center select-none"
                >−</button>
                <input
                  type="number" min="0"
                  value={item.qty}
                  onChange={e => setQty(idx, e.target.value)}
                  className="w-14 text-center border border-gray-300 rounded-lg px-1 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={() => setQty(idx, item.qty + 1)}
                  className="w-7 h-7 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-base font-bold flex items-center justify-center select-none"
                >+</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Info bar ── */}
      <div className="no-print bg-blue-50 border-b border-blue-100 px-6 py-2 text-xs text-blue-700 flex gap-6">
        <span>Sticker size: <strong>34mm × 20mm</strong></span>
        <span>Layout: <strong>3 per row</strong> on sticker sheet</span>
        <span>Preview scaled 3.2× for readability</span>
      </div>

      {/* ── Screen preview ── */}
      <div className="no-print p-10">
        <p className="text-xs text-gray-500 mb-4 font-medium uppercase tracking-wide">
          Preview (first {Math.min(allLabels.length, 3)} label{allLabels.length > 1 ? 's' : ''})
        </p>
        {allLabels.length === 0 ? (
          <p className="text-sm text-gray-400">Set qty &gt; 0 for at least one product to see a preview.</p>
        ) : (
          <div className="flex gap-8 flex-wrap">
            {allLabels.slice(0, 3).map((l, i) => (
              <div key={i} style={{ width: '108.8px', height: '64px' }}>
                <div className="label-preview-scale">
                  <StickerLabel product={l.product} supplier={l.supplier} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Print-only sheet ── */}
      <div className="label-sheet" style={{ display: 'none' }}>
        {allLabels.map((l, i) => (
          <StickerLabel key={i} product={l.product} supplier={l.supplier} />
        ))}
      </div>
      <style>{`@media print { .label-sheet { display: flex !important; flex-wrap: wrap; } }`}</style>
    </>
  );
}
