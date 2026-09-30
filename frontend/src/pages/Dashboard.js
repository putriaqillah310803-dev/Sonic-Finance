import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { http, fmtRp, apiErr } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { PageHeader, PeriodFilter, usePeriod } from "@/components/Shared";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Wallet, Percent, AlertTriangle, HandCoins } from "lucide-react";

const CHANNEL_COLORS = { Reguler: "#10B981", GrabFood: "#00B14F", GoFood: "#00AA13", ShopeeFood: "#EE4D2D" };

function Kpi({ icon: Icon, label, value, tone, testid, sub }) {
  const tones = {
    red: "from-red-500 to-red-600",
    green: "from-emerald-500 to-emerald-600",
    blue: "from-blue-500 to-blue-600",
    amber: "from-amber-500 to-orange-500",
  };
  return (
    <Card className="p-5 relative overflow-hidden animate-fade-up" data-testid={testid}>
      <div className={`absolute right-0 top-0 h-24 w-24 rounded-full bg-gradient-to-br ${tones[tone]} opacity-10 -mr-6 -mt-6`} />
      <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${tones[tone]} flex items-center justify-center mb-4 shadow-md`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="text-xs font-mono uppercase tracking-wider text-slate-400">{label}</div>
      <div className="font-mono text-2xl font-extrabold tracking-tight mt-1" data-testid={`${testid}-value`}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const { t, branch } = useApp();
  const ctrl = usePeriod();
  const [data, setData] = useState(null);

  const load = async () => {
    const { start, end } = ctrl.range();
    try {
      const { data } = await http.get("/dashboard", { params: { branch, start, end } });
      setData(data);
    } catch (e) {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [branch, ctrl.period, ctrl.start, ctrl.end]);

  const d = data || {};
  const channels = (d.channels || []).map((c) => ({ ...c, fill: CHANNEL_COLORS[c.channel] || "#DC2626" }));

  return (
    <div>
      <PageHeader
        title={t("nav_dashboard")}
        subtitle={t("app_tagline")}
        right={<PeriodFilter ctrl={ctrl} t={t} />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi icon={TrendingUp} tone="red" label={t("total_sales")} value={fmtRp(d.total_gross)}
          sub={`${t("net_sales")}: ${fmtRp(d.total_net)}`} testid="kpi-total-sales" />
        <Kpi icon={TrendingDown} tone="amber" label={t("total_expenses")} value={fmtRp(d.total_expenses)}
          testid="kpi-total-expenses" />
        <Kpi icon={Wallet} tone="green" label={t("cash_flow")} value={fmtRp(d.cash_flow)} testid="kpi-cashflow" />
        <Kpi icon={Percent} tone="blue" label={t("food_cost_pct")} value={`${d.food_cost_pct || 0}%`}
          sub={`${t("vendor_debt")}: ${fmtRp(d.vendor_debt)}`} testid="kpi-foodcost" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 lg:col-span-2" data-testid="sales-trend-card">
          <h3 className="font-semibold mb-4">{t("sales_trend")}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={d.trend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}jt`} />
              <Tooltip formatter={(v) => fmtRp(v)} />
              <Line type="monotone" dataKey="net" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5" data-testid="channel-card">
          <h3 className="font-semibold mb-4">{t("channel_breakdown")}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={channels} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="channel" tick={{ fontSize: 12 }} width={80} />
              <Tooltip formatter={(v) => fmtRp(v)} />
              <Bar dataKey="gross" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5" data-testid="low-stock-card">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold">{t("low_stock_alert")}</h3>
        </div>
        {(d.low_stock || []).length === 0 ? (
          <p className="text-sm text-slate-500">{t("no_low_stock")}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {d.low_stock.map((p) => (
              <div key={p.id} className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                data-testid={`low-stock-${p.id}`}>
                <div className="text-sm font-semibold truncate">{p.name}</div>
                <div className="font-mono text-xs text-amber-700 dark:text-amber-300 mt-1">
                  {t("stock")}: {p.stock} {p.unit} / {t("min")}: {p.min_stock}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
