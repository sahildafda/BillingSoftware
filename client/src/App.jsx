import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import OtpVerification from "./pages/auth/OtpVerification";
import Dashboard from "./pages/Dashboard";
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
          <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  );
}