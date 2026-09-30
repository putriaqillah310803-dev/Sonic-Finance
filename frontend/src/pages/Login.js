import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Languages } from "lucide-react";

import { apiErr } from "@/lib/api";
import { toast } from "sonner";

export default function Login() {
  const { t, login, lang, setLang } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("putriaqillah310803@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      toast.success(t("saved"));
      navigate("/");
    } catch (err) {
      const msg = apiErr(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-primary text-white p-12 relative overflow-hidden">
        <div className="absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute top-1/3 -left-10 h-60 w-60 rounded-full bg-black/10" />
        <div className="flex items-center gap-3 relative">
          <img src="/sonic-finance-logo.png" alt="Sonic Finance" className="h-14 w-14 rounded-2xl object-cover shadow-lg" />
          <span className="text-2xl font-extrabold">Sonic Finance</span>
        </div>
        <div className="relative">
          <h2 className="text-4xl font-extrabold leading-tight mb-4">
            Kelola Keuangan<br />Sonic Chicken<br /><span className="text-amber-300">dalam Satu Layar.</span>
          </h2>
          <p className="text-white/80 max-w-md">
            Keuangan, Penjualan, Persediaan & Food Cost — menggantikan pencatatan manual Excel dengan
            perhitungan otomatis dan laporan yang jelas.
          </p>
        </div>
        <div className="relative text-white/60 text-sm font-mono">ERP F&B • Multi-Cabang • ID / EN</div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-background relative">
        <button
          onClick={() => setLang(lang === "id" ? "en" : "id")}
          data-testid="login-lang-toggle"
          className="absolute top-6 right-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-primary"
        >
          <Languages className="h-4 w-4" /> {lang === "id" ? "ID" : "EN"}
        </button>

        <div className="w-full max-w-sm animate-fade-up">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <img src="/sonic-finance-logo.png" alt="Sonic Finance" className="h-12 w-12 rounded-xl object-cover" />
            <span className="text-xl font-extrabold">Sonic Finance</span>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight mb-1">{t("login_title")}</h1>
          <p className="text-sm text-slate-500 mb-8">{t("login_sub")}</p>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required className="h-12" data-testid="login-email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required className="h-12" data-testid="login-password" placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-red-600" data-testid="login-error">{error}</p>}
            <Button type="submit" disabled={loading} data-testid="login-submit"
              className="w-full h-12 text-base font-semibold">
              {loading ? t("signing_in") : t("login")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
