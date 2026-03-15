import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface MenuContextValue {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  openMenu: () => void;
  closeMenu: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

export function MenuProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const value: MenuContextValue = { menuOpen, setMenuOpen, openMenu, closeMenu };
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) {
    return {
      menuOpen: false,
      setMenuOpen: () => {},
      openMenu: () => {},
      closeMenu: () => {},
    };
  }
  return ctx;
}
