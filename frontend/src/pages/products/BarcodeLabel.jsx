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

  const wCoded = Math.round((product.pricing?.wholesale || 0) * 2);
  const sPrice = Math.round(product.pricing?.shop || 0);

  // W code: D.No.{wholesale×2}   S rate: plain number
  const wCode = `D.No.${wCoded}`;
  const sCode = `${sPrice}`;

  // QR contains only the SKU ID
  const qrValue = product.sku || product.id;

  return (
    <div
      className="label-sticker"
      style={{
        width: '34mm',
        height: '20mm',
        boxSizing: 'border-box',
        border: '0.3mm solid #bbb',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: '#fff',
        fontFamily: 'Arial, sans-serif',
        padding: '0.8mm',
      }}
    >
      {/* ── Row 1: product name + supplier + SKU ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5mm' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <p style={{
            margin: 0, fontSize: '5.5pt', fontWeight: 'bold', lineHeight: 1.15,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#111',
          }}>
            {product.name}
          </p>
          <p style={{ margin: 0, fontSize: '4pt', color: '#666', lineHeight: 1.2, fontFamily: 'monospace' }}>
            {product.sku && `SKU: ${product.sku}`}{supplierCode && ` · ${supplierCode}`}
          </p>
        </div>
      </div>

      {/* ── Row 2: coded prices (left) + QR (right) ── */}
      <div style={{ display: 'flex', flex: 1, gap: '1mm', alignItems: 'center' }}>

        {/* Coded prices — dominant */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.8mm' }}>

          {/* W code */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1mm' }}>
            <span style={{
              fontSize: '4pt', fontWeight: 'bold', color: '#fff',
              background: '#1d4ed8', borderRadius: '0.5mm',
              padding: '0.2mm 0.8mm', lineHeight: 1.3, flexShrink: 0,
            }}>W</span>
            <span style={{
              fontSize: '10pt', fontWeight: 'bold', color: '#1d4ed8',
              fontFamily: 'Arial, sans-serif', letterSpacing: '0.01em', lineHeight: 1,
            }}>
              {wCode}
            </span>
          </div>

          {/* S rate */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1mm' }}>
            <span style={{
              fontSize: '4pt', fontWeight: 'bold', color: '#fff',
              background: '#7e22ce', borderRadius: '0.5mm',
              padding: '0.2mm 0.8mm', lineHeight: 1.3, flexShrink: 0,
            }}>S</span>
            <span style={{
              fontSize: '10pt', fontWeight: 'bold', color: '#7e22ce',
              fontFamily: 'Arial, sans-serif', letterSpacing: '0.01em', lineHeight: 1,
            }}>
              {sCode}
            </span>
          </div>
        </div>

        {/* QR code — SKU only */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2mm' }}>
          <QRCode value={qrValue} size={140} style={{ width: '12mm', height: '12mm' }} />
          <span style={{ fontSize: '3pt', color: '#999', fontFamily: 'monospace', lineHeight: 1 }}>
            {product.sku}
          </span>
        </div>
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

  const supplier = suppliers.find(s => s.id === product.supplierId);
  const wCoded = Math.round((product.pricing?.wholesale || 0) * 2);
  const sPrice = Math.round(product.pricing?.shop || 0);
  const supplierCode = supplier
    ? (supplier.code || supplier.name.replace(/\s+/g, '').slice(0, 4).toUpperCase())
    : '—';

  return (
    <>
      <style>{`
        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          .no-print { display: none !important; }
          .label-sheet { display: flex; flex-wrap: wrap; gap: 0; padding: 0; margin: 0; }
          .label-preview-scale { transform: none !important; }
          .label-sticker {
            page-break-inside: avoid;
            break-inside: avoid;
            border: 0.3mm dashed #bbb !important;
          }
        }
        @media screen {
          .label-preview-scale {
            transform: scale(3.5);
            transform-origin: top left;
          }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-10 bg-gray-900 text-white px-6 py-3 flex items-center gap-4 shadow-lg">
        <button onClick={() => window.history.back()} className="text-gray-300 hover:text-white text-sm">
          ← Back
        </button>
        <span className="text-gray-600">|</span>
        <span className="text-sm font-medium truncate max-w-xs">{product.name}</span>
        <span className="text-xs text-gray-400 font-mono">{product.sku}</span>
        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Copies:
            <select
              value={copies}
              onChange={e => setCopies(+e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
            >
              {[1, 2, 3, 6, 9, 12, 24, 30].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-lg font-medium"
          >
            🖨 Print {copies} Label{copies > 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {/* ── Info bar ── */}
      <div className="no-print bg-blue-50 border-b border-blue-100 px-6 py-2 text-xs text-blue-700 flex gap-6 flex-wrap items-center">
        <span>Size: <strong>34mm × 20mm</strong></span>
        <span>Supplier: <strong>{supplierCode}</strong></span>
        <span className="font-mono font-bold text-blue-800">W → D.No.{wCoded}</span>
        <span className="font-mono font-bold text-purple-800">S → {sPrice}</span>
        <span>QR = SKU ID only</span>
      </div>

      {/* ── Screen preview ── */}
      <div className="no-print p-10">
        <p className="text-xs text-gray-500 mb-8 font-medium uppercase tracking-wide">Preview (scaled up 3.5×)</p>
        <div className="flex gap-12 flex-wrap">
          {Array.from({ length: Math.min(copies, 3) }).map((_, i) => (
            /* 34mm×20mm at 96dpi = 128×75px, scaled 3.5× = 448×265px container */
            <div key={i} style={{ width: '119px', height: '70px' }}>
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

      <style>{`
        @media print { .label-sheet { display: flex !important; flex-wrap: wrap; } }
      `}</style>
    </>
  );
}
