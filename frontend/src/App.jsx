import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';

import Dashboard from './pages/Dashboard';
import ProductList from './pages/products/ProductList';
import ProductForm from './pages/products/ProductForm';
import BarcodeLabel from './pages/products/BarcodeLabel';
import BulkLabelPrint from './pages/products/BulkLabelPrint';
import OpeningStock from './pages/products/OpeningStock';
import CustomerList from './pages/customers/CustomerList';
import CustomerForm from './pages/customers/CustomerForm';
import CustomerLedger from './pages/customers/CustomerLedger';
import CustomerLedgerPrint from './pages/customers/CustomerLedgerPrint';
import SupplierList from './pages/suppliers/SupplierList';
import SupplierForm from './pages/suppliers/SupplierForm';
import SupplierLedger from './pages/suppliers/SupplierLedger';
import SupplierLedgerPrint from './pages/suppliers/SupplierLedgerPrint';
import SaleInvoiceList from './pages/sales/SaleInvoiceList';
import SaleInvoiceCreate from './pages/sales/SaleInvoiceCreate';
import SaleInvoiceView from './pages/sales/SaleInvoiceView';
import SaleInvoicePrint from './pages/sales/SaleInvoicePrint';
import PurchaseInvoiceList from './pages/purchases/PurchaseInvoiceList';
import PurchaseInvoiceCreate from './pages/purchases/PurchaseInvoiceCreate';
import PurchaseInvoiceView from './pages/purchases/PurchaseInvoiceView';
import Inventory from './pages/Inventory';
import Reminders from './pages/Reminders';
import SalesReport from './pages/reports/SalesReport';
import PurchasesReport from './pages/reports/PurchasesReport';
import InventoryReport from './pages/reports/InventoryReport';
import ProfitLoss from './pages/reports/ProfitLoss';
import Settings from './pages/Settings';
import VendorSalesReport from './pages/reports/VendorSalesReport';
import LoginPage from './pages/auth/LoginPage';
import UserManagement from './pages/auth/UserManagement';
import CrmList from './pages/crm/CrmList';
import CrmForm from './pages/crm/CrmForm';
import CrmDetail from './pages/crm/CrmDetail';
import ProductionList from './pages/production/ProductionList';
import ProductionCreate from './pages/production/ProductionCreate';
import ProductionEdit from './pages/production/ProductionEdit';

/** Redirect to / if already logged in */
function PublicRoute({ children }) {
  const { currentUser } = useAuth();
  if (currentUser) return <Navigate to="/" replace />;
  return children;
}

/** Redirect to /login if not authenticated */
function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
}

function LayoutRoutes() {
  const { can } = useAuth();
  return (
    <ProtectedRoute>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/new" element={<ProductForm />} />
          <Route path="/products/opening-stock" element={<OpeningStock />} />
          <Route path="/products/:id/edit" element={<ProductForm />} />
          <Route path="/customers" element={<CustomerList />} />
          <Route path="/customers/new" element={<CustomerForm />} />
          <Route path="/customers/:id/edit" element={<CustomerForm />} />
          <Route path="/customers/:id/ledger" element={<CustomerLedger />} />
          <Route path="/suppliers" element={<SupplierList />} />
          <Route path="/suppliers/new" element={<SupplierForm />} />
          <Route path="/suppliers/:id/edit" element={<SupplierForm />} />
          <Route path="/suppliers/:id/ledger" element={<SupplierLedger />} />
          <Route path="/sales" element={<SaleInvoiceList />} />
          <Route path="/sales/new" element={<SaleInvoiceCreate />} />
          <Route path="/sales/:id" element={<SaleInvoiceView />} />
          <Route path="/sales/:id/edit" element={<SaleInvoiceCreate />} />
          <Route path="/purchases" element={<PurchaseInvoiceList />} />
          <Route path="/purchases/new" element={<PurchaseInvoiceCreate />} />
          <Route path="/purchases/:id" element={<PurchaseInvoiceView />} />
          <Route path="/purchases/:id/edit" element={<PurchaseInvoiceCreate />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/crm" element={<CrmList />} />
          <Route path="/crm/new" element={<CrmForm />} />
          <Route path="/crm/:id" element={<CrmDetail />} />
          <Route path="/crm/:id/edit" element={<CrmForm />} />
          <Route path="/production" element={<ProductionList />} />
          <Route path="/production/new" element={<ProductionCreate />} />
          <Route path="/production/:id/edit" element={<ProductionEdit />} />
          {can('reports') && <Route path="/reports/sales" element={<SalesReport />} />}
          {can('reports') && <Route path="/reports/purchases" element={<PurchasesReport />} />}
          {can('reports') && <Route path="/reports/inventory" element={<InventoryReport />} />}
          {can('reports') && <Route path="/reports/profit-loss" element={<ProfitLoss />} />}
          {can('reports') && <Route path="/reports/vendor-sales" element={<VendorSalesReport />} />}
          {can('settings') && <Route path="/settings" element={<Settings />} />}
          {can('users_manage') && <Route path="/users" element={<UserManagement />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* Public: Login */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          {/* Full-page views (no sidebar) — protected */}
          <Route path="/sales/:id/print" element={<ProtectedRoute><SaleInvoicePrint /></ProtectedRoute>} />
          <Route path="/products/:id/label" element={<ProtectedRoute><BarcodeLabel /></ProtectedRoute>} />
          <Route path="/labels/bulk" element={<ProtectedRoute><BulkLabelPrint /></ProtectedRoute>} />
          <Route path="/customers/:id/ledger/print" element={<ProtectedRoute><CustomerLedgerPrint /></ProtectedRoute>} />
          <Route path="/suppliers/:id/ledger/print" element={<ProtectedRoute><SupplierLedgerPrint /></ProtectedRoute>} />
          {/* Main app with sidebar */}
          <Route path="/*" element={<LayoutRoutes />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
