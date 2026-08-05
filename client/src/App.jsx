import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import OtpVerification from "./pages/auth/OtpVerification";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Suppliers from "./pages/Suppliers";
import Billing from "./pages/Billing";
import InvoiceHistory from "./pages/InvoiceHistory";
import PageTransition from "./components/layout/PageTransition";
import { ROUTES } from "./constants/routes";

export default function App() {
  return (
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path={ROUTES.LOGIN} element={<PageTransition><Login /></PageTransition>} />
          <Route path={ROUTES.REGISTER} element={<PageTransition><Register /></PageTransition>} />
          <Route path={ROUTES.OTP} element={<PageTransition><OtpVerification /></PageTransition>} />
          <Route path={ROUTES.DASHBOARD} element={<PageTransition><Dashboard /></PageTransition>} />
          <Route path={ROUTES.PRODUCTS} element={<PageTransition><Products /></PageTransition>} />
          <Route path={ROUTES.CUSTOMERS} element={<PageTransition><Customers /></PageTransition>} />
          <Route path={ROUTES.SUPPLIERS} element={<PageTransition><Suppliers /></PageTransition>} />
          <Route path={ROUTES.BILLING} element={<PageTransition><Billing /></PageTransition>} />
          <Route path={ROUTES.REPORTS} element={<PageTransition><InvoiceHistory /></PageTransition>} />
          <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  );
}