import { PrinterPage } from './pages/PrinterPage';
import { RfidPage } from './pages/RfidPage';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { POSPage } from './pages/POSPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { isAdminAuthenticated } from './lib/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<POSPage />} />
          <Route path="/payment-return" element={<PaymentReturnPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<RequireAdmin />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="products" replace />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="printer" element={<PrinterPage />} />
              <Route path="rfid" element={<RfidPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function RequireAdmin() {
  const location = useLocation();

  if (!isAdminAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

function PaymentReturnPage() {
  useEffect(() => {
    localStorage.setItem('phajay-payment-return', String(Date.now()));
    window.opener?.postMessage({ type: 'PHAPAY_PAYMENT_RETURN' }, window.location.origin);
    window.opener?.focus();

    const timer = window.setTimeout(() => {
      window.close();
    }, 600);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-black">Payment Complete</h1>
        <p className="mt-3 text-slate-300">ກຳລັງປິດໜ້ານີ້ ແລະກັບໄປໜ້າ POS</p>
        <a href="/" className="mt-6 inline-flex rounded-lg bg-white px-5 py-3 font-bold text-slate-950">
          ກັບໄປ POS
        </a>
      </div>
    </main>
  );
}

export default App;
