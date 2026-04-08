import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRCode } from 'react-qr-code';
import { useSuppliers } from '../../context/SupplierContext';

/* ─── Same label format as BarcodeLabel.jsx ────────────────────────── */
function StickerLabel({ product, supplier }) {
  const supplierCode = supplier
    ? (supplier.code || supplier.name.replace(/\s+/g, '').slice(0, 4).toUpperCase())
    : '';

  const wCoded  = Math.round((product.pricing?.wholesale || 0) * 2);
  const wCode   = `D.No.${wCoded}`;
  const qrValue = String(product.sku || product.id);

  return (
    <div
      className="label-sticker"
      style={{
        width:           '34mm',
        height:          '20mm',
        boxSizing:       'border-box',
        border:          '0.3mm solid #bbb',
        display:         'flex',
        flexDirection:   'row',
        overflow:        'hidden',
        backgroundColor: '#fff',
        fontFamily:      'Arial, sans-serif',
        padding:         '1mm 0.5mm 1mm 1mm',
        gap:             '0.5mm',
      }}
    >
      {/* ── LEFT: all text content ── */}
      <div style={{
        flex:           1,
        display:        'flex',
        flexDirection:  'column',
        justifyContent: 'space-between',
        overflow:       'hidden',
        minWidth:       0,
      }}>
        {/* Product name */}
        <p style={{
          margin:          0,
          fontSize:        '9pt',
          fontWeight:      'bold',
          lineHeight:      1.15,
          color:           '#111',
          display:         '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow:        'hidden',
        }}>
          {product.name}
        </p>

        {/* W code */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8mm' }}>
          <span style={{
            fontSize:     '4pt',
            fontWeight:   'bold',
            color:        '#fff',
            background:   '#1d4ed8',
            borderRadius: '0.4mm',
            padding:      '0.15mm 0.7mm',
            lineHeight:   1.5,
            flexShrink:   0,
          }}>W</span>
          <span style={{ fontSize: '8pt', fontWeight: 'bold', color: '#1d4ed8', lineHeight: 1 }}>
            {wCode}
          </span>
        </div>

        {/* SKU · Supplier */}
        <p style={{
          margin:       0,
          fontSize:     '7.5pt',
          fontWeight:   '600',
          lineHeight:   1.2,
          color:        '#555',
          fontFamily:   'monospace',
          whiteSpace:   'nowrap',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
        }}>
          {product.sku || '—'}{supplierCode ? `  ·  ${supplierCode}` : ''}
        </p>
      </div>

      {/* ── RIGHT: QR code (SKU only) ── */}
      <div style={{
        flexShrink:     0,
        width:          '14mm',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        paddingRight:   '0.5mm',
      }}>
        <QRCode
          value={qrValue}
          size={256}
          style={{ width: '13mm', height: '13mm', display: 'block' }}
        />
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────── */
export default function BulkLabelPrint() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { suppliers } = useSuppliers();

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
  const allLabels = items.flatMap(i => {
    const supplier = i.supplier || suppliers.find(s => s.id === i.product?.supplierId) || null;
    return Array.from({ length: i.qty || 0 }, () => ({ product: i.product, supplier }));
  });

  return (
    <>
      <style>{`
        @page {
          size: 102mm auto;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0;
            padding: 0;
            background: white !important;
            color: black !important;
            color-scheme: light !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          .label-sheet {
            display: flex !important;
            flex-wrap: wrap;
            gap: 0;
            padding: 0;
            margin: 0;
            width: 102mm;
          }
          .label-sticker {
            page-break-inside: avoid;
            break-inside: avoid;
            border: 0.3mm dashed #aaa !important;
          }
        }
        @media screen {
          .label-preview-scale {
            transform: scale(3.6);
            transform-origin: top left;
          }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-10 bg-gray-900 text-white px-6 py-3 flex items-center gap-4 shadow-lg">
        <button onClick={() => navigate(-1)} className="text-gray-300 hover:text-white text-sm">← Back</button>
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
      <div className="no-print bg-blue-50 border-b border-blue-100 px-6 py-2 text-xs text-blue-700 flex gap-6 flex-wrap items-center">
        <span>34mm × 20mm · <strong>3 per row</strong> on 102mm sheet</span>
        <span>QR = SKU only</span>
        <span className="text-gray-400">W price shown as D.No. code · S price shown as P. code</span>
      </div>

      {/* ── Screen preview ── */}
      <div className="no-print p-10">
        <p className="text-xs text-gray-500 mb-10 font-medium uppercase tracking-wide">
          Preview (scaled 3.6×) — first {Math.min(allLabels.length, 3)} label{allLabels.length !== 1 ? 's' : ''}
        </p>
        {allLabels.length === 0 ? (
          <p className="text-sm text-gray-400">Set qty &gt; 0 for at least one product to see a preview.</p>
        ) : (
          <div className="flex gap-14 flex-wrap">
            {allLabels.slice(0, 3).map((l, i) => (
              <div key={i} style={{ width: '128px', height: '76px' }}>
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
    </>
  );
}
