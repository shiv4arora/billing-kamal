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

const fmt = (v = 0) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const Cur = ({ v = 0, neg = false }) => (
  <Text><Text style={S.rupee}>{neg ? '-Rs ' : 'Rs '}</Text>{fmt(v)}</Text>
);

// 3-inch thermal roll: printable width ~72mm (204pt at 72dpi). Height is
// intentionally oversized — receipt rolls are continuous, not paginated —
// so everything renders on one long "page" with no page breaks.
const ROLL_WIDTH = 204;   // ~72mm
const ROLL_HEIGHT = 3000; // effectively unbounded for a single receipt

const S = StyleSheet.create({
  page: {
    width: ROLL_WIDTH,
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 8,
    color: '#111827',
    fontFamily: 'Roboto',
  },
  center:   { textAlign: 'center' },
  bold:     { fontWeight: 'bold' },
  small:    { fontSize: 7, color: '#374151' },
  companyName: { fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 1 },
  companyDetail: { fontSize: 7, color: '#374151', textAlign: 'center', marginBottom: 1 },
  logo: { width: 28, height: 28, marginHorizontal: 'auto', marginBottom: 3 },

  dashed: { borderBottomWidth: 0.75, borderBottomColor: '#111827', borderStyle: 'dashed', marginVertical: 4 },
  dashedLight: { borderBottomWidth: 0.5, borderBottomColor: '#9ca3af', borderStyle: 'dashed', marginVertical: 3 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5, fontSize: 7.5 },

  billLabel: { fontSize: 7, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', marginBottom: 1 },
  billName: { fontSize: 8.5, fontWeight: 'bold', marginBottom: 1 },
  billDetail: { fontSize: 7, color: '#4b5563', marginBottom: 0.5 },

  itemRow: { marginBottom: 3 },
  itemName: { fontSize: 8, fontWeight: 'bold' },
  itemSku: { fontSize: 6.5, color: '#9ca3af' },
  itemCalc: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, marginTop: 0.5 },

  sumRow: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, paddingVertical: 1 },
  sumRowBold: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 10, fontWeight: 'bold', paddingVertical: 2 },

  rupee: { fontSize: 7 },

  wordsLabel: { fontSize: 7, fontWeight: 'bold', marginTop: 4, marginBottom: 1 },
  wordsText: { fontSize: 7, fontStyle: 'italic', color: '#4b5563' },

  termsText: { fontSize: 6.5, color: '#6b7280', marginTop: 4 },

  footer: { textAlign: 'center', fontSize: 8, fontWeight: 'bold', marginTop: 8 },
  footerSub: { textAlign: 'center', fontSize: 6.5, color: '#9ca3af', marginTop: 2 },
});

export function ThermalInvoicePDF({ inv, company, invSettings, customerAddress, customerGstin, customerPhone }) {
  const items = inv.items || [];
  const hasDiscount = items.some(i => (i.discountPct || 0) > 0);
  const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalTax = (inv.totalCGST || 0) + (inv.totalSGST || 0) + (inv.totalIGST || 0);

  return (
    <Document>
      <Page size={[ROLL_WIDTH, ROLL_HEIGHT]} style={S.page}>
        {/* ── Header ── */}
        {company.logo ? <Image style={S.logo} src={company.logo} /> : null}
        <Text style={S.companyName}>{company.name || 'Kamal Jewellers'}</Text>
        {(company.address || 'Sadar Bazar, New Delhi- 110006').split('\n').map((l, i) => (
          <Text key={i} style={S.companyDetail}>{l}</Text>
        ))}
        {company.phone ? <Text style={S.companyDetail}>Ph: {company.phone}</Text> : null}
        <Text style={S.companyDetail}>GSTIN: {company.gstin || '07AHDPR6884P1ZC'}</Text>

        <View style={S.dashed} />

        {/* ── Invoice meta ── */}
        <View style={S.metaRow}><Text>Invoice No:</Text><Text style={S.bold}>{inv.invoiceNumber}</Text></View>
        <View style={S.metaRow}><Text>Date:</Text><Text style={S.bold}>{formatDate(inv.date)}</Text></View>

        <View style={S.dashedLight} />

        {/* ── Bill To ── */}
        <Text style={S.billLabel}>Bill To</Text>
        <Text style={S.billName}>{formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)}</Text>
        {customerAddress ? <Text style={S.billDetail}>{customerAddress}</Text> : null}
        {customerPhone ? <Text style={S.billDetail}>Ph: {customerPhone}</Text> : null}
        {customerGstin ? <Text style={S.billDetail}>GSTIN: {customerGstin}</Text> : null}

        <View style={S.dashed} />

        {/* ── Items ── */}
        {items.map((item, i) => {
          const gross = item.quantity * item.unitPrice;
          const taxable = item.taxableAmount ?? item.lineTotal;
          const amount = hasDiscount ? taxable : gross;
          return (
            <View key={i} style={S.itemRow} wrap={false}>
              <Text style={S.itemName}>
                {i + 1}. {item.productName}
                {item.sku ? <Text style={S.itemSku}>  [#{item.sku}]</Text> : null}
              </Text>
              <View style={S.itemCalc}>
                <Text>{item.quantity} {item.unit} x <Cur v={item.unitPrice} />{hasDiscount && item.discountPct ? ` (-${item.discountPct}%)` : ''}</Text>
                <Text style={S.bold}><Cur v={amount} /></Text>
              </View>
            </View>
          );
        })}

        <View style={S.dashed} />

        {/* ── Summary ── */}
        <View style={S.sumRow}><Text>Total Qty</Text><Text>{totalQty}</Text></View>
        {inv.totalDiscount > 0 && (
          <View style={S.sumRow}><Text>Discount</Text><Text><Cur v={inv.totalDiscount} neg /></Text></View>
        )}
        {inv.totalCGST > 0 && <View style={S.sumRow}><Text>CGST</Text><Text><Cur v={inv.totalCGST} /></Text></View>}
        {inv.totalSGST > 0 && <View style={S.sumRow}><Text>SGST</Text><Text><Cur v={inv.totalSGST} /></Text></View>}
        {inv.totalIGST > 0 && <View style={S.sumRow}><Text>IGST</Text><Text><Cur v={inv.totalIGST} /></Text></View>}
        {totalTax > 0 && <View style={S.sumRow}><Text style={S.bold}>Total Tax</Text><Text style={S.bold}><Cur v={totalTax} /></Text></View>}
        {((inv.packingCharges || 0) + (inv.shippingCharges || 0)) > 0 && (
          <View style={S.sumRow}><Text>Packing &amp; Shipping</Text><Text><Cur v={(inv.packingCharges || 0) + (inv.shippingCharges || 0)} /></Text></View>
        )}

        <View style={S.dashed} />
        <View style={S.sumRowBold}><Text>Grand Total</Text><Text><Cur v={inv.grandTotal} /></Text></View>
        <View style={S.dashed} />

        <Text style={S.wordsLabel}>Amount in Words:</Text>
        <Text style={S.wordsText}>{amountInWords(inv.grandTotal)}</Text>

        {invSettings.terms ? <Text style={S.termsText}>{invSettings.terms}</Text> : null}

        <Text style={S.footer}>Thank You!</Text>
        <Text style={S.footerSub}>Visit Again</Text>
      </Page>
    </Document>
  );
}
