import { SettingsProvider } from './SettingsContext';
import { ProductProvider } from './ProductContext';
import { CustomerProvider } from './CustomerContext';
import { SupplierProvider } from './SupplierContext';
import { InvoiceProvider } from './InvoiceContext';
import { LedgerProvider } from './LedgerContext';
import { AuthProvider } from './AuthContext';

export function AppProvider({ children }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ProductProvider>
          <CustomerProvider>
            <SupplierProvider>
              <InvoiceProvider>
                <LedgerProvider>
                  {children}
                </LedgerProvider>
              </InvoiceProvider>
            </SupplierProvider>
          </CustomerProvider>
        </ProductProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
