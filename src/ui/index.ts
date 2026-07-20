export type {
  ShellNavItem,
  ShellNavSection,
  ShellNavUser,
} from "./nav/types";
export { shellNavIcons } from "./nav/icons";
export {
  defaultProductPlaceholderSection,
  defaultWorkspaceNavSection,
  defaultAccountNavSection,
  defaultAppNavSections,
} from "./nav/defaults";
export { AppShellNav, type AppShellNavProps } from "./nav/AppShellNav";
export {
  WorkspaceSwitcher,
  type ShellWorkspaceSwitcherProps,
} from "./nav/WorkspaceSwitcher";
export {
  ThemeProvider,
  useTheme,
  defaultIsPublicSurface,
  type ThemePreference,
  type ShellThemeProviderProps,
} from "./theme/ThemeProvider";
export { themeBootstrapScript } from "./theme/theme-bootstrap";
export { ThemeToggle } from "./theme/ThemeToggle";
