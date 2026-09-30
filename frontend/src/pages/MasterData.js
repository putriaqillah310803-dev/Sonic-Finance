import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { http, fmtRp, apiErr } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader, SSelect } from "@/components/Shared";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";

const UNITS = ["kg", "pcs", "liter", "pack", "botol", "tabung"];
const PROD_CATS = ["Bahan Ayam", "Bahan Pelengkap", "Bahan Roti", "Bahan Es", "Bahan Minuman",
  "Bahan Pembungkus", "Bahan Minyak", "Bahan Bumbu/Groceries", "Bahan Perkedel", "Bahan Nasgor", "Operasional"];
const VEND_CATS = ["Ayam Broiler", "Bumbu & Groceries", "Minyak Goreng", "Pembungkus", "Sayuran & Roti", "Lain-lain"];

const CONFIG = {
  vendors: {
    endpoint: "vendors",
    fields: [
      { key: "name", type: "text" },
      { key: "category", type: "select", options: VEND_CATS },
      { key: "phone", type: "text" },
    ],
    columns: ["name", "category", "phone"],
  },
  products: {
    endpoint: "products",
    fields: [
      { key: "name", type: "text" },
      { key: "unit", type: "select", options: UNITS },
      { key: "category", type: "select", options: PROD_CATS },
      { key: "unit_price", type: "number" },
      { key: "min_stock", type: "number" },
      { key: "stock", type: "number" },
    ],
    columns: ["name", "unit", "category", "unit_price", "stock", "min_stock"],
  },
  branches: {
    endpoint: "branches",
    fields: [
      { key: "name", type: "text" },
      { key: "code", type: "text" },
      { key: "address", type: "text" },
    ],
    columns: ["name", "code", "address"],
  },
};

function CrudTab({ type }) {
  const { t, loadBranches } = useApp();
  const cfg = CONFIG[type];
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    const { data } = await http.get(`/${cfg.endpoint}`);
    setRows(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type]);

  const openNew = () => {
    const f = {};
    cfg.fields.forEach((fl) => { f[fl.key] = fl.type === "select" ? fl.options[0] : (fl.type === "number" ? 0 : ""); });
    setForm(f); setEditing(null); setOpen(true);
  };
  const openEdit = (r) => { setForm({ ...r }); setEditing(r); setOpen(true); };

  const save = async () => {
    const payload = { ...form };
    cfg.fields.forEach((fl) => { if (fl.type === "number") payload[fl.key] = Number(payload[fl.key] || 0); });
    try {
      if (editing) await http.put(`/${cfg.endpoint}/${editing.id}`, payload);
      else await http.post(`/${cfg.endpoint}`, payload);
      toast.success(t("saved")); setOpen(false);
      load(); if (type === "branches") loadBranches();
    } catch (err) { toast.error(apiErr(err)); }
  };
  const del = async (id) => {
    await http.delete(`/${cfg.endpoint}/${id}`); load();
    if (type === "branches") loadBranches();
  };

  const fmtCell = (r, c) => (c === "unit_price" ? fmtRp(r[c]) : (r[c] ?? "-"));

  return (
    <Card className="p-5" data-testid={`master-${type}-card`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">{t(type)}</h3>
        <Button size="sm" onClick={openNew} data-testid={`master-add-${type}`} className="gap-2"><Plus className="h-4 w-4" /> {t("add")}</Button>
      </div>
      <div className="overflow-x-auto sonic-scroll">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
            {cfg.columns.map((c) => <th key={c} className="py-2 pr-3">{t(c)}</th>)}
            <th className="py-2 pr-3 text-right">{t("actions")}</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={cfg.columns.length + 1} className="py-8 text-center text-slate-400">{t("no_data")}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 hover:bg-slate-50 dark:hover:bg-slate-800/40" data-testid={`master-${type}-row-${r.id}`}>
                {cfg.columns.map((c) => <td key={c} className={`py-2.5 pr-3 ${c === "unit_price" ? "font-mono" : ""}`}>{fmtCell(r, c)}</td>)}
                <td className="py-2.5 pr-3 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(r)} data-testid={`master-edit-${r.id}`} className="text-slate-400 hover:text-primary"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(r.id)} data-testid={`master-del-${r.id}`} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid={`master-dialog-${type}`}>
          <DialogHeader><DialogTitle>{editing ? t("edit") : t("add")} — {t(type)}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {cfg.fields.map((fl) => (
              <div key={fl.key} className="space-y-2">
                <Label>{t(fl.key)}</Label>
                {fl.type === "select" ? (
                  <SSelect testid={`master-field-${fl.key}`} value={form[fl.key]} onValueChange={(v) => setForm({ ...form, [fl.key]: v })}
                    options={fl.options.map((o) => ({ value: o, label: o }))} />
                ) : (
                  <Input type={fl.type} value={form[fl.key] ?? ""} onChange={(e) => setForm({ ...form, [fl.key]: e.target.value })}
                    className="h-11" data-testid={`master-field-${fl.key}`} />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid={`master-save-${type}`}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function MasterData() {
  const { t } = useApp();
  const [seeding, setSeeding] = useState(false);

  const reseed = async () => {
    if (!window.confirm(t("reset_seed") + "?")) return;
    setSeeding(true);
    try { await http.post("/seed"); toast.success(t("saved")); window.location.reload(); }
    catch (e) { toast.error(apiErr(e)); } finally { setSeeding(false); }
  };

  return (
    <div>
      <PageHeader title={t("nav_master")} subtitle={t("master_data")}
        right={<Button variant="outline" onClick={reseed} disabled={seeding} data-testid="reseed-btn" className="gap-2 h-11">
          <RefreshCw className={`h-4 w-4 ${seeding ? "animate-spin" : ""}`} /> {t("reset_seed")}
        </Button>} />
      <Tabs defaultValue="vendors">
        <TabsList className="mb-6">
          <TabsTrigger value="vendors" data-testid="master-tab-vendors">{t("vendors")}</TabsTrigger>
          <TabsTrigger value="products" data-testid="master-tab-products">{t("products")}</TabsTrigger>
          <TabsTrigger value="branches" data-testid="master-tab-branches">{t("branches")}</TabsTrigger>
        </TabsList>
        <TabsContent value="vendors"><CrudTab type="vendors" /></TabsContent>
        <TabsContent value="products"><CrudTab type="products" /></TabsContent>
        <TabsContent value="branches"><CrudTab type="branches" /></TabsContent>
      </Tabs>
    </div>
  );
}
