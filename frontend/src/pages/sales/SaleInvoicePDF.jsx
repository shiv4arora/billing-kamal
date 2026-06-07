import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import { formatDate, amountInWords, formatCustomerDisplay } from '../../utils/helpers';

// Roboto supports ₹ (U+20B9); Helvetica does not
Font.register({
  family: 'Roboto',
  fonts: [
    { src: '/fonts/Roboto-Regular.ttf', fontWeight: 'normal' },
    { src: '/fonts/Roboto-Bold.ttf',    fontWeight: 'bold' },
    { src: '/fonts/Roboto-Italic.ttf',  fontWeight: 'normal', fontStyle: 'italic' },
  ],
});

// Number-only formatter — ₹ is rendered in a separate inline Text to avoid glyph overlap
const fmt = (v = 0) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

// Inline currency: renders ₹ as its own text run so it cannot bleed into the digits
const Cur = ({ v = 0, neg = false }) => (
  <Text><Text style={S.rupee}>{neg ? '-₹ ' : '₹ '}</Text>{fmt(v)}</Text>
);

const S = StyleSheet.create({
  page: {
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 36,
    fontSize: 10,
    color: '#111827',
    fontFamily: 'Roboto',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: '#1f2937',
  },
  logo:          { width: 38, height: 38, marginBottom: 4 },
  companyName:   { fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  companyDetail: { fontSize: 8.5, color: '#4b5563', marginBottom: 1 },
  invoiceTitle:  { fontSize: 18, fontWeight: 'bold', textAlign: 'right', marginBottom: 5 },
  metaRow:       { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  metaLabel:     { fontSize: 9.5, color: '#374151', marginRight: 3 },
  metaValue:     { fontSize: 9.5, fontWeight: 'bold' },

  // ── Bill To ──
  billTo:       { marginBottom: 10 },
  billToLabel:  { fontSize: 8, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  billToName:   { fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  billToDetail: { fontSize: 8.5, color: '#4b5563', marginBottom: 1 },

  // ── Table borders ──
  thead: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: '#9ca3af',
  },
  row: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: '#9ca3af',
    borderBottomWidth: 0.5,
    borderBottomColor: '#9ca3af',
    borderLeftWidth: 0.5,
    borderLeftColor: '#9ca3af',
    borderRightWidth: 0.5,
    borderRightColor: '#9ca3af',
  },
  tfoot: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    fontWeight: 'bold',
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: '#9ca3af',
  },

  // Cells (with right divider)
  th:  { padding: '5 7', fontSize: 9, fontWeight: 'bold', borderRightWidth: 0.5, borderRightColor: '#9ca3af' },
  td:  { padding: '4 7', fontSize: 9, borderRightWidth: 0.5, borderRightColor: '#d1d5db' },
  tfc: { padding: '5 7', fontSize: 9, borderRightWidth: 0.5, borderRightColor: '#9ca3af' },
  // Last cell — no right divider
  thL: { padding: '5 7', fontSize: 9, fontWeight: 'bold' },
  tdL: { padding: '4 7', fontSize: 9 },
  tfL: { padding: '5 7', fontSize: 9 },

  skuText: { fontSize: 7, color: '#9ca3af' },
  rupee:   { fontSize: 7.5 },

  // ── Column widths ──
  cNum:   { width: 22 },
  cDesc:  { flex: 1 },
  cQty:   { width: 68, textAlign: 'right' },
  cRate:  { width: 78, textAlign: 'right' },
  cRateD: { width: 68, textAlign: 'right' },
  cTot:   { width: 78, textAlign: 'right' },
  cDisc:  { width: 40, textAlign: 'right' },
  cAmt:   { width: 88, textAlign: 'right' },

  // ── Summary ──
  summary:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  sumLeft:    { flex: 1, paddingRight: 16 },
  sumRight:   { width: 180 },
  sumLabel:   { fontSize: 8.5, fontWeight: 'bold', color: '#374151', marginBottom: 2 },
  sumItalic:  { fontSize: 8.5, fontStyle: 'italic', color: '#4b5563' },
  bankLabel:  { fontSize: 8.5, fontWeight: 'bold', color: '#374151', marginTop: 8, marginBottom: 2 },
  bankText:   { fontSize: 8.5, color: '#4b5563' },
  sumRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, fontSize: 9.5 },
  sumRowBold: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3.5, fontSize: 11, fontWeight: 'bold',
    borderTopWidth: 0.75, borderTopColor: '#6b7280', marginTop: 2,
  },
  sumRowGreen: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, fontSize: 9.5, color: '#16a34a' },
  sumRowRed:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, fontSize: 9.5, color: '#dc2626' },
  sumTaxSep:  {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 2, fontSize: 9.5, fontWeight: 'bold',
    borderTopWidth: 0.4, borderTopColor: '#e5e7eb', paddingTop: 2.5, marginTop: 1,
  },

  // ── Terms / Signature ──
  terms:         { marginTop: 14, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: '#d1d5db', fontSize: 8.5, color: '#6b7280' },
  termsBold:     { fontWeight: 'bold', color: '#374151' },
  signature:     { marginTop: 28, alignItems: 'flex-end' },
  signatureLine: { width: 90, borderBottomWidth: 0.5, borderBottomColor: '#9ca3af', marginBottom: 3 },
  signatureText: { fontSize: 8.5, color: '#4b5563' },

  pageNum: {
    position: 'absolute', bottom: 14, left: 0, right: 0,
    textAlign: 'center', fontSize: 8, color: '#9ca3af',
  },
});

export function InvoicePDF({ inv, company, invSettings, customerAddress, customerGstin, customerPhone }) {
  const items        = inv.items || [];
  const hasDiscount  = items.some(i => (i.discountPct || 0) > 0);
  const totalQty     = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalTax     = (inv.totalCGST || 0) + (inv.totalSGST || 0) + (inv.totalIGST || 0);
  const totalTaxable = items.reduce((s, i) => s + (Number(i.taxableAmount) || Number(i.lineTotal) || 0), 0);
  const grossTotal   = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.header}>
          <View>
            {company.logo && <Image style={S.logo} src={company.logo} />}
            <Text style={S.companyName}>{company.name || 'Kamal Jewellers'}</Text>
            {(company.address || 'Sadar Bazar, New Delhi- 110006').split('\n').map((l, i) => (
              <Text key={i} style={S.companyDetail}>{l}</Text>
            ))}
            {company.phone && <Text style={S.companyDetail}>Ph: {company.phone}</Text>}
            <Text style={S.companyDetail}>GSTIN: {company.gstin || '07AHDPR6884P1ZC'}</Text>
          </View>
          <View>
            <Text style={S.invoiceTitle}>PROFORMA INVOICE</Text>
            <View style={S.metaRow}>
              <Text style={S.metaLabel}>Invoice No: </Text>
              <Text style={S.metaValue}>{inv.invoiceNumber}</Text>
            </View>
            <View style={S.metaRow}>
              <Text style={S.metaLabel}>Date: </Text>
              <Text style={S.metaValue}>{formatDate(inv.date)}</Text>
            </View>
          </View>
        </View>

        {/* ── Bill To ── */}
        <View style={S.billTo}>
          <Text style={S.billToLabel}>Bill To</Text>
          <Text style={S.billToName}>
            {formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)}
          </Text>
          {customerAddress ? <Text style={S.billToDetail}>{customerAddress}</Text> : null}
          {customerPhone   ? <Text style={S.billToDetail}>Ph: {customerPhone}</Text> : null}
          {customerGstin   ? <Text style={S.billToDetail}>GSTIN: {customerGstin}</Text> : null}
        </View>

        {/* ── Items Table ── */}
        <View style={S.thead}>
          <Text style={[S.th, S.cNum]}>#</Text>
          <Text style={[S.th, S.cDesc]}>Description</Text>
          <Text style={[S.th, S.cQty]}>Qty</Text>
          {hasDiscount && <Text style={[S.th, S.cRateD]}>Rate</Text>}
          {hasDiscount && <Text style={[S.th, S.cTot]}>Total</Text>}
          {hasDiscount && <Text style={[S.th, S.cDisc]}>Disc%</Text>}
          {!hasDiscount && <Text style={[S.th, S.cRate]}>Rate</Text>}
          <Text style={[S.thL, S.cAmt]}>{hasDiscount ? 'Amount' : 'Total'}</Text>
        </View>

        {items.map((item, i) => {
          const gross   = item.quantity * item.unitPrice;
          const taxable = item.taxableAmount ?? item.lineTotal;
          return (
            <View key={i} style={S.row} wrap={false}>
              <Text style={[S.td, S.cNum]}>{i + 1}</Text>
              <Text style={[S.td, S.cDesc]}>
                {item.productName}
                {item.sku ? <Text style={S.skuText}>  [#{item.sku}]</Text> : null}
              </Text>
              <Text style={[S.td, S.cQty]}>{item.quantity} {item.unit}</Text>
              {hasDiscount && <Text style={[S.td, S.cRateD]}><Cur v={item.unitPrice} /></Text>}
              {hasDiscount && <Text style={[S.td, S.cTot]}><Cur v={gross} /></Text>}
              {hasDiscount && <Text style={[S.td, S.cDisc]}>{item.discountPct || 0}%</Text>}
              {!hasDiscount && <Text style={[S.td, S.cRate]}><Cur v={item.unitPrice} /></Text>}
              <Text style={[S.tdL, S.cAmt, { fontWeight: 'bold' }]}>
                <Cur v={hasDiscount ? taxable : gross} />
              </Text>
            </View>
          );
        })}

        <View style={S.tfoot}>
          <Text style={[S.tfc, S.cNum]}> </Text>
          <Text style={[S.tfc, S.cDesc, { textAlign: 'right' }]}>Total</Text>
          <Text style={[S.tfc, S.cQty]}>{totalQty}</Text>
          {hasDiscount && <Text style={[S.tfc, S.cRateD]}> </Text>}
          {hasDiscount && <Text style={[S.tfc, S.cTot]}><Cur v={grossTotal} /></Text>}
          {hasDiscount && <Text style={[S.tfc, S.cDisc]}> </Text>}
          {!hasDiscount && <Text style={[S.tfc, S.cRate]}> </Text>}
          <Text style={[S.tfL, S.cAmt]}><Cur v={hasDiscount ? totalTaxable : grossTotal} /></Text>
        </View>

        {/* ── Summary ── */}
        <View style={S.summary}>
          <View style={S.sumLeft}>
            <Text style={S.sumLabel}>Amount in Words:</Text>
            <Text style={S.sumItalic}>{amountInWords(inv.grandTotal)}</Text>
            {invSettings.bankDetails ? (
              <>
                <Text style={S.bankLabel}>Bank Details:</Text>
                <Text style={S.bankText}>{invSettings.bankDetails}</Text>
              </>
            ) : null}
          </View>
          <View style={S.sumRight}>
            {inv.totalDiscount > 0 && (
              <View style={S.sumRow}>
                <Text>Discount</Text>
                <Text style={{ color: '#dc2626' }}><Cur v={inv.totalDiscount} neg /></Text>
              </View>
            )}
            {inv.totalCGST > 0 && (
              <View style={S.sumRow}><Text>CGST</Text><Text><Cur v={inv.totalCGST} /></Text></View>
            )}
            {inv.totalSGST > 0 && (
              <View style={S.sumRow}><Text>SGST</Text><Text><Cur v={inv.totalSGST} /></Text></View>
            )}
            {inv.totalIGST > 0 && (
              <View style={S.sumRow}><Text>IGST</Text><Text><Cur v={inv.totalIGST} /></Text></View>
            )}
            {totalTax > 0 && (
              <View style={S.sumTaxSep}><Text>Total Tax</Text><Text><Cur v={totalTax} /></Text></View>
            )}
            {((inv.packingCharges || 0) + (inv.shippingCharges || 0)) > 0 && (
              <View style={S.sumRow}><Text>Packing &amp; Shipping</Text><Text><Cur v={(inv.packingCharges || 0) + (inv.shippingCharges || 0)} /></Text></View>
            )}
            <View style={S.sumRowBold}>
              <Text>Grand Total</Text><Text><Cur v={inv.grandTotal} /></Text>
            </View>
          </View>
        </View>

        {/* ── Terms ── */}
        {invSettings.terms ? (
          <View style={S.terms}>
            <Text><Text style={S.termsBold}>Terms: </Text>{invSettings.terms}</Text>
          </View>
        ) : null}

        {/* ── Signature ── */}
        <View style={S.signature}>
          <View style={S.signatureLine} />
          <Text style={S.signatureText}>Authorised Signatory</Text>
        </View>

        {/* Page number */}
        <Text
          style={S.pageNum}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
