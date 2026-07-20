/** FOUC script for root layout `<head>` — server-safe (no React). */

export function themeBootstrapScript(options?: {
  storageKey?: string;
  cookieKey?: string;
}): string {
  const storageKey = options?.storageKey ?? "shell-theme";
  const cookieKey = options?.cookieKey ?? "shell_theme";
  return `(function(){try{var k=${JSON.stringify(storageKey)};var ck=${JSON.stringify(cookieKey)};var c=document.cookie.match(new RegExp('(?:^|; )'+ck+'=([^;]*)'));var p=c?decodeURIComponent(c[1]):localStorage.getItem(k);if(p!=='light'&&p!=='dark'&&p!=='system')p='system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var path=location.pathname;if(path==='/login'||path==='/setup'||path==='/onboarding'||path==='/pricing'||path==='/'||path==='/faq'||path==='/terms'||path==='/privacy')d=false;document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
}
