import { SettingsProvider } from './SettingsContext';
import { ProductProvider } from './ProductContext';
import { CustomerProvider } from './CustomerContext';
import { SupplierProvider } from './SupplierContext';
import { InvoiceProvider } from './InvoiceContext';
import { LedgerProvider } from './LedgerContext';
import { ReminderProvider } from './ReminderContext';
import { AuthProvider } from './AuthContext';
import { ToastProvider } from './ToastContext';

export function AppProvider({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <SettingsProvider>
          <ProductProvider>
            <CustomerProvider>
              <SupplierProvider>
                <InvoiceProvider>
                  <LedgerProvider>
                    <ReminderProvider>
                      {children}
                    </ReminderProvider>
                  </LedgerProvider>
                </InvoiceProvider>
              </SupplierProvider>
            </CustomerProvider>
          </ProductProvider>
        </SettingsProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
