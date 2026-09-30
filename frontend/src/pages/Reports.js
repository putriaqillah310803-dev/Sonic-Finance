import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { http, API, fmtRp } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, PeriodFilter, usePeriod } from "@/components/Shared";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, ArrowDownUp } from "lucide-react";

export default function Reports() {
  const { t, branch } = useApp();
  const ctrl = usePeriod();
  const [d, setD] = useState({});

  const load = async () => {
    const { start, end } = ctrl.range();
    const { data } = await http.get("/reports/cashflow", { params: { branch, start, end } });
    setD(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [branch, ctrl.period, ctrl.start, ctrl.end]);

  const doExport = async (fmt) => {
    const { start, end } = ctrl.range();
    try {
      const res = await http.get("/reports/export", {
        params: { fmt, branch, start, end }, responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan_sonicgo.${fmt === "pdf" ? "pdf" : "xlsx"}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(t("saved"));
    } catch (e) { toast.error("Export failed"); }
  };

  return (
    <div>
      <PageHeader title={t("nav_reports")} subtitle={t("reports")}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter ctrl={ctrl} t={t} />
            <Button variant="outline" onClick={() => doExport("excel")} data-testid="export-excel-btn" className="gap-2 h-11">
              <FileSpreadsheet className="h-4 w-4" /> {t("export_excel")}
            </Button>
            <Button onClick={() => doExport("pdf")} data-testid="export-pdf-btn" className="gap-2 h-11">
              <FileText className="h-4 w-4" /> {t("export_pdf")}
            </Button>
          </div>
        } />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5" data-testid="report-in-card">
          <div className="text-xs font-mono uppercase text-slate-400">{t("money_in")} ({t("net_sales")})</div>
          <div className="font-mono text-2xl font-extrabold mt-1 text-green-600">{fmtRp(d.total_in)}</div>
        </Card>
        <Card className="p-5" data-testid="report-out-card">
          <div className="text-xs font-mono uppercase text-slate-400">{t("money_out")}</div>
          <div className="font-mono text-2xl font-extrabold mt-1 text-red-600">{fmtRp(d.total_out)}</div>
        </Card>
        <Card className="p-5" data-testid="report-net-card">
          <div className="text-xs font-mono uppercase text-slate-400">{t("balance")}</div>
          <div className="font-mono text-2xl font-extrabold mt-1">{fmtRp(d.net)}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2" data-testid="ledger-card">
          <div className="flex items-center gap-2 mb-4"><ArrowDownUp className="h-5 w-5 text-primary" /><h3 className="font-semibold">{t("cash_ledger")}</h3></div>
          <div className="overflow-x-auto sonic-scroll max-h-[420px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card"><tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
                <th className="py-2 pr-3">{t("date")}</th><th className="py-2 pr-3 text-right">{t("money_in")}</th>
                <th className="py-2 pr-3 text-right">{t("money_out")}</th><th className="py-2 pr-3 text-right">{t("balance")}</th>
              </tr></thead>
              <tbody>
                {(d.ledger || []).length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400">{t("no_data")}</td></tr>}
                {(d.ledger || []).map((r, i) => (
                  <tr key={i} className="border-b border-border/60" data-testid={`ledger-row-${i}`}>
                    <td className="py-2.5 pr-3 font-mono text-xs">{r.date}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-green-600">{fmtRp(r.in)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-red-600">{fmtRp(r.out)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono font-bold">{fmtRp(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5" data-testid="expense-cat-card">
          <h3 className="font-semibold mb-4">{t("expense_by_cat")}</h3>
          <div className="space-y-2">
            {(d.expense_by_category || []).length === 0 && <p className="text-sm text-slate-400">{t("no_data")}</p>}
            {(d.expense_by_category || []).map((c, i) => {
              const max = d.expense_by_category[0]?.amount || 1;
              return (
                <div key={i} data-testid={`exp-cat-${i}`}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300">{c.category}</span>
                    <span className="font-mono font-semibold">{fmtRp(c.amount)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(c.amount / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
