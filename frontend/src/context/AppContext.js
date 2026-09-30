import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { http, apiErr } from "@/lib/api";
import { translations } from "@/lib/i18n";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=logged out, object=logged in
  const [lang, setLang] = useState(localStorage.getItem("sonic_lang") || "id");
  const [branch, setBranch] = useState(localStorage.getItem("sonic_branch") || "all");
  const [branches, setBranches] = useState([]);

  const t = useCallback((key) => translations[lang][key] || key, [lang]);

  useEffect(() => {
    localStorage.setItem("sonic_lang", lang);
  }, [lang]);
  useEffect(() => {
    localStorage.setItem("sonic_branch", branch);
  }, [branch]);

  const loadBranches = useCallback(async () => {
    try {
      const { data } = await http.get("/branches");
      setBranches(data);
    } catch (e) {
      /* ignore */
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await http.get("/auth/me");
      setUser(data);
      loadBranches();
    } catch (e) {
      setUser(false);
    }
  }, [loadBranches]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const { data } = await http.post("/auth/login", { email, password });
    setUser(data);
    loadBranches();
    return data;
  };

  const logout = async () => {
    try {
      await http.post("/auth/logout");
    } catch (e) {}
    setUser(false);
  };

  return (
    <AppContext.Provider
      value={{
        user, setUser, lang, setLang, branch, setBranch, branches,
        loadBranches, t, login, logout, apiErr,
        isAdmin: user && user.role === "super_admin",
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
