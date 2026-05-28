import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { formatDate, amountInWords, formatCustomerDisplay } from '../../utils/helpers';

// Helvetica doesn't include the ₹ glyph — use Rs. for PDF output
const cur = (v = 0) =>
  'Rs. ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(v);

const S = StyleSheet.create({
  page: {
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 36,
    fontSize: 9,
    color: '#111827',
    fontFamily: 'Helvetica',
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
  companyName:   { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  companyDetail: { fontSize: 7.5, color: '#4b5563', marginBottom: 1 },
  invoiceTitle:  { fontSize: 17, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginBottom: 5 },
  metaRow:       { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  metaLabel:     { fontSize: 8.5, color: '#374151', marginRight: 3 },
  metaValue:     { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },

  // ── Bill To ──
  billTo:       { marginBottom: 10 },
  billToLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  billToName:   { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  billToDetail: { fontSize: 7.5, color: '#4b5563', marginBottom: 1 },

  // ── Table borders ──
  // Each cell: left+top+bottom via row/header border; right per cell
  thead: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderWidth: 0.5,
    borderColor: '#9ca3af',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#d1d5db',
    borderLeftWidth: 0.5,
    borderLeftColor: '#9ca3af',
    borderRightWidth: 0.5,
    borderRightColor: '#9ca3af',
  },
  tfoot: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    fontFamily: 'Helvetica-Bold',
    borderWidth: 0.5,
    borderColor: '#9ca3af',
  },

  // Cell base (with right divider)
  th:  { padding: '4 6', fontSize: 8, fontFamily: 'Helvetica-Bold', borderRightWidth: 0.5, borderRightColor: '#9ca3af' },
  td:  { padding: '3 6', fontSize: 8, borderRightWidth: 0.5, borderRightColor: '#d1d5db' },
  tfc: { padding: '4 6', fontSize: 8, borderRightWidth: 0.5, borderRightColor: '#9ca3af' },
  // Last cell — no right divider
  thL: { padding: '4 6', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tdL: { padding: '3 6', fontSize: 8 },
  tfL: { padding: '4 6', fontSize: 8 },

  skuText: { fontSize: 6.5, color: '#9ca3af' },

  // ── Column widths ──
  cNum:  { width: 20 },
  cDesc: { flex: 1 },
  cQty:  { width: 54, textAlign: 'right' },
  cRate: { width: 70, textAlign: 'right' },
  cTot:  { width: 75, textAlign: 'right' },
  cDisc: { width: 40, textAlign: 'right' },

  // ── Summary ──
  summary:      { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  sumLeft:      { flex: 1, paddingRight: 16 },
  sumRight:     { width: 168 },
  sumLabel:     { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 2 },
  sumItalic:    { fontSize: 7.5, fontFamily: 'Helvetica-Oblique', color: '#4b5563' },
  bankLabel:    { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#374151', marginTop: 8, marginBottom: 2 },
  bankText:     { fontSize: 7.5, color: '#4b5563' },
  sumRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5, fontSize: 8.5 },
  sumRowBold:   {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 3, fontSize: 10, fontFamily: 'Helvetica-Bold',
    borderTopWidth: 0.75, borderTopColor: '#6b7280', marginTop: 2,
  },
  sumRowGreen:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5, fontSize: 8.5, color: '#16a34a' },
  sumRowRed:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5, fontSize: 8.5, color: '#dc2626' },
  sumTaxSep:    {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 1.5, fontSize: 8.5, fontFamily: 'Helvetica-Bold',
    borderTopWidth: 0.4, borderTopColor: '#e5e7eb', paddingTop: 2, marginTop: 1,
  },

  // ── Terms / Signature ──
  terms:         { marginTop: 14, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: '#d1d5db', fontSize: 7.5, color: '#6b7280' },
  termsBold:     { fontFamily: 'Helvetica-Bold', color: '#374151' },
  signature:     { marginTop: 28, alignItems: 'flex-end' },
  signatureLine: { width: 90, borderBottomWidth: 0.5, borderBottomColor: '#9ca3af', marginBottom: 3 },
  signatureText: { fontSize: 7.5, color: '#4b5563' },

  // ── Page number ──
  pageNum: {
    position: 'absolute', bottom: 14, left: 0, right: 0,
    textAlign: 'center', fontSize: 7, color: '#9ca3af',
  },
});

export function InvoicePDF({ inv, company, invSettings, customerAddress, customerGstin, customerPhone }) {
  const items        = inv.items || [];
  const hasDiscount  = items.some(i => (i.discountPct || 0) > 0);
  const totalQty     = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalTax     = (inv.totalCGST || 0) + (inv.totalSGST || 0) + (inv.totalIGST || 0);
  const totalTaxable = items.reduce((s, i) => s + (Number(i.taxableAmount) || Number(i.lineTotal) || 0), 0);
  const grossTotal   = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const balanceDue   = (inv.grandTotal || 0) - (inv.amountPaid || 0);

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
        {/* thead */}
        <View style={S.thead}>
          <Text style={[S.th, S.cNum]}>#</Text>
          <Text style={[S.th, S.cDesc]}>Description</Text>
          <Text style={[S.th, S.cQty]}>Qty</Text>
          {hasDiscount && <Text style={[S.th, S.cRate]}>Rate</Text>}
          {hasDiscount && <Text style={[S.th, S.cTot]}>Total</Text>}
          {hasDiscount && <Text style={[S.th, S.cDisc]}>Disc%</Text>}
          {!hasDiscount && <Text style={[S.th, S.cRate]}>Rate</Text>}
          <Text style={[S.thL, hasDiscount ? S.cTot : S.cTot]}>
            {hasDiscount ? 'Amount' : 'Total'}
          </Text>
        </View>

        {/* tbody */}
        {items.map((item, i) => {
          const gross   = item.quantity * item.unitPrice;
          const taxable = item.taxableAmount ?? item.lineTotal;
          return (
            <View key={i} style={S.row} wrap={false}>
              <Text style={[S.td, S.cNum]}>{i + 1}</Text>
              {/* Name + SKU on one line */}
              <Text style={[S.td, S.cDesc]}>
                {item.productName}
                {item.sku ? <Text style={S.skuText}>  [#{item.sku}]</Text> : null}
              </Text>
              <Text style={[S.td, S.cQty]}>{item.quantity} {item.unit}</Text>
              {hasDiscount && <Text style={[S.td, S.cRate]}>{cur(item.unitPrice)}</Text>}
              {hasDiscount && <Text style={[S.td, S.cTot]}>{cur(gross)}</Text>}
              {hasDiscount && <Text style={[S.td, S.cDisc]}>{item.discountPct || 0}%</Text>}
              {!hasDiscount && <Text style={[S.td, S.cRate]}>{cur(item.unitPrice)}</Text>}
              <Text style={[S.tdL, S.cTot, { fontFamily: 'Helvetica-Bold' }]}>
                {hasDiscount ? cur(taxable) : cur(gross)}
              </Text>
            </View>
          );
        })}

        {/* tfoot */}
        <View style={S.tfoot}>
          <Text style={[S.tfc, S.cNum]}> </Text>
          <Text style={[S.tfc, S.cDesc, { textAlign: 'right' }]}>Total</Text>
          <Text style={[S.tfc, S.cQty]}>{totalQty}</Text>
          {hasDiscount && <Text style={[S.tfc, S.cRate]}> </Text>}
          {hasDiscount && <Text style={[S.tfc, S.cTot]}>{cur(grossTotal)}</Text>}
          {hasDiscount && <Text style={[S.tfc, S.cDisc]}> </Text>}
          {!hasDiscount && <Text style={[S.tfc, S.cRate]}> </Text>}
          <Text style={[S.tfL, S.cTot]}>
            {hasDiscount ? cur(totalTaxable) : cur(grossTotal)}
          </Text>
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
              <View style={S.sumRow}><Text>Discount</Text><Text style={{ color: '#dc2626' }}>-{cur(inv.totalDiscount)}</Text></View>
            )}
            {inv.totalCGST > 0 && (
              <View style={S.sumRow}><Text>CGST</Text><Text>{cur(inv.totalCGST)}</Text></View>
            )}
            {inv.totalSGST > 0 && (
              <View style={S.sumRow}><Text>SGST</Text><Text>{cur(inv.totalSGST)}</Text></View>
            )}
            {inv.totalIGST > 0 && (
              <View style={S.sumRow}><Text>IGST</Text><Text>{cur(inv.totalIGST)}</Text></View>
            )}
            {totalTax > 0 && (
              <View style={S.sumTaxSep}><Text>Total Tax</Text><Text>{cur(totalTax)}</Text></View>
            )}
            {inv.packingCharges > 0 && (
              <View style={S.sumRow}><Text>Packing</Text><Text>{cur(inv.packingCharges)}</Text></View>
            )}
            {inv.shippingCharges > 0 && (
              <View style={S.sumRow}><Text>Shipping</Text><Text>{cur(inv.shippingCharges)}</Text></View>
            )}
            <View style={S.sumRowBold}>
              <Text>Grand Total</Text><Text>{cur(inv.grandTotal)}</Text>
            </View>
            {(inv.amountPaid || 0) > 0 && (
              <View style={S.sumRowGreen}>
                <Text>Amount Paid ({inv.paymentMethod})</Text>
                <Text>{cur(inv.amountPaid)}</Text>
              </View>
            )}
            {balanceDue > 0.01 && (
              <View style={S.sumRowRed}>
                <Text>Balance Due</Text><Text>{cur(balanceDue)}</Text>
              </View>
            )}
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

        {/* ── Page number (fixed on every page) ── */}
        <Text
          style={S.pageNum}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
