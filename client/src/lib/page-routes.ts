import { lazy, type ComponentType } from "react";
import { canPreloadPages, createPageLoader } from "./page-loader";

// Keep imports explicit so Vite can split pages and their heavy dependencies.
// Preloading imports code only; patient/API queries still run only on render.
const imports = {
  "/": () => import("@/pages/board"),
  "/verification": () => import("@/pages/verification"),
  "/my-tasks": () => import("@/pages/my-tasks"),
  "/dashboard": () => import("@/pages/dashboard"),
  "/workload": () => import("@/pages/workload"),
  "/billing-queue": () => import("@/pages/billing-queue"),
  "/notifications": () => import("@/pages/notifications"),
  "/settings": () => import("@/pages/settings"),
  "/reports": () => import("@/pages/reports"),
  "/productivity": () => import("@/pages/productivity"),
  "/denials": () => import("@/pages/denials"),
  "/arbitration": () => import("@/pages/arbitration"),
  "/tickets": () => import("@/pages/tickets"),
  "/posting": () => import("@/pages/posting"),
  "/collections": () => import("@/pages/collections"),
  "/checks": () => import("@/pages/checks"),
  "/closed": () => import("@/pages/closed"),
  "/ceo-box": () => import("@/pages/ceo-box"),
  "/call-calendar": () => import("@/pages/call-calendar"),
  "/patient-overview": () => import("@/pages/patient-overview"),
  "/message-board": () => import("@/pages/message-board"),
  "/messages": () => import("@/pages/messages"),
};

type PageModule = { default: ComponentType };
const entries = Object.entries(imports) as [string, () => Promise<PageModule>][];

export const pageRoutes = entries.map(([path, importer]) => {
  const load = createPageLoader(importer);
  return { path, load, Component: lazy(load) };
});

export function preloadPage(path: string): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!canPreloadPages(connection)) return;
  const route = pageRoutes.find(route => route.path === path);
  if (route) void route.load().catch(() => {
    // Navigation retries this import and shows the page error state if it fails.
    console.warn("Page code preload failed", { path });
  });
}
