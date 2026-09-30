import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { http, fmtRp, today, apiErr } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, SSelect, ReceiptUpload, ReceiptThumb } from "@/components/Shared";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

const EXP_CATS = ["Bahan Ayam", "Bahan Pelengkap", "Bahan Roti", "Bahan Minyak",
  "Bahan Bumbu/Groceries", "Bahan Perkedel", "Bahan Nasgor", "Bahan Pembungkus",
  "Operasional", "Transport", "Lain-lain"];

export default function Expenses() {
  const { t, branch, branches } = useApp();
  const [tab, setTab] = useState("petty");
  const [expenses, setExpenses] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [vendors, setVendors] = useState([]);

  const defBranch = branch !== "all" ? branch : branches[0]?.name || "";
  const [ef, setEf] = useState({ date: today(), category: "Bahan Ayam", description: "", amount: "", branch: "", receipt_path: null });
  const [pf, setPf] = useState({ date: today(), vendor_id: "", description: "", amount: "", branch: "", due_date: today(), receipt_path: null });

  const load = async () => {
    const [e, p, v] = await Promise.all([
      http.get("/expenses", { params: { branch } }),
      http.get("/purchases", { params: { branch } }),
      http.get("/vendors"),
    ]);
    setExpenses(e.data); setPurchases(p.data); setVendors(v.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [branch]);
  useEffect(() => {
    setEf((f) => ({ ...f, branch: defBranch }));
    setPf((f) => ({ ...f, branch: defBranch, vendor_id: f.vendor_id || vendors[0]?.id || "" }));
  }, [defBranch, vendors]);

  const submitExp = async (e) => {
    e.preventDefault();
    if (!ef.branch) return toast.error(t("branch"));
    try {
      await http.post("/expenses", { ...ef, amount: Number(ef.amount) });
      toast.success(t("saved")); setEf({ ...ef, description: "", amount: "", receipt_path: null }); load();
    } catch (err) { toast.error(apiErr(err)); }
  };
  const submitPur = async (e) => {
    e.preventDefault();
    if (!pf.branch || !pf.vendor_id) return toast.error(t("vendor"));
    try {
      await http.post("/purchases", { ...pf, amount: Number(pf.amount) });
      toast.success(t("saved")); setPf({ ...pf, description: "", amount: "", receipt_path: null }); load();
    } catch (err) { toast.error(apiErr(err)); }
  };
  const delExp = async (id) => { await http.delete(`/expenses/${id}`); load(); };

  const vmap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const branchOpts = branches.map((b) => ({ value: b.name, label: b.name }));

  return (
    <div>
      <PageHeader title={t("nav_expenses")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="petty" data-testid="tab-petty">{t("petty_cash")}</TabsTrigger>
          <TabsTrigger value="credit" data-testid="tab-credit">{t("credit_purchase")}</TabsTrigger>
        </TabsList>

        <TabsContent value="petty">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 h-fit" data-testid="expense-form-card">
              <h3 className="font-semibold mb-4">{t("expense_entry")}</h3>
              <form onSubmit={submitExp} className="space-y-4">
                <div className="space-y-2"><Label>{t("date")}</Label>
                  <Input type="date" value={ef.date} onChange={(e) => setEf({ ...ef, date: e.target.value })} className="h-11" data-testid="expense-date" /></div>
                <div className="space-y-2"><Label>{t("category")}</Label>
                  <SSelect testid="expense-category-select" value={ef.category} onValueChange={(v) => setEf({ ...ef, category: v })}
                    options={EXP_CATS.map((c) => ({ value: c, label: c }))} /></div>
                <div className="space-y-2"><Label>{t("branch")}</Label>
                  <SSelect testid="expense-branch-select" value={ef.branch} onValueChange={(v) => setEf({ ...ef, branch: v })} options={branchOpts} placeholder={t("branch")} /></div>
                <div className="space-y-2"><Label>{t("description")}</Label>
                  <Input value={ef.description} onChange={(e) => setEf({ ...ef, description: e.target.value })} className="h-11" data-testid="expense-desc" required /></div>
                <div className="space-y-2"><Label>{t("amount")}</Label>
                  <Input type="number" value={ef.amount} onChange={(e) => setEf({ ...ef, amount: e.target.value })} className="h-11 font-mono" data-testid="expense-amount" required /></div>
                <div className="space-y-2"><Label>{t("receipt")}</Label>
                  <ReceiptUpload testid="expense-receipt" value={ef.receipt_path} onUploaded={(p) => setEf({ ...ef, receipt_path: p })} /></div>
                <Button type="submit" className="w-full h-11 font-semibold" data-testid="expense-submit">{t("save")}</Button>
              </form>
            </Card>
            <Card className="p-5 lg:col-span-2" data-testid="expense-list-card">
              <h3 className="font-semibold mb-4">{t("expense_entry")}</h3>
              <div className="overflow-x-auto sonic-scroll">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
                    <th className="py-2 pr-3">{t("date")}</th><th className="py-2 pr-3">{t("category")}</th>
                    <th className="py-2 pr-3">{t("description")}</th><th className="py-2 pr-3 text-right">{t("amount")}</th><th className="py-2 pr-3 text-center">{t("receipt")}</th><th></th>
                  </tr></thead>
                  <tbody>
                    {expenses.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400">{t("no_data")}</td></tr>}
                    {expenses.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 hover:bg-slate-50 dark:hover:bg-slate-800/40" data-testid={`expense-row-${r.id}`}>
                        <td className="py-2.5 pr-3 font-mono text-xs">{r.date}</td>
                        <td className="py-2.5 pr-3"><span className="text-xs px-2 py-0.5 rounded bg-secondary">{r.category}</span></td>
                        <td className="py-2.5 pr-3">{r.description}</td>
                        <td className="py-2.5 pr-3 text-right font-mono font-semibold">{fmtRp(r.amount)}</td>
                        <td className="py-2.5 pr-3"><div className="flex justify-center">{r.receipt_path ? <ReceiptThumb path={r.receipt_path} /> : <span className="text-slate-300">—</span>}</div></td>
                        <td className="text-right"><button onClick={() => delExp(r.id)} data-testid={`expense-del-${r.id}`} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="credit">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 h-fit" data-testid="purchase-form-card">
              <h3 className="font-semibold mb-4">{t("purchase_entry")}</h3>
              <form onSubmit={submitPur} className="space-y-4">
                <div className="space-y-2"><Label>{t("date")}</Label>
                  <Input type="date" value={pf.date} onChange={(e) => setPf({ ...pf, date: e.target.value })} className="h-11" data-testid="purchase-date" /></div>
                <div className="space-y-2"><Label>{t("vendor")}</Label>
                  <SSelect testid="purchase-vendor-select" value={pf.vendor_id} onValueChange={(v) => setPf({ ...pf, vendor_id: v })}
                    options={vendors.map((v) => ({ value: v.id, label: v.name }))} placeholder={t("vendor")} /></div>
                <div className="space-y-2"><Label>{t("branch")}</Label>
                  <SSelect testid="purchase-branch-select" value={pf.branch} onValueChange={(v) => setPf({ ...pf, branch: v })} options={branchOpts} placeholder={t("branch")} /></div>
                <div className="space-y-2"><Label>{t("description")}</Label>
                  <Input value={pf.description} onChange={(e) => setPf({ ...pf, description: e.target.value })} className="h-11" data-testid="purchase-desc" required /></div>
                <div className="space-y-2"><Label>{t("amount")}</Label>
                  <Input type="number" value={pf.amount} onChange={(e) => setPf({ ...pf, amount: e.target.value })} className="h-11 font-mono" data-testid="purchase-amount" required /></div>
                <div className="space-y-2"><Label>{t("due_date")}</Label>
                  <Input type="date" value={pf.due_date} onChange={(e) => setPf({ ...pf, due_date: e.target.value })} className="h-11" data-testid="purchase-due" /></div>
                <div className="space-y-2"><Label>{t("receipt")}</Label>
                  <ReceiptUpload testid="purchase-receipt" value={pf.receipt_path} onUploaded={(p) => setPf({ ...pf, receipt_path: p })} /></div>
                <Button type="submit" className="w-full h-11 font-semibold" data-testid="purchase-submit">{t("save")}</Button>
              </form>
            </Card>
            <Card className="p-5 lg:col-span-2" data-testid="purchase-list-card">
              <h3 className="font-semibold mb-4">{t("credit_purchase")}</h3>
              <div className="overflow-x-auto sonic-scroll">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
                    <th className="py-2 pr-3">{t("date")}</th><th className="py-2 pr-3">{t("vendor")}</th>
                    <th className="py-2 pr-3">{t("due_date")}</th><th className="py-2 pr-3 text-right">{t("amount")}</th><th className="py-2 pr-3">{t("status")}</th><th className="py-2 pr-3 text-center">{t("receipt")}</th>
                  </tr></thead>
                  <tbody>
                    {purchases.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400">{t("no_data")}</td></tr>}
                    {purchases.map((r) => (
                      <tr key={r.id} className="border-b border-border/60" data-testid={`purchase-row-${r.id}`}>
                        <td className="py-2.5 pr-3 font-mono text-xs">{r.date}</td>
                        <td className="py-2.5 pr-3">{vmap[r.vendor_id] || "-"}</td>
                        <td className="py-2.5 pr-3 font-mono text-xs">{r.due_date}</td>
                        <td className="py-2.5 pr-3 text-right font-mono font-semibold">{fmtRp(r.amount)}</td>
                        <td className="py-2.5 pr-3"><span className="text-xs">{r.status}</span></td>
                        <td className="py-2.5 pr-3"><div className="flex justify-center">{r.receipt_path ? <ReceiptThumb path={r.receipt_path} /> : <span className="text-slate-300">—</span>}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-3">{t("debt_tracking")} → {t("nav_debt")}</p>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
