import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useApp } from "@/lib/app-context";

export function Layout() {
  const { selectedLanguage } = useApp();

  // Set document direction based on selected language
  useEffect(() => {
    const dir = selectedLanguage === "he" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = selectedLanguage;
  }, [selectedLanguage]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
