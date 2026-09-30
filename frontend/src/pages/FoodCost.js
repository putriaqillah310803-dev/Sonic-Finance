import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { http, fmtRp } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { PageHeader, PeriodFilter, usePeriod } from "@/components/Shared";
import { Calculator, Percent } from "lucide-react";

export default function FoodCost() {
  const { t, branch } = useApp();
  const ctrl = usePeriod();
  const [d, setD] = useState({});

  const load = async () => {
    const { start, end } = ctrl.range();
    const { data } = await http.get("/foodcost", { params: { branch, start, end } });
    setD(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [branch, ctrl.period, ctrl.start, ctrl.end]);

  const fcColor = (pct) => pct <= 35 ? "text-green-600" : pct <= 45 ? "text-amber-600" : "text-red-600";
  const rows = [
    [t("beginning"), d.beginning], [t("purchases"), d.purchases],
    [t("ending"), d.ending], [t("spoilage"), d.spoilage],
    [t("usage"), d.usage], [t("net_sales"), d.net_sales],
  ];

  return (
    <div>
      <PageHeader title={t("nav_foodcost")} subtitle={t("foodcost_analysis")}
        right={<PeriodFilter ctrl={ctrl} t={t} />} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6 flex flex-col items-center justify-center text-center bg-gradient-to-br from-primary to-red-700 text-white" data-testid="fc-percent-card">
          <Percent className="h-8 w-8 mb-3 opacity-80" />
          <div className="text-xs font-mono uppercase tracking-wider opacity-80">{t("food_cost_pct")}</div>
          <div className="font-mono text-5xl font-extrabold mt-2" data-testid="fc-percent-value">{d.food_cost_pct || 0}%</div>
          <p className="text-xs opacity-75 mt-4 leading-relaxed">{t("fc_formula")}</p>
        </Card>

        <Card className="p-5 lg:col-span-2" data-testid="fc-breakdown-card">
          <div className="flex items-center gap-2 mb-4"><Calculator className="h-5 w-5 text-primary" /><h3 className="font-semibold">{t("foodcost_analysis")}</h3></div>
          <table className="w-full text-sm">
            <tbody>
              {rows.map(([label, val], i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-3 text-slate-600 dark:text-slate-300">{label}</td>
                  <td className="py-3 text-right font-mono font-semibold">{fmtRp(val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="p-5" data-testid="fc-menu-card">
        <h3 className="font-semibold mb-4">{t("per_menu_fc")}</h3>
        <div className="overflow-x-auto sonic-scroll">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
              <th className="py-2 pr-3">Menu</th><th className="py-2 pr-3 text-right">{t("sell_price")}</th>
              <th className="py-2 pr-3 text-right">{t("hpp")}</th><th className="py-2 pr-3 text-right">Food Cost %</th>
            </tr></thead>
            <tbody>
              {(d.menus || []).length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400">{t("no_data")}</td></tr>}
              {(d.menus || []).map((m, i) => (
                <tr key={i} className="border-b border-border/60" data-testid={`fc-menu-row-${i}`}>
                  <td className="py-2.5 pr-3 font-medium">{m.name}</td>
                  <td className="py-2.5 pr-3 text-right font-mono">{fmtRp(m.sell_price)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono">{fmtRp(m.hpp)}</td>
                  <td className={`py-2.5 pr-3 text-right font-mono font-bold ${fcColor(m.fc_pct)}`}>{m.fc_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
