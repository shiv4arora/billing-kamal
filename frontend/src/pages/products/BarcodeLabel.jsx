import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCode } from 'react-qr-code';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';

/* ─── Barcode renderer ──────────────────────────────────────────────── */
function Barcode({ value }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    import('jsbarcode').then(mod => {
      const JsBarcode = mod.default || mod;
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128',
          width: 1.4,
          height: 28,
          displayValue: true,
          fontSize: 7,
          textMargin: 1,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
        if (ref.current) {
          ref.current.removeAttribute('width');
          ref.current.removeAttribute('height');
          ref.current.style.width = '100%';
          ref.current.style.height = 'auto';
        }
      } catch (e) {
        console.warn('Barcode error:', e);
      }
    });
  }, [value]);

  return <svg ref={ref} style={{ display: 'block', width: '100%' }} />;
}

/* ─── One 34×22 mm label ────────────────────────────────────────────── */
function StickerLabel({ product, supplier }) {
  const supplierCode = supplier
    ? (supplier.code || supplier.name.replace(/\s+/g, '').slice(0, 4).toUpperCase())
    : '—';

  const ws = Math.round((product.pricing?.wholesale || 0) * 2);
  const sh = Math.round(product.pricing?.shop || 0);

  // Coded prices: supplierCode-wholesaleX2 and supplierCode-shop
  const wCode = `${supplierCode}-${ws}`;
  const sCode = `${supplierCode}-${sh}`;

  // QR contains only the SKU ID
  const qrValue = product.sku || product.id;

  return (
    <div
      className="label-sticker"
      style={{
        width: '34mm',
        height: '22mm',
        boxSizing: 'border-box',
        border: '0.3mm solid #bbb',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: '#fff',
        fontFamily: 'Arial, sans-serif',
        padding: '0.8mm 0.8mm 0 0.8mm',
        gap: '0.3mm',
      }}
    >
      {/* ── Top row: info (left) + QR (right) ── */}
      <div style={{ display: 'flex', flex: '0 0 auto', gap: '0.5mm', alignItems: 'flex-start' }}>

        {/* Left: product name + SKU + supplier + coded prices */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5mm', overflow: 'hidden' }}>

          {/* Product name */}
          <p style={{
            margin: 0, fontSize: '5pt', fontWeight: 'bold', lineHeight: 1.1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#111',
          }}>
            {product.name}
          </p>

          {/* SKU + Supplier code */}
          <p style={{ margin: 0, fontSize: '4pt', lineHeight: 1.1, color: '#555', fontFamily: 'monospace' }}>
            SKU: {product.sku || '—'} &nbsp;·&nbsp; {supplierCode}
          </p>

          {/* Coded prices — the main info */}
          <div style={{ display: 'flex', gap: '1.5mm', marginTop: '0.5mm' }}>
            <div style={{
              background: '#eff6ff', border: '0.2mm solid #bfdbfe',
              borderRadius: '0.8mm', padding: '0.5mm 1mm',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <span style={{ fontSize: '3pt', color: '#3b82f6', fontWeight: 'bold', lineHeight: 1, textTransform: 'uppercase' }}>W</span>
              <span style={{ fontSize: '6pt', fontWeight: 'bold', color: '#1d4ed8', lineHeight: 1.1, fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                {wCode}
              </span>
            </div>
            <div style={{
              background: '#faf5ff', border: '0.2mm solid #e9d5ff',
              borderRadius: '0.8mm', padding: '0.5mm 1mm',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <span style={{ fontSize: '3pt', color: '#9333ea', fontWeight: 'bold', lineHeight: 1, textTransform: 'uppercase' }}>S</span>
              <span style={{ fontSize: '6pt', fontWeight: 'bold', color: '#7e22ce', lineHeight: 1.1, fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                {sCode}
              </span>
            </div>
          </div>
        </div>

        {/* Right: QR code (SKU only) */}
        <div style={{ flexShrink: 0, width: '12mm', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3mm' }}>
          <QRCode value={qrValue} size={128} style={{ width: '11mm', height: '11mm' }} />
          <span style={{ fontSize: '3pt', color: '#888', fontFamily: 'monospace', lineHeight: 1 }}>{product.sku}</span>
        </div>
      </div>

      {/* ── Bottom: barcode ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 0 }}>
        <div style={{ width: '100%' }}>
          <Barcode value={product.sku || product.id} />
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

  const ws = Math.round((product.pricing?.wholesale || 0) * 2);
  const sh = Math.round(product.pricing?.shop || 0);
  const supplierCode = supplier
    ? (supplier.code || supplier.name.replace(/\s+/g, '').slice(0, 4).toUpperCase())
    : '—';

  return (
    <>
      {/* ── Print stylesheet ── */}
      <style>{`
        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          .no-print { display: none !important; }
          .label-sheet {
            display: flex;
            flex-wrap: wrap;
            gap: 0;
            padding: 0;
            margin: 0;
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
            transform: scale(3.2);
            transform-origin: top left;
          }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-10 bg-gray-900 text-white px-6 py-3 flex items-center gap-4 shadow-lg">
        <button onClick={() => window.history.back()} className="text-gray-300 hover:text-white text-sm flex items-center gap-1">
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
      <div className="no-print bg-blue-50 border-b border-blue-100 px-6 py-2 text-xs text-blue-700 flex gap-6 flex-wrap">
        <span>Sticker: <strong>34mm × 22mm</strong></span>
        <span>Supplier: <strong>{supplierCode}</strong></span>
        <span>W code: <strong className="font-mono">{supplierCode}-{ws}</strong></span>
        <span>S code: <strong className="font-mono">{supplierCode}-{sh}</strong></span>
        <span>QR: <strong>SKU ID only</strong></span>
        <span className="ml-auto text-gray-500">Preview scaled 3.2×</span>
      </div>

      {/* ── Screen preview ── */}
      <div className="no-print p-10">
        <p className="text-xs text-gray-500 mb-6 font-medium uppercase tracking-wide">Preview (up to 3 labels)</p>
        <div className="flex gap-10 flex-wrap">
          {Array.from({ length: Math.min(copies, 3) }).map((_, i) => (
            <div key={i} style={{ width: '108.8px', height: '70.4px' /* 34mm×22mm at 96dpi scaled 3.2× */ }}>
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
        @media print {
          .label-sheet { display: flex !important; flex-wrap: wrap; }
        }
      `}</style>
    </>
  );
}
