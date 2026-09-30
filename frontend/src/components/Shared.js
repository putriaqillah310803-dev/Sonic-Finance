import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { daysAgo, today } from "@/lib/api";

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
