import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCode } from 'react-qr-code';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { formatCurrency } from '../../utils/helpers';

/* ─── Barcode renderer ──────────────────────────────────────────────── */
function Barcode({ value, onReady }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    import('jsbarcode').then(mod => {
      const JsBarcode = mod.default || mod;
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128',
          width: 1.4,        // narrow bar width (px) – keeps it compact
          height: 28,        // px – will be overridden by CSS to fit label
          displayValue: true,
          fontSize: 7,
          textMargin: 1,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
        // make SVG fluid so CSS controls actual print size
        if (ref.current) {
          ref.current.removeAttribute('width');
          ref.current.removeAttribute('height');
          ref.current.style.width = '100%';
          ref.current.style.height = 'auto';
        }
        onReady?.();
      } catch (e) {
        console.warn('Barcode error:', e);
      }
    });
  }, [value]);

  return <svg ref={ref} style={{ display: 'block', width: '100%' }} />;
}

/* ─── One 34×20 mm label ────────────────────────────────────────────── */
function StickerLabel({ product, supplier }) {
  const supplierCode = supplier
    ? (supplier.code || supplier.name.replace(/\s+/g, '').slice(0, 8).toUpperCase())
    : '—';

  const qrValue = `CODE:${product.sku}|NAME:${product.name}|WS:${product.pricing?.wholesale || 0}|SH:${product.pricing?.shop || 0}|RT:${product.pricing?.retail || 0}|SUP:${supplierCode}`;

  return (
    /*
      At print:
        • outer box = 34mm × 20mm exactly
        • left column = 21mm (text + barcode)
        • right column = 13mm (QR code)
      On screen: we scale it up 3.5× with transform-origin top-left
      so users can read it.
    */
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
        padding: '0.7mm',
        gap: '0.4mm',
      }}
    >
      {/* ── Top row: info (left) + QR (right) ── */}
      <div style={{ display: 'flex', flex: '0 0 auto', gap: '0.5mm', alignItems: 'stretch' }}>

        {/* Left: text info */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4mm', overflow: 'hidden' }}>
          {/* Product name */}
          <p style={{ margin: 0, fontSize: '5.5pt', fontWeight: 'bold', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#111' }}>
            {product.name}
          </p>
          {/* Item code + supplier */}
          <p style={{ margin: 0, fontSize: '4.5pt', lineHeight: 1.1, color: '#444', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
            {product.sku}  &nbsp;·&nbsp;  SUP: {supplierCode}
          </p>
          {/* 3 prices */}
          <div style={{ display: 'flex', gap: '1mm', marginTop: '0.2mm' }}>
            {[
              { label: 'W', value: product.pricing?.wholesale, color: '#1d4ed8' },
              { label: 'S', value: product.pricing?.shop,      color: '#7e22ce' },
              { label: 'R', value: product.pricing?.retail,    color: '#15803d' },
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

        {/* Right: QR code — fixed 11mm wide */}
        <div style={{ flexShrink: 0, width: '11mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <QRCode value={qrValue} size={120} style={{ width: '11mm', height: '11mm' }} />
        </div>
      </div>

      {/* ── Bottom: full-width barcode ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 0 }}>
        <div style={{ width: '100%' }}>
          <Barcode value={product.sku} />
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

      {/* ── Screen: preview info ── */}
      <div className="no-print bg-blue-50 border-b border-blue-100 px-6 py-2 text-xs text-blue-700 flex gap-6">
        <span>Sticker size: <strong>34mm × 20mm</strong></span>
        <span>Layout: <strong>3 per row</strong> on sticker sheet</span>
        <span>Preview is scaled up 3.2× for readability</span>
      </div>

      {/* ── Screen preview ── */}
      <div className="no-print p-10">
        <p className="text-xs text-gray-500 mb-4 font-medium uppercase tracking-wide">Preview (3 labels as they appear on sticker sheet)</p>
        <div className="flex gap-8 flex-wrap">
          {Array.from({ length: Math.min(copies, 3) }).map((_, i) => (
            <div key={i} style={{ width: '108.8px', height: '64px' /* 34mm×20mm at 96dpi scaled 3.2× */ }}>
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
