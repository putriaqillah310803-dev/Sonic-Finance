import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { http, fmtRp, today, apiErr } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, SSelect } from "@/components/Shared";
import { toast } from "sonner";
import { Trash2, ShoppingCart } from "lucide-react";

const CHANNELS = [
  { value: "Reguler", label: "Reguler / Dine-In", comm: 0 },
  { value: "GrabFood", label: "GrabFood", comm: 20 },
  { value: "GoFood", label: "GoFood", comm: 20 },
  { value: "ShopeeFood", label: "ShopeeFood", comm: 20 },
];

export default function Sales() {
  const { t, branch, branches } = useApp();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    date: today(), channel: "Reguler", gross: "", commission_pct: 0,
    payment_method: "Cash", branch: "", note: "",
  });

  const defBranch = branch !== "all" ? branch : branches[0]?.name || "";

  const load = async () => {
    const { data } = await http.get("/sales", { params: { branch } });
    setRows(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [branch]);
  useEffect(() => { setForm((f) => ({ ...f, branch: defBranch })); }, [defBranch]);

  const onChannel = (v) => {
    const c = CHANNELS.find((x) => x.value === v);
    setForm({ ...form, channel: v, commission_pct: c ? c.comm : 0 });
  };

  const net = form.gross ? Number(form.gross) * (1 - Number(form.commission_pct) / 100) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.branch) return toast.error(t("branch"));
    try {
      await http.post("/sales", {
        ...form, gross: Number(form.gross), commission_pct: Number(form.commission_pct),
      });
      toast.success(t("saved"));
      setForm({ ...form, gross: "", note: "" });
      load();
    } catch (err) { toast.error(apiErr(err)); }
  };

  const del = async (id) => {
    await http.delete(`/sales/${id}`);
    toast.success(t("saved"));
    load();
  };

  const branchOpts = branches.map((b) => ({ value: b.name, label: b.name }));

  return (
    <div>
      <PageHeader title={t("nav_sales")} subtitle={t("sales_entry")} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-1 h-fit" data-testid="sales-form-card">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">{t("sales_entry")}</h3>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("date")}</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="h-11" data-testid="sales-date" />
            </div>
            <div className="space-y-2">
              <Label>{t("channel")}</Label>
              <SSelect testid="sales-channel-select" value={form.channel} onValueChange={onChannel}
                options={CHANNELS.map((c) => ({ value: c.value, label: c.label }))} />
            </div>
            <div className="space-y-2">
              <Label>{t("branch")}</Label>
              <SSelect testid="sales-branch-select" value={form.branch} onValueChange={(v) => setForm({ ...form, branch: v })}
                options={branchOpts} placeholder={t("branch")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("gross_sales")}</Label>
                <Input type="number" value={form.gross} onChange={(e) => setForm({ ...form, gross: e.target.value })}
                  required className="h-11 font-mono" data-testid="sales-gross" placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{t("commission")}</Label>
                <Input type="number" value={form.commission_pct}
                  onChange={(e) => setForm({ ...form, commission_pct: e.target.value })}
                  className="h-11 font-mono" data-testid="sales-commission" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("payment_method")}</Label>
              <SSelect testid="sales-payment-select" value={form.payment_method}
                onValueChange={(v) => setForm({ ...form, payment_method: v })}
                options={["Cash", "QRIS", "Transfer", "EDC Debit", "EDC Credit"].map((p) => ({ value: p, label: p }))} />
            </div>
            <div className="rounded-lg bg-accent p-3 flex items-center justify-between">
              <span className="text-sm font-medium text-accent-foreground">{t("net_sales")}</span>
              <span className="font-mono font-bold text-accent-foreground" data-testid="sales-net-preview">{fmtRp(net)}</span>
            </div>
            <Button type="submit" className="w-full h-11 font-semibold" data-testid="sales-submit">{t("save")}</Button>
          </form>
        </Card>

        <Card className="p-5 lg:col-span-2" data-testid="sales-list-card">
          <h3 className="font-semibold mb-4">{t("recent_sales")}</h3>
          <div className="overflow-x-auto sonic-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
                  <th className="py-2 pr-3">{t("date")}</th>
                  <th className="py-2 pr-3">{t("channel")}</th>
                  <th className="py-2 pr-3">{t("branch")}</th>
                  <th className="py-2 pr-3 text-right">{t("gross_sales")}</th>
                  <th className="py-2 pr-3 text-right">{t("net_sales")}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">{t("no_data")}</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    data-testid={`sales-row-${r.id}`}>
                    <td className="py-2.5 pr-3 font-mono text-xs">{r.date}</td>
                    <td className="py-2.5 pr-3">{r.channel}</td>
                    <td className="py-2.5 pr-3 text-xs">{r.branch}</td>
                    <td className="py-2.5 pr-3 text-right font-mono">{fmtRp(r.gross)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono font-semibold">{fmtRp(r.net)}</td>
                    <td className="py-2.5 text-right">
                      <button onClick={() => del(r.id)} data-testid={`sales-del-${r.id}`}
                        className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
