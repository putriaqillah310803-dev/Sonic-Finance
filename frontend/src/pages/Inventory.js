import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { http, fmtRp, fmtNum, today, apiErr } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, SSelect } from "@/components/Shared";
import { toast } from "sonner";
import { Trash2, Boxes } from "lucide-react";

const TYPES = ["Masuk", "Keluar", "Transfer", "Rusak"];

export default function Inventory() {
  const { t, branch, branches } = useApp();
  const [tab, setTab] = useState("stock");
  const [logs, setLogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [snaps, setSnaps] = useState([]);

  const defBranch = branch !== "all" ? branch : branches[0]?.name || "";
  const [lf, setLf] = useState({ date: today(), product_id: "", type: "Masuk", qty: "", branch: "", branch_to: "", reason: "" });
  const [sf, setSf] = useState({ date: today(), branch: "", value: "", kind: "akhir" });

  const load = async () => {
    const [l, p, s] = await Promise.all([
      http.get("/inventory", { params: { branch } }),
      http.get("/products"),
      http.get("/snapshots", { params: { branch } }),
    ]);
    setLogs(l.data); setProducts(p.data); setSnaps(s.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [branch]);
  useEffect(() => {
    setLf((f) => ({ ...f, branch: defBranch, product_id: f.product_id || "" }));
    setSf((f) => ({ ...f, branch: defBranch }));
  }, [defBranch]);

  const submitLog = async (e) => {
    e.preventDefault();
    if (!lf.branch || !lf.product_id) return toast.error(t("product"));
    try {
      await http.post("/inventory", { ...lf, qty: Number(lf.qty) });
      toast.success(t("saved")); setLf({ ...lf, qty: "", reason: "" }); load();
    } catch (err) { toast.error(apiErr(err)); }
  };
  const submitSnap = async (e) => {
    e.preventDefault();
    if (!sf.branch) return toast.error(t("branch"));
    try {
      await http.post("/snapshots", { ...sf, value: Number(sf.value) });
      toast.success(t("saved")); setSf({ ...sf, value: "" }); load();
    } catch (err) { toast.error(apiErr(err)); }
  };
  const delLog = async (id) => { await http.delete(`/inventory/${id}`); load(); };

  const pmap = Object.fromEntries(products.map((p) => [p.id, p]));
  const branchOpts = branches.map((b) => ({ value: b.name, label: b.name }));
  const prodOpts = products.map((p) => ({ value: p.id, label: `${p.name} (${p.unit})` }));
  const filtered = (type) => logs.filter((l) => (type ? l.type === type : true));

  return (
    <div>
      <PageHeader title={t("nav_inventory")} subtitle={t("inventory_mgmt")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 flex-wrap h-auto">
          <TabsTrigger value="stock" data-testid="tab-stock">{t("stock_count")}</TabsTrigger>
          <TabsTrigger value="spoilage" data-testid="tab-spoilage">{t("spoilage")}</TabsTrigger>
          <TabsTrigger value="transfer" data-testid="tab-transfer">{t("transfer")}</TabsTrigger>
          <TabsTrigger value="snapshot" data-testid="tab-snapshot">{t("inventory_snapshot")}</TabsTrigger>
        </TabsList>

        {/* Stock count / current stock */}
        <TabsContent value="stock">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 h-fit" data-testid="inv-form-card">
              <div className="flex items-center gap-2 mb-4"><Boxes className="h-5 w-5 text-primary" /><h3 className="font-semibold">{t("stock_count")}</h3></div>
              <form onSubmit={submitLog} className="space-y-4">
                <div className="space-y-2"><Label>{t("date")}</Label><Input type="date" value={lf.date} onChange={(e) => setLf({ ...lf, date: e.target.value })} className="h-11" data-testid="inv-date" /></div>
                <div className="space-y-2"><Label>{t("product")}</Label><SSelect testid="inv-product-select" value={lf.product_id} onValueChange={(v) => setLf({ ...lf, product_id: v })} options={prodOpts} placeholder={t("product")} /></div>
                <div className="space-y-2"><Label>{t("type")}</Label><SSelect testid="inv-type-select" value={lf.type} onValueChange={(v) => setLf({ ...lf, type: v })} options={TYPES.filter((x) => x !== "Transfer").map((x) => ({ value: x, label: x }))} /></div>
                <div className="space-y-2"><Label>{t("branch")}</Label><SSelect testid="inv-branch-select" value={lf.branch} onValueChange={(v) => setLf({ ...lf, branch: v })} options={branchOpts} placeholder={t("branch")} /></div>
                <div className="space-y-2"><Label>{t("quantity")}</Label><Input type="number" value={lf.qty} onChange={(e) => setLf({ ...lf, qty: e.target.value })} className="h-11 font-mono" data-testid="inv-qty" required /></div>
                <Button type="submit" className="w-full h-11 font-semibold" data-testid="inv-submit">{t("save")}</Button>
              </form>
            </Card>
            <Card className="p-5 lg:col-span-2" data-testid="stock-table-card">
              <h3 className="font-semibold mb-4">{t("stock")}</h3>
              <div className="overflow-x-auto sonic-scroll">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
                    <th className="py-2 pr-3">{t("product")}</th><th className="py-2 pr-3">{t("category")}</th>
                    <th className="py-2 pr-3 text-right">{t("stock")}</th><th className="py-2 pr-3 text-right">{t("min_stock")}</th><th className="py-2 pr-3 text-right">{t("unit_price")}</th>
                  </tr></thead>
                  <tbody>
                    {products.map((p) => {
                      const low = p.min_stock > 0 && p.stock <= p.min_stock;
                      return (
                        <tr key={p.id} className={`border-b border-border/60 ${low ? "bg-amber-50 dark:bg-amber-900/10" : ""}`} data-testid={`stock-row-${p.id}`}>
                          <td className="py-2.5 pr-3 font-medium">{p.name}</td>
                          <td className="py-2.5 pr-3 text-xs">{p.category}</td>
                          <td className={`py-2.5 pr-3 text-right font-mono ${low ? "text-amber-600 font-bold" : ""}`}>{fmtNum(p.stock)} {p.unit}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-xs">{fmtNum(p.min_stock)}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-xs">{fmtRp(p.unit_price)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Spoilage */}
        <TabsContent value="spoilage">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 h-fit" data-testid="spoil-form-card">
              <h3 className="font-semibold mb-4">{t("spoilage")}</h3>
              <form onSubmit={(e) => { setLf((f) => ({ ...f, type: "Rusak" })); submitLog(e); }} className="space-y-4">
                <div className="space-y-2"><Label>{t("date")}</Label><Input type="date" value={lf.date} onChange={(e) => setLf({ ...lf, date: e.target.value })} className="h-11" data-testid="spoil-date" /></div>
                <div className="space-y-2"><Label>{t("product")}</Label><SSelect testid="spoil-product-select" value={lf.product_id} onValueChange={(v) => setLf({ ...lf, product_id: v, type: "Rusak" })} options={prodOpts} placeholder={t("product")} /></div>
                <div className="space-y-2"><Label>{t("branch")}</Label><SSelect testid="spoil-branch-select" value={lf.branch} onValueChange={(v) => setLf({ ...lf, branch: v })} options={branchOpts} placeholder={t("branch")} /></div>
                <div className="space-y-2"><Label>{t("quantity")}</Label><Input type="number" value={lf.qty} onChange={(e) => setLf({ ...lf, qty: e.target.value })} className="h-11 font-mono" data-testid="spoil-qty" required /></div>
                <div className="space-y-2"><Label>{t("reason")}</Label><Input value={lf.reason} onChange={(e) => setLf({ ...lf, reason: e.target.value })} className="h-11" data-testid="spoil-reason" placeholder="Gosong / Kadaluarsa / Jatuh" /></div>
                <Button type="submit" onClick={() => setLf((f) => ({ ...f, type: "Rusak" }))} className="w-full h-11 font-semibold" data-testid="spoil-submit">{t("save")}</Button>
              </form>
            </Card>
            <Card className="p-5 lg:col-span-2" data-testid="spoil-table-card">
              <h3 className="font-semibold mb-4">{t("spoilage")}</h3>
              <LogTable rows={filtered("Rusak")} pmap={pmap} onDel={delLog} t={t} showReason />
            </Card>
          </div>
        </TabsContent>

        {/* Transfer */}
        <TabsContent value="transfer">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 h-fit" data-testid="transfer-form-card">
              <h3 className="font-semibold mb-4">{t("transfer")}</h3>
              <form onSubmit={(e) => { setLf((f) => ({ ...f, type: "Transfer" })); submitLog(e); }} className="space-y-4">
                <div className="space-y-2"><Label>{t("date")}</Label><Input type="date" value={lf.date} onChange={(e) => setLf({ ...lf, date: e.target.value })} className="h-11" data-testid="transfer-date" /></div>
                <div className="space-y-2"><Label>{t("product")}</Label><SSelect testid="transfer-product-select" value={lf.product_id} onValueChange={(v) => setLf({ ...lf, product_id: v, type: "Transfer" })} options={prodOpts} placeholder={t("product")} /></div>
                <div className="space-y-2"><Label>{t("branch")} (Asal)</Label><SSelect testid="transfer-branch-select" value={lf.branch} onValueChange={(v) => setLf({ ...lf, branch: v })} options={branchOpts} placeholder={t("branch")} /></div>
                <div className="space-y-2"><Label>{t("branch_to")}</Label><SSelect testid="transfer-branchto-select" value={lf.branch_to} onValueChange={(v) => setLf({ ...lf, branch_to: v })} options={branchOpts} placeholder={t("branch_to")} /></div>
                <div className="space-y-2"><Label>{t("quantity")}</Label><Input type="number" value={lf.qty} onChange={(e) => setLf({ ...lf, qty: e.target.value })} className="h-11 font-mono" data-testid="transfer-qty" required /></div>
                <Button type="submit" onClick={() => setLf((f) => ({ ...f, type: "Transfer" }))} className="w-full h-11 font-semibold" data-testid="transfer-submit">{t("save")}</Button>
              </form>
            </Card>
            <Card className="p-5 lg:col-span-2" data-testid="transfer-table-card">
              <h3 className="font-semibold mb-4">{t("transfer")}</h3>
              <LogTable rows={filtered("Transfer")} pmap={pmap} onDel={delLog} t={t} showTransfer />
            </Card>
          </div>
        </TabsContent>

        {/* Snapshot */}
        <TabsContent value="snapshot">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 h-fit" data-testid="snap-form-card">
              <h3 className="font-semibold mb-4">{t("inventory_snapshot")}</h3>
              <form onSubmit={submitSnap} className="space-y-4">
                <div className="space-y-2"><Label>{t("date")}</Label><Input type="date" value={sf.date} onChange={(e) => setSf({ ...sf, date: e.target.value })} className="h-11" data-testid="snap-date" /></div>
                <div className="space-y-2"><Label>{t("branch")}</Label><SSelect testid="snap-branch-select" value={sf.branch} onValueChange={(v) => setSf({ ...sf, branch: v })} options={branchOpts} placeholder={t("branch")} /></div>
                <div className="space-y-2"><Label>{t("kind")}</Label><SSelect testid="snap-kind-select" value={sf.kind} onValueChange={(v) => setSf({ ...sf, kind: v })} options={[{ value: "awal", label: t("beginning") }, { value: "akhir", label: t("ending") }]} /></div>
                <div className="space-y-2"><Label>{t("value")}</Label><Input type="number" value={sf.value} onChange={(e) => setSf({ ...sf, value: e.target.value })} className="h-11 font-mono" data-testid="snap-value" required /></div>
                <Button type="submit" className="w-full h-11 font-semibold" data-testid="snap-submit">{t("save")}</Button>
              </form>
            </Card>
            <Card className="p-5 lg:col-span-2" data-testid="snap-table-card">
              <h3 className="font-semibold mb-4">{t("inventory_snapshot")}</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
                  <th className="py-2 pr-3">{t("date")}</th><th className="py-2 pr-3">{t("branch")}</th><th className="py-2 pr-3">{t("kind")}</th><th className="py-2 pr-3 text-right">{t("value")}</th>
                </tr></thead>
                <tbody>
                  {snaps.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400">{t("no_data")}</td></tr>}
                  {snaps.map((s) => (
                    <tr key={s.id} className="border-b border-border/60" data-testid={`snap-row-${s.id}`}>
                      <td className="py-2.5 pr-3 font-mono text-xs">{s.date}</td>
                      <td className="py-2.5 pr-3 text-xs">{s.branch}</td>
                      <td className="py-2.5 pr-3">{s.kind === "awal" ? t("beginning") : t("ending")}</td>
                      <td className="py-2.5 pr-3 text-right font-mono font-semibold">{fmtRp(s.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LogTable({ rows, pmap, onDel, t, showReason, showTransfer }) {
  return (
    <div className="overflow-x-auto sonic-scroll">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
          <th className="py-2 pr-3">{t("date")}</th><th className="py-2 pr-3">{t("product")}</th>
          <th className="py-2 pr-3 text-right">{t("quantity")}</th>
          {showTransfer && <th className="py-2 pr-3">{t("branch_to")}</th>}
          {showReason && <th className="py-2 pr-3">{t("reason")}</th>}
          <th></th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">{t("no_data")}</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/60" data-testid={`inv-log-${r.id}`}>
              <td className="py-2.5 pr-3 font-mono text-xs">{r.date}</td>
              <td className="py-2.5 pr-3">{pmap[r.product_id]?.name || "-"}</td>
              <td className="py-2.5 pr-3 text-right font-mono">{r.qty}</td>
              {showTransfer && <td className="py-2.5 pr-3 text-xs">{r.branch} → {r.branch_to}</td>}
              {showReason && <td className="py-2.5 pr-3 text-xs text-slate-500">{r.reason}</td>}
              <td className="text-right"><button onClick={() => onDel(r.id)} data-testid={`inv-del-${r.id}`} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
