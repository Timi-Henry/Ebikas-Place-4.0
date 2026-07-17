export function ThemeScript() {
  const script = `
(() => {
  try {
    const stored = window.localStorage.getItem("ebikas-theme");
    const theme = stored === "light" || stored === "dark" ? stored : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
