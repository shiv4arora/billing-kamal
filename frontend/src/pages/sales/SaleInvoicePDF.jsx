import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { formatCurrency, formatDate, amountInWords, formatCustomerDisplay } from '../../utils/helpers';

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
  logo: { width: 38, height: 38, marginBottom: 4 },
  companyName: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  companyDetail: { fontSize: 7.5, color: '#4b5563', marginBottom: 1 },
  invoiceTitle: { fontSize: 17, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginBottom: 5, letterSpacing: 0.5 },
  invoiceMetaRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  invoiceMetaLabel: { fontSize: 8.5, color: '#374151', marginRight: 4 },
  invoiceMetaValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },

  // ── Bill To ──
  billTo: { marginBottom: 10 },
  billToLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  billToName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  billToDetail: { fontSize: 7.5, color: '#4b5563', marginBottom: 1 },

  // ── Table ──
  table: { marginBottom: 8 },
  thead: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderWidth: 0.5, borderColor: '#9ca3af' },
  th: { padding: '4 5', fontSize: 8, fontFamily: 'Helvetica-Bold', borderRightWidth: 0.5, borderRightColor: '#9ca3af' },
  thLast: { padding: '4 5', fontSize: 8, fontFamily: 'Helvetica-Bold' },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#d1d5db',
    borderLeftWidth: 0.5,
    borderLeftColor: '#9ca3af',
    borderRightWidth: 0.5,
    borderRightColor: '#9ca3af',
  },
  td: { padding: '3 5', fontSize: 8, borderRightWidth: 0.5, borderRightColor: '#d1d5db' },
  tdLast: { padding: '3 5', fontSize: 8 },
  tfoot: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderWidth: 0.5,
    borderColor: '#9ca3af',
    fontFamily: 'Helvetica-Bold',
  },
  tfootCell: { padding: '4 5', fontSize: 8, borderRightWidth: 0.5, borderRightColor: '#9ca3af' },
  tfootCellLast: { padding: '4 5', fontSize: 8 },
  sku: { fontSize: 6.5, color: '#9ca3af' },

  // column widths
  colNum:   { width: 20 },
  colDesc:  { flex: 1 },
  colQty:   { width: 52, textAlign: 'right' },
  colRate:  { width: 58, textAlign: 'right' },
  colTotal: { width: 62, textAlign: 'right' },
  colDisc:  { width: 38, textAlign: 'right' },
  colAmt:   { width: 62, textAlign: 'right' },

  // ── Summary ──
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  summaryLeft: { flex: 1, paddingRight: 16 },
  summaryRight: { width: 155 },
  amtWordsLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 2 },
  amtWordsText:  { fontSize: 7.5, color: '#4b5563', fontFamily: 'Helvetica-Oblique' },
  bankLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#374151', marginTop: 8, marginBottom: 2 },
  bankText:  { fontSize: 7.5, color: '#4b5563' },
  sumRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5, fontSize: 8.5 },
  sumRowBold:{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, fontSize: 9.5, fontFamily: 'Helvetica-Bold', borderTopWidth: 0.75, borderTopColor: '#6b7280', marginTop: 2 },
  sumRowRed: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5, fontSize: 8.5, color: '#dc2626' },
  sumRowGreen:{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5, fontSize: 8.5, color: '#16a34a' },

  // ── Terms / Signature ──
  terms: { marginTop: 14, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: '#d1d5db', fontSize: 7.5, color: '#6b7280' },
  termsBold: { fontFamily: 'Helvetica-Bold', color: '#374151' },
  signature: { marginTop: 24, alignItems: 'flex-end' },
  signatureLine: { width: 90, borderBottomWidth: 0.5, borderBottomColor: '#9ca3af', marginBottom: 3 },
  signatureLabel: { fontSize: 7.5, color: '#4b5563' },

  // ── Page number (fixed footer) ──
  pageNum: { position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', fontSize: 7, color: '#9ca3af' },
});

export function InvoicePDF({ inv, company, invSettings, customerAddress, customerGstin, customerPhone }) {
  const items       = inv.items || [];
  const hasDiscount = items.some(i => (i.discountPct || 0) > 0);
  const totalQty    = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalTax    = (inv.totalCGST || 0) + (inv.totalSGST || 0) + (inv.totalIGST || 0);
  const totalTaxable = items.reduce((s, i) => s + (Number(i.taxableAmount) || Number(i.lineTotal) || 0), 0);
  const balanceDue  = (inv.grandTotal || 0) - (inv.amountPaid || 0);
  const grossTotal  = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

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
            <View style={S.invoiceMetaRow}>
              <Text style={S.invoiceMetaLabel}>Invoice No: </Text>
              <Text style={S.invoiceMetaValue}>{inv.invoiceNumber}</Text>
            </View>
            <View style={S.invoiceMetaRow}>
              <Text style={S.invoiceMetaLabel}>Date: </Text>
              <Text style={S.invoiceMetaValue}>{formatDate(inv.date)}</Text>
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
        <View style={S.table}>
          {/* thead */}
          <View style={S.thead}>
            <Text style={[S.th, S.colNum]}>#</Text>
            <Text style={[S.th, S.colDesc]}>Description</Text>
            <Text style={[S.th, S.colQty]}>Qty</Text>
            <Text style={[S.th, S.colRate]}>Rate</Text>
            {hasDiscount ? <Text style={[S.th, S.colTotal]}>Total</Text>   : null}
            {hasDiscount ? <Text style={[S.th, S.colDisc]}>Disc%</Text>   : null}
            <Text style={[hasDiscount ? S.thLast : S.th, S.colTotal]}>
              {hasDiscount ? 'Amount' : 'Total'}
            </Text>
          </View>

          {/* tbody */}
          {items.map((item, i) => {
            const gross   = item.quantity * item.unitPrice;
            const taxable = item.taxableAmount ?? item.lineTotal;
            return (
              <View key={i} style={S.row} wrap={false}>
                <Text style={[S.td, S.colNum]}>{i + 1}</Text>
                <View style={[S.td, S.colDesc, { flexDirection: 'column' }]}>
                  <Text>{item.productName}</Text>
                  {item.sku ? <Text style={S.sku}>[#{item.sku}]</Text> : null}
                </View>
                <Text style={[S.td, S.colQty]}>{item.quantity} {item.unit}</Text>
                <Text style={[S.td, S.colRate]}>{formatCurrency(item.unitPrice)}</Text>
                {hasDiscount ? <Text style={[S.td, S.colTotal]}>{formatCurrency(gross)}</Text>   : null}
                {hasDiscount ? <Text style={[S.td, S.colDisc]}>{item.discountPct || 0}%</Text>  : null}
                <Text style={[hasDiscount ? S.tdLast : S.td, S.colTotal, { fontFamily: 'Helvetica-Bold' }]}>
                  {hasDiscount ? formatCurrency(taxable) : formatCurrency(gross)}
                </Text>
              </View>
            );
          })}

          {/* tfoot */}
          <View style={S.tfoot}>
            <Text style={[S.tfootCell, S.colNum]}> </Text>
            <Text style={[S.tfootCell, S.colDesc, { textAlign: 'right' }]}>Total</Text>
            <Text style={[S.tfootCell, S.colQty]}>{totalQty}</Text>
            <Text style={[S.tfootCell, S.colRate]}> </Text>
            {hasDiscount ? <Text style={[S.tfootCell, S.colTotal]}>{formatCurrency(grossTotal)}</Text> : null}
            {hasDiscount ? <Text style={[S.tfootCell, S.colDisc]}> </Text> : null}
            <Text style={[hasDiscount ? S.tfootCellLast : S.tfootCell, S.colTotal]}>
              {hasDiscount ? formatCurrency(totalTaxable) : formatCurrency(grossTotal)}
            </Text>
          </View>
        </View>

        {/* ── Summary ── */}
        <View style={S.summary}>
          <View style={S.summaryLeft}>
            <Text style={S.amtWordsLabel}>Amount in Words:</Text>
            <Text style={S.amtWordsText}>{amountInWords(inv.grandTotal)}</Text>
            {invSettings.bankDetails ? (
              <>
                <Text style={S.bankLabel}>Bank Details:</Text>
                <Text style={S.bankText}>{invSettings.bankDetails}</Text>
              </>
            ) : null}
          </View>
          <View style={S.summaryRight}>
            {inv.totalDiscount > 0 && (
              <View style={S.sumRow}><Text>Discount</Text><Text style={{ color: '#dc2626' }}>-{formatCurrency(inv.totalDiscount)}</Text></View>
            )}
            {inv.totalCGST > 0 && (
              <View style={S.sumRow}><Text>CGST</Text><Text>{formatCurrency(inv.totalCGST)}</Text></View>
            )}
            {inv.totalSGST > 0 && (
              <View style={S.sumRow}><Text>SGST</Text><Text>{formatCurrency(inv.totalSGST)}</Text></View>
            )}
            {inv.totalIGST > 0 && (
              <View style={S.sumRow}><Text>IGST</Text><Text>{formatCurrency(inv.totalIGST)}</Text></View>
            )}
            {totalTax > 0 && (
              <View style={[S.sumRow, { fontFamily: 'Helvetica-Bold', borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 2, marginTop: 1 }]}>
                <Text>Total Tax</Text><Text>{formatCurrency(totalTax)}</Text>
              </View>
            )}
            {inv.packingCharges > 0 && (
              <View style={S.sumRow}><Text>Packing</Text><Text>{formatCurrency(inv.packingCharges)}</Text></View>
            )}
            {inv.shippingCharges > 0 && (
              <View style={S.sumRow}><Text>Shipping</Text><Text>{formatCurrency(inv.shippingCharges)}</Text></View>
            )}
            <View style={S.sumRowBold}>
              <Text>Grand Total</Text><Text>{formatCurrency(inv.grandTotal)}</Text>
            </View>
            {(inv.amountPaid || 0) > 0 && (
              <View style={S.sumRowGreen}>
                <Text>Amount Paid ({inv.paymentMethod})</Text>
                <Text>{formatCurrency(inv.amountPaid)}</Text>
              </View>
            )}
            {balanceDue > 0.01 && (
              <View style={S.sumRowRed}>
                <Text>Balance Due</Text><Text>{formatCurrency(balanceDue)}</Text>
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
          <Text style={S.signatureLabel}>Authorised Signatory</Text>
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
