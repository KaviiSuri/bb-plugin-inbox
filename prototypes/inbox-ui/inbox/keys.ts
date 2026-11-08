// PROTOTYPE — keyboard shortcuts scoped to the sidebar. bb owns the rest of the
// window, so keys only act while the pointer is over our list or focus is in it,
// never in a text field.
import { useEffect, useRef } from "react";

export const sidebarScope = { root: null as HTMLElement | null, hovered: false };

function inScope(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return false;
  const root = sidebarScope.root;
  if (!root) return false;
  return root.contains(document.activeElement) || (sidebarScope.hovered && document.activeElement === document.body);
}

export function useScopedKeys(handlers: Record<string, () => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!inScope(event)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const handler = ref.current[key];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
