import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { http, daysAgo, today, apiErr } from "@/lib/api";
import { toast } from "sonner";
import { Upload, FileText, X, Loader2 } from "lucide-react";

export const LOGO_SRC = "/sonic-finance-logo.png";

export function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6 animate-fade-up">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function SSelect({ value, onValueChange, options, placeholder, testid, className }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger data-testid={testid} className={className || "h-11"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} data-testid={`${testid}-opt-${o.value}`}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function usePeriod() {
  const [period, setPeriod] = useState("last_7");
  const [start, setStart] = useState(daysAgo(6));
  const [end, setEnd] = useState(today());

  const range = () => {
    if (period === "today") return { start: today(), end: today() };
    if (period === "last_7") return { start: daysAgo(6), end: today() };
    if (period === "last_30") return { start: daysAgo(29), end: today() };
    return { start, end };
  };
  return { period, setPeriod, start, setStart, end, setEnd, range };
}

export function PeriodFilter({ ctrl, t }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SSelect
        testid="period-select"
        value={ctrl.period}
        onValueChange={ctrl.setPeriod}
        className="h-11 w-40"
        options={[
          { value: "today", label: t("today") },
          { value: "last_7", label: t("last_7") },
          { value: "last_30", label: t("last_30") },
          { value: "custom", label: t("custom") },
        ]}
      />
      {ctrl.period === "custom" && (
        <>
          <Input type="date" value={ctrl.start} onChange={(e) => ctrl.setStart(e.target.value)}
            className="h-11 w-40" data-testid="period-start" />
          <Input type="date" value={ctrl.end} onChange={(e) => ctrl.setEnd(e.target.value)}
            className="h-11 w-40" data-testid="period-end" />
        </>
      )}
    </div>
  );
}

export function BranchSelect({ testid = "branch-select", className }) {
  const { branch, setBranch, branches, t } = useApp();
  return (
    <SSelect
      testid={testid}
      value={branch}
      onValueChange={setBranch}
      className={className || "h-11 w-48"}
      options={[
        { value: "all", label: t("all_branches") },
        ...branches.map((b) => ({ value: b.name, label: b.name })),
      ]}
    />
  );
}

export function StatusBadge({ status, t }) {
  const map = {
    paid: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    unpaid: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  const label = { paid: t("paid"), partial: t("partial"), unpaid: t("unpaid") };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] || ""}`}>
      {label[status] || status}
    </span>
  );
}

export function Logo({ className }) {
  return (
    <img src={LOGO_SRC} alt="Sonic Finance" className={className || "h-10 w-10 rounded-xl object-cover"} />
  );
}

// Upload a receipt image; calls onUploaded(path) when done.
export function ReceiptUpload({ value, onUploaded, testid }) {
  const { t } = useApp();
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await http.post("/uploads/receipt", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onUploaded(data.path);
      toast.success(t("saved"));
    } catch (err) {
      toast.error(apiErr(err));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      {value ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ReceiptThumb path={value} size={40} />
          <span className="text-xs text-slate-500 truncate flex-1">{t("view_receipt")}</span>
          <button type="button" onClick={() => onUploaded(null)} data-testid={`${testid}-remove`}
            className="text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <label className="flex items-center gap-2 h-11 px-3 rounded-lg border border-input cursor-pointer hover:bg-secondary w-full text-sm text-slate-500"
          data-testid={testid}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>{busy ? t("uploading") : t("upload_receipt")}</span>
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={onFile} disabled={busy} />
        </label>
      )}
    </div>
  );
}

// Renders a receipt thumbnail by fetching the authenticated file as a blob.
export function ReceiptThumb({ path, size = 32 }) {
  const [url, setUrl] = useState(null);
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    let revoked = null;
    let active = true;
    (async () => {
      try {
        const res = await http.get(`/files/${path}`, { responseType: "blob" });
        if (!active) return;
        if (res.data.type === "application/pdf") { setIsPdf(true); return; }
        const u = URL.createObjectURL(res.data);
        revoked = u;
        setUrl(u);
      } catch (e) { /* ignore */ }
    })();
    return () => { active = false; if (revoked) URL.revokeObjectURL(revoked); };
  }, [path]);

  const open = async () => {
    try {
      const res = await http.get(`/files/${path}`, { responseType: "blob" });
      window.open(URL.createObjectURL(res.data), "_blank");
    } catch (e) { /* ignore */ }
  };

  if (isPdf) {
    return (
      <button type="button" onClick={open} data-testid="receipt-thumb" title="PDF"
        className="flex items-center justify-center rounded-md border border-border bg-secondary"
        style={{ height: size, width: size }}>
        <FileText className="h-4 w-4 text-primary" />
      </button>
    );
  }
  if (!url) return <div className="rounded-md bg-secondary animate-pulse" style={{ height: size, width: size }} />;
  return (
    <button type="button" onClick={open} data-testid="receipt-thumb" className="rounded-md overflow-hidden border border-border hover:ring-2 hover:ring-primary transition">
      <img src={url} alt="receipt" className="object-cover" style={{ height: size, width: size }} />
    </button>
  );
}
