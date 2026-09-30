import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const http = axios.create({
  baseURL: API,
  withCredentials: true,
});

export function fmtRp(v) {
  const n = Number(v || 0);
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export function fmtNum(v) {
  return Number(v || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function apiErr(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e.message || "Terjadi kesalahan";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((x) => (x && x.msg ? x.msg : JSON.stringify(x))).join(" ");
  return String(detail);
}
