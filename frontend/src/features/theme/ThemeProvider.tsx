import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeName = "dark" | "light" | "modern";

export interface ThemeOption {
  value: ThemeName;
  label: string;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: "dark", label: "Sombre", description: "Ambiance profonde verte et bordeaux" },
  { value: "light", label: "Clair", description: "Fond crème chaleureux et contrasté" },
  { value: "modern", label: "Moderne", description: "Clair froid, cartes nettes et accents teintés" },
];

const STORAGE_KEY = "si-pilot.theme";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  cycleTheme: () => void;
}

function readStoredTheme(): ThemeName {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "modern" || stored === "dark") {
      return stored;
    }
  } catch {
    // stockage local indisponible : on garde le thème sombre
  }
  return "dark";
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => undefined,
  cycleTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // stockage local indisponible : le thème reste actif pour la session
    }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      meta.content = theme === "dark" ? "#090e0d" : theme === "modern" ? "#eef3f7" : "#f3efe7";
    }
  }, [theme]);

  const setTheme = (next: ThemeName) => setThemeState(next);
  const cycleTheme = () => {
    const index = THEME_OPTIONS.findIndex((option) => option.value === theme);
    setThemeState(THEME_OPTIONS[(index + 1) % THEME_OPTIONS.length].value);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, cycleTheme }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
