import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "@/App.css";
import { AppProvider, useApp } from "@/context/AppContext";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Sales from "@/pages/Sales";
import Expenses from "@/pages/Expenses";
import Inventory from "@/pages/Inventory";
import VendorDebt from "@/pages/VendorDebt";
import FoodCost from "@/pages/FoodCost";
import Reports from "@/pages/Reports";
import MasterData from "@/pages/MasterData";
import Users from "@/pages/Users";


function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <img src="/sonic-finance-logo.png" alt="Sonic Finance" className="h-16 w-16 rounded-2xl object-cover animate-pulse shadow-lg" />
    </div>
  );
}

function Protected({ children, adminOnly }) {
  const { user, isAdmin } = useApp();
  if (user === null) return <Splash />;
  if (user === false) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function LoginRoute() {
  const { user } = useApp();
  if (user === null) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

function App() {
  return (
    <div className="App">
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/sales" element={<Protected><Sales /></Protected>} />
            <Route path="/expenses" element={<Protected><Expenses /></Protected>} />
            <Route path="/inventory" element={<Protected><Inventory /></Protected>} />
            <Route path="/debt" element={<Protected><VendorDebt /></Protected>} />
            <Route path="/foodcost" element={<Protected><FoodCost /></Protected>} />
            <Route path="/reports" element={<Protected><Reports /></Protected>} />
            <Route path="/master" element={<Protected adminOnly><MasterData /></Protected>} />
            <Route path="/users" element={<Protected adminOnly><Users /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AppProvider>
    </div>
  );
}

export default App;
