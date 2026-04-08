import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCode } from 'react-qr-code';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';

/* ─── One 34×20 mm label ────────────────────────────────────────────── */
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
          <span style={{
            fontSize:   '8pt',
            fontWeight: 'bold',
            color:      '#1d4ed8',
            lineHeight: 1,
          }}>
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
export default function BarcodeLabel() {
  const { id } = useParams();
  const { get } = useProducts();
  const { suppliers } = useSuppliers();
  const [copies, setCopies] = useState(3);

  const product = get(id);
  if (!product) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400 text-lg">Product not found.</p>
      </div>
    );
  }

  const supplier     = suppliers.find(s => s.id === product.supplierId);
  const wCoded       = Math.round((product.pricing?.wholesale || 0) * 2);
  const supplierCode = supplier
    ? (supplier.code || supplier.name.replace(/\s+/g, '').slice(0, 4).toUpperCase())
    : '—';

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
          .label-preview-scale { transform: none !important; }
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
        <button onClick={() => window.history.back()} className="text-gray-300 hover:text-white text-sm">← Back</button>
        <span className="text-gray-600">|</span>
        <span className="text-sm font-medium truncate max-w-xs">{product.name}</span>
        <span className="text-xs text-gray-400 font-mono">{product.sku}</span>
        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Copies:
            <select value={copies} onChange={e => setCopies(+e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm">
              {[1, 2, 3, 6, 9, 12, 24, 30].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-lg font-medium">
            🖨 Print {copies} Label{copies > 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {/* ── Info bar ── */}
      <div className="no-print bg-blue-50 border-b border-blue-100 px-6 py-2 text-xs text-blue-700 flex gap-6 flex-wrap items-center">
        <span>34mm × 20mm · <strong>3 per row</strong> on 102mm sheet</span>
        <span className="font-mono font-bold text-blue-800">W → D.No.{wCoded}</span>
        <span>Supplier: <strong>{supplierCode}</strong></span>
        <span>QR = SKU only</span>
      </div>

      {/* ── Screen preview ── */}
      <div className="no-print p-10">
        <p className="text-xs text-gray-500 mb-10 font-medium uppercase tracking-wide">Preview (scaled 3.6×) — 3 labels per row when printed</p>
        <div className="flex gap-14 flex-wrap">
          {Array.from({ length: Math.min(copies, 3) }).map((_, i) => (
            /* 34×20mm at 96dpi ≈ 128×76px, scaled 3.6× ≈ 461×272px */
            <div key={i} style={{ width: '128px', height: '76px' }}>
              <div className="label-preview-scale">
                <StickerLabel product={product} supplier={supplier} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Print-only sheet ── */}
      <div className="label-sheet" style={{ display: 'none' }}>
        {Array.from({ length: copies }).map((_, i) => (
          <StickerLabel key={i} product={product} supplier={supplier} />
        ))}
      </div>
    </>
  );
}
