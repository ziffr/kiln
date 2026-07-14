// @ts-check
// Docs site for Kiln Studio. Deployed to GitHub Pages at https://ziffr.github.io/kiln/.
// This project is intentionally NOT a repo workspace — the root `npm install` ignores it, so a
// contributor cloning the code never downloads docs tooling. Only the docs CI job installs it.
import { themes as prismThemes } from "prism-react-renderer";

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Kiln Studio",
  tagline: "The business compiler",
  favicon: "img/logo.svg",

  // Served from the custom domain at its ROOT (see static/CNAME), not from /kiln/.
  url: "https://docs.kilnstudio.app",
  baseUrl: "/",
  organizationName: "ziffr",
  projectName: "kiln",
  trailingSlash: false,

  onBrokenLinks: "throw",
  markdown: { hooks: { onBrokenMarkdownLinks: "warn" } },

  // English is the default; German ships as a second locale (translated under i18n/de/).
  i18n: {
    defaultLocale: "en",
    locales: ["en", "de"],
    localeConfigs: {
      en: { label: "English" },
      de: { label: "Deutsch" },
    },
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: "/", // docs ARE the site — no separate landing page
          sidebarPath: "./sidebars.js",
          // "Edit this page" points at the repo → every change is a reviewed PR (owner merges).
          editUrl: "https://github.com/ziffr/kiln/tree/main/docs-site/",
          // Versioning: the latest release is served at the root; the live docs/ folder is "Next".
          lastVersion: "0.1.0",
          versions: {
            current: { label: "Next 🚧", path: "next" },
          },
        },
        blog: false,
        theme: { customCss: "./src/css/custom.css" },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: { respectPrefersColorScheme: true },
      navbar: {
        title: "Kiln Studio",
        logo: { alt: "Kiln", src: "img/logo.svg" },
        items: [
          { type: "docSidebar", sidebarId: "docs", position: "left", label: "Docs" },
          { type: "docsVersionDropdown", position: "right" },
          { type: "localeDropdown", position: "right" },
          { href: "https://demo.kilnstudio.app", label: "Live demo", position: "right" },
          { href: "https://github.com/ziffr/kiln", label: "GitHub", position: "right" },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Kiln Studio",
            items: [
              { label: "Live demo", href: "https://demo.kilnstudio.app" },
              { label: "GitHub", href: "https://github.com/ziffr/kiln" },
            ],
          },
        ],
        copyright: "Kiln Studio — Apache-2.0. Docs © the Kiln authors.",
      },
      prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
    }),
};

export default config;
