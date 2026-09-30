import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { http, apiErr } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader, SSelect } from "@/components/Shared";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Shield, User } from "lucide-react";

export default function Users() {
  const { t, user } = useApp();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "finance_user" });

  const load = async () => {
    const { data } = await http.get("/users");
    setRows(data);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm({ name: "", email: "", password: "", role: "finance_user" }); setEditing(null); setOpen(true); };
  const openEdit = (r) => { setForm({ name: r.name, email: r.email, password: "", role: r.role }); setEditing(r); setOpen(true); };

  const save = async () => {
    try {
      if (editing) {
        await http.put(`/users/${editing.id}`, { name: form.name, role: form.role, password: form.password || undefined });
      } else {
        await http.post("/users", form);
      }
      toast.success(t("saved")); setOpen(false); load();
    } catch (err) { toast.error(apiErr(err)); }
  };
  const del = async (id) => {
    try { await http.delete(`/users/${id}`); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div>
      <PageHeader title={t("nav_users")} subtitle={t("users")}
        right={<Button onClick={openNew} data-testid="add-user-btn" className="gap-2 h-11"><Plus className="h-4 w-4" /> {t("add_user")}</Button>} />

      <Card className="p-5" data-testid="users-table-card">
        <div className="overflow-x-auto sonic-scroll">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-mono uppercase text-slate-400 border-b border-border">
              <th className="py-2 pr-3">{t("name")}</th><th className="py-2 pr-3">{t("email")}</th>
              <th className="py-2 pr-3">{t("role")}</th><th className="py-2 pr-3 text-right">{t("actions")}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-slate-50 dark:hover:bg-slate-800/40" data-testid={`user-row-${r.id}`}>
                  <td className="py-2.5 pr-3 font-medium">{r.name}</td>
                  <td className="py-2.5 pr-3 text-xs">{r.email}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      r.role === "super_admin" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"}`}>
                      {r.role === "super_admin" ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {t(r.role)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(r)} data-testid={`user-edit-${r.id}`} className="text-slate-400 hover:text-primary"><Pencil className="h-4 w-4" /></button>
                      {r.id !== user.id && <button onClick={() => del(r.id)} data-testid={`user-del-${r.id}`} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="user-dialog">
          <DialogHeader><DialogTitle>{editing ? t("edit") : t("add_user")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("name")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11" data-testid="user-name" /></div>
            <div className="space-y-2"><Label>{t("email")}</Label><Input type="email" value={form.email} disabled={!!editing} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11" data-testid="user-email" /></div>
            <div className="space-y-2"><Label>{t("password")} {editing && <span className="text-xs text-slate-400">(kosongkan jika tidak diubah)</span>}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-11" data-testid="user-password" /></div>
            <div className="space-y-2"><Label>{t("role")}</Label>
              <SSelect testid="user-role-select" value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}
                options={[{ value: "super_admin", label: t("super_admin") }, { value: "finance_user", label: t("finance_user") }]} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={save} data-testid="user-save-btn">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
