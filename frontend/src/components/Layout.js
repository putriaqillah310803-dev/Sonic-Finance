import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BranchSelect } from "@/components/Shared";
import {
  LayoutDashboard, ShoppingCart, Wallet, Boxes, HandCoins,
  FileBarChart, Calculator, Database, Users, LogOut, Menu, Languages, Drumstick,
} from "lucide-react";

const NAV = [
  { to: "/", icon: LayoutDashboard, key: "nav_dashboard", end: true },
  { to: "/sales", icon: ShoppingCart, key: "nav_sales" },
  { to: "/expenses", icon: Wallet, key: "nav_expenses" },
  { to: "/inventory", icon: Boxes, key: "nav_inventory" },
  { to: "/debt", icon: HandCoins, key: "nav_debt" },
  { to: "/foodcost", icon: Calculator, key: "nav_foodcost" },
  { to: "/reports", icon: FileBarChart, key: "nav_reports" },
  { to: "/master", icon: Database, key: "nav_master", admin: true },
  { to: "/users", icon: Users, key: "nav_users", admin: true },
];

function NavItems({ onNav }) {
  const { t, isAdmin } = useApp();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.filter((n) => !n.admin || isAdmin).map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNav}
          data-testid={`nav-${n.key}`}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`
          }
        >
          <n.icon className="h-[18px] w-[18px]" />
          {t(n.key)}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  const { t } = useApp();
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <img src="/sonic-finance-logo.png" alt="Sonic Finance" className="h-11 w-11 rounded-xl object-cover shadow-md" />
      <div>
        <div className="text-lg font-extrabold tracking-tight leading-none">{t("app_name")}</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Sonic Chicken</div>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const { t, lang, setLang, user, logout } = useApp();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card fixed inset-y-0 z-30">
        <Brand />
        <div className="flex-1 overflow-y-auto sonic-scroll py-2">
          <NavItems />
        </div>
        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 mb-1">
            <div className="text-sm font-semibold truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate">{t(user?.role)}</div>
          </div>
          <Button variant="ghost" onClick={doLogout} data-testid="logout-btn"
            className="w-full justify-start gap-3 text-slate-600 dark:text-slate-300">
            <LogOut className="h-[18px] w-[18px]" /> {t("logout")}
          </Button>
        </div>
      </aside>

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-20 h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center gap-3 px-4 sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" data-testid="mobile-menu-btn">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <Brand />
              <NavItems onNav={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex-1" />

          <div className="hidden sm:block">
            <BranchSelect testid="header-branch-select" className="h-10 w-44" />
          </div>

          <Button
            variant="outline"
            size="sm"
            data-testid="lang-toggle"
            onClick={() => setLang(lang === "id" ? "en" : "id")}
            className="gap-2 h-10 font-semibold"
          >
            <Languages className="h-4 w-4" />
            {lang === "id" ? "ID" : "EN"}
          </Button>
        </header>

        <div className="sm:hidden px-4 pt-3">
          <BranchSelect testid="mobile-branch-select" className="h-10 w-full" />
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 sonic-scroll">{children}</main>
      </div>
    </div>
  );
}
