import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { http, fmtRp, apiErr } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader, StatusBadge } from "@/components/Shared";
import { toast } from "sonner";
import { HandCoins, CalendarClock, AlertOctagon } from "lucide-react";

export default function VendorDebt() {
  const { t, branch } = useApp();
  const [purchases, setPurchases] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [payAmt, setPayAmt] = useState("");
  const [active, setActive] = useState(null);

  const load = async () => {
    const [p, v] = await Promise.all([
      http.get("/purchases", { params: { branch } }),
      http.get("/vendors"),
    ]);
    setPurchases(p.data); setVendors(v.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [branch]);

  const vmap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const totalDebt = purchases.reduce((s, p) => s + (p.amount - (p.paid || 0)), 0);
  const totalUnpaid = purchases.filter((p) => p.status !== "paid").length;
  const soon = purchases.filter((p) => p.status !== "paid" && p.due_date &&
    new Date(p.due_date) <= new Date(Date.now() + 7 * 86400000));

  const pay = async () => {
    try {
      await http.post(`/purchases/${active.id}/pay`, { amount: Number(payAmt) });
      toast.success(t("saved")); setActive(null); setPayAmt(""); load();
    } catch (err) { toast.error(apiErr(err)); }
  };

  return (
    <div>
      <PageHeader title={t("nav_debt")} subtitle={t("debt_tracking")} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5" data-testid="debt-total-card">
          <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3"><HandCoins className="h-5 w-5 text-primary" /></div>
          <div className="text-xs font-mono uppercase text-slate-400">{t("total_debt")}</div>
          <div className="font-mono text-2xl font-extrabold mt-1" data-testid="debt-total-value">{fmtRp(totalDebt)}</div>
        </Card>
        <Card className="p-5">
          <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-3"><CalendarClock className="h-5 w-5 text-amber-600" /></div>
          <div className="text-xs font-mono uppercase text-slate-400">Due ≤ 7 hari</div>
          <div className="font-mono text-2xl font-extrabold mt-1">{soon.length}</div>
        </Card>
        <Card className="p-5">
          <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-3"><AlertOctagon className="h-5 w-5 text-blue-600" /></div>
          <div className="text-xs font-mono uppercase text-slate-400">{t("unpaid")}</div>
          <div className="font-mono text-2xl font-extrabold mt-1">{totalUnpaid}</div>
        </Card>
      </div>

      <Card className="p-5" data-testid="debt-table-card">
        <div className="overflow-x-auto sonic-scroll">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
              <th className="py-2 pr-3">{t("vendor")}</th><th className="py-2 pr-3">{t("description")}</th>
              <th className="py-2 pr-3">{t("due_date")}</th><th className="py-2 pr-3 text-right">{t("total")}</th>
              <th className="py-2 pr-3 text-right">{t("paid")}</th><th className="py-2 pr-3 text-right">{t("remaining")}</th>
              <th className="py-2 pr-3">{t("status")}</th><th className="py-2 pr-3">{t("actions")}</th>
            </tr></thead>
            <tbody>
              {purchases.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-400">{t("no_data")}</td></tr>}
              {purchases.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-slate-50 dark:hover:bg-slate-800/40" data-testid={`debt-row-${r.id}`}>
                  <td className="py-2.5 pr-3 font-medium">{vmap[r.vendor_id] || "-"}</td>
                  <td className="py-2.5 pr-3 text-xs">{r.description}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs">{r.due_date}</td>
                  <td className="py-2.5 pr-3 text-right font-mono">{fmtRp(r.amount)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-green-600">{fmtRp(r.paid)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono font-bold">{fmtRp(r.amount - (r.paid || 0))}</td>
                  <td className="py-2.5 pr-3"><StatusBadge status={r.status} t={t} /></td>
                  <td className="py-2.5 pr-3">
                    {r.status !== "paid" && (
                      <Button size="sm" variant="outline" data-testid={`debt-pay-btn-${r.id}`}
                        onClick={() => { setActive(r); setPayAmt(String(r.amount - (r.paid || 0))); }}>
                        {t("record_payment")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent data-testid="pay-dialog">
          <DialogHeader><DialogTitle>{t("record_payment")}</DialogTitle></DialogHeader>
          {active && (
            <div className="space-y-4">
              <div className="text-sm text-slate-500">{vmap[active.vendor_id]} — {t("remaining")}: <span className="font-mono font-bold">{fmtRp(active.amount - (active.paid || 0))}</span></div>
              <div className="space-y-2">
                <Label>{t("pay_amount")}</Label>
                <Input type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} className="h-11 font-mono" data-testid="pay-amount-input" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>{t("cancel")}</Button>
            <Button onClick={pay} data-testid="pay-confirm-btn">{t("confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
