// PROTOTYPE — the live sidebar data, with fixtures mixed in when toggled on.
import { createContext, useContext } from "react";
import type { PluginSidebarProject, PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export interface SidebarData {
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
}

export const SidebarDataContext = createContext<SidebarData>({ threads: [], projects: [] });

export function useSidebarData() {
  return useContext(SidebarDataContext);
}
