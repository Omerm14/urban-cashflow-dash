import { createContext, useContext } from "react";
import { NIGHT } from "../theme";

// Theme: the current token object from src/theme.js (NIGHT or DAY).
export const ThemeCtx = createContext(NIGHT);
export const useT = () => useContext(ThemeCtx);

// Layout: width-derived breakpoints, provided once at the App root.
export const LayoutCtx = createContext({ isMobile: false, isTablet: false });
export const useLayout = () => useContext(LayoutCtx);

// Language: "en" | "he" plus the string lookup function.
export const LangCtx = createContext({ lang: "en", t: (k) => k });
export const useLang = () => useContext(LangCtx);
