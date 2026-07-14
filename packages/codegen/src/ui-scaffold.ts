/**
 * Static scaffolding that turns the generated shadcn app files into a COMPLETE, runnable, TYPE-SAFE Vite
 * project — `pnpm i && pnpm dev`, with `pnpm typecheck` (strict tsc) and `pnpm lint` (eslint) green.
 * shadcn/ui is copy-into-your-repo by design, so the (properly-typed) component sources are emitted here.
 * The model-derived files (App.tsx, pages, index.css, AppSidebar, types.ts) come from ui.ts.
 */

export const UI_SCAFFOLD: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "generated-ui",
      private: true,
      type: "module",
      packageManager: "pnpm@9.12.0",
      engines: { node: ">=20" },
      scripts: { dev: "vite", build: "vite build", preview: "vite preview", typecheck: "tsc --noEmit", lint: "eslint src", test: "vitest run" },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
        "react-router-dom": "^6.26.2",
        "class-variance-authority": "^0.7.0",
        clsx: "^2.1.1",
        "tailwind-merge": "^2.5.2",
        "lucide-react": "^0.441.0",
        "@radix-ui/react-slot": "^1.1.0",
        "@radix-ui/react-label": "^2.1.0",
        "@radix-ui/react-switch": "^1.1.1",
        "@radix-ui/react-select": "^2.1.1",
        "@radix-ui/react-dropdown-menu": "^2.1.1",
        "@radix-ui/react-dialog": "^1.1.1",
        "@radix-ui/react-tabs": "^1.1.0",
        recharts: "^2.12.7",
      },
      devDependencies: {
        vite: "^5.4.6",
        "@vitejs/plugin-react": "^4.3.1",
        typescript: "^5.6.2",
        tailwindcss: "^3.4.12",
        postcss: "^8.4.47",
        autoprefixer: "^10.4.20",
        "tailwindcss-animate": "^1.0.7",
        "@types/react": "^18.3.7",
        "@types/react-dom": "^18.3.0",
        eslint: "^9.11.0",
        "@eslint/js": "^9.11.0",
        "typescript-eslint": "^8.6.0",
        globals: "^15.9.0",
        vitest: "^2.1.1",
        jsdom: "^25.0.1",
        "@testing-library/react": "^16.0.1",
        "@testing-library/dom": "^10.4.0",
      },
    },
    null,
    2,
  ),
  "vitest.config.ts": `import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "jsdom", globals: true },
});
`,
  Dockerfile: `FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
`,
  ".dockerignore": "node_modules\ndist\n.env\n",
  "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
`,
  "tsconfig.json": JSON.stringify(
    { compilerOptions: { target: "ES2020", module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx", baseUrl: ".", paths: { "@/*": ["./src/*"] }, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, lib: ["ES2020", "DOM", "DOM.Iterable"] }, include: ["src"] },
    null,
    2,
  ),
  "eslint.config.js": `import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_" }],
    },
  },
);
`,
  "postcss.config.js": `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`,
  "tailwind.config.js": `export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  safelist: ["dark"],
  theme: {
    extend: {
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      colors: {
        border: "hsl(var(--border))", input: "hsl(var(--input))", ring: "hsl(var(--ring))",
        background: "hsl(var(--background))", foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
`,
  // The inline script applies the saved/system theme before paint (no flash of the wrong theme).
  "index.html": `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Generated UI</title><script>try{var t=localStorage.getItem("theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(t==="dark")document.documentElement.classList.add("dark");}catch(e){}</script></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`,
  "src/main.tsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n";
createRoot(document.getElementById("root")!).render(<React.StrictMode><I18nProvider><App /></I18nProvider></React.StrictMode>);
`,
  "src/lib/utils.ts": `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
`,
  "src/components/ui/badge.tsx": `import * as React from "react";
import { cn } from "@/lib/utils";
const styles: Record<string, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border text-foreground",
};
export function Badge({ className, variant = "secondary", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "secondary" | "outline" }) {
  return <div className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", styles[variant], className)} {...props} />;
}
`,
  "src/components/ui/dropdown-menu.tsx": `import * as React from "react";
import * as P from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
export const DropdownMenu = P.Root;
export const DropdownMenuTrigger = P.Trigger;
export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof P.Content>, React.ComponentPropsWithoutRef<typeof P.Content>>(({ className, sideOffset = 4, ...props }, ref) => (
  <P.Portal><P.Content ref={ref} sideOffset={sideOffset} align="end" className={cn("z-50 min-w-[9rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md", className)} {...props} /></P.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";
export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof P.Item>, React.ComponentPropsWithoutRef<typeof P.Item>>(({ className, ...props }, ref) => (
  <P.Item ref={ref} className={cn("relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground", className)} {...props} />
));
DropdownMenuItem.displayName = "DropdownMenuItem";
`,
  "src/components/ui/sheet.tsx": `import * as React from "react";
import * as P from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
export const Sheet = P.Root;
export const SheetTrigger = P.Trigger;
export const SheetClose = P.Close;
export const SheetContent = React.forwardRef<React.ElementRef<typeof P.Content>, React.ComponentPropsWithoutRef<typeof P.Content>>(({ className, children, ...props }, ref) => (
  <P.Portal>
    <P.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <P.Content ref={ref} className={cn("fixed inset-y-0 right-0 z-50 h-full w-3/4 max-w-md border-l bg-background p-6 shadow-lg overflow-y-auto", className)} {...props}>{children}</P.Content>
  </P.Portal>
));
SheetContent.displayName = "SheetContent";
export const SheetTitle = React.forwardRef<React.ElementRef<typeof P.Title>, React.ComponentPropsWithoutRef<typeof P.Title>>(({ className, ...props }, ref) => (
  <P.Title ref={ref} className={cn("text-lg font-semibold mb-4", className)} {...props} />
));
SheetTitle.displayName = "SheetTitle";
`,
  "src/components/ui/tabs.tsx": `import * as React from "react";
import * as P from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
export const Tabs = P.Root;
export const TabsList = React.forwardRef<React.ElementRef<typeof P.List>, React.ComponentPropsWithoutRef<typeof P.List>>(({ className, ...props }, ref) => (
  <P.List ref={ref} className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className)} {...props} />
));
TabsList.displayName = "TabsList";
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof P.Trigger>, React.ComponentPropsWithoutRef<typeof P.Trigger>>(({ className, ...props }, ref) => (
  <P.Trigger ref={ref} className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow", className)} {...props} />
));
TabsTrigger.displayName = "TabsTrigger";
export const TabsContent = React.forwardRef<React.ElementRef<typeof P.Content>, React.ComponentPropsWithoutRef<typeof P.Content>>(({ className, ...props }, ref) => (
  <P.Content ref={ref} className={cn("mt-3", className)} {...props} />
));
TabsContent.displayName = "TabsContent";
`,
  "src/components/ui/data-table.tsx": `import * as React from "react";
import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatCell } from "@/lib/format";
export interface Column { field: string; label?: string; format?: string; }
// A sortable + filterable table. Click a header to sort; type to filter across the shown columns.
export function DataTable({ columns, rows, actions }: { columns: Column[]; rows: Record<string, unknown>[]; actions?: (row: Record<string, unknown>) => React.ReactNode }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ field: string; dir: 1 | -1 } | null>(null);
  const view = useMemo(() => {
    let out = rows;
    if (q) { const s = q.toLowerCase(); out = out.filter((r) => columns.some((c) => String(r[c.field] ?? "").toLowerCase().includes(s))); }
    if (sort) { const { field, dir } = sort; out = [...out].sort((a, b) => (String(a[field] ?? "") > String(b[field] ?? "") ? dir : -dir)); }
    return out;
  }, [rows, q, sort, columns]);
  const toggle = (field: string) => setSort((s) => (s && s.field === field ? { field, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { field, dir: 1 }));
  return (
    <div className="space-y-3">
      <Input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      <Table>
        <TableHeader><TableRow>{columns.map((c) => (<TableHead key={c.field} className="cursor-pointer select-none" onClick={() => toggle(c.field)}>{c.label ?? c.field}{sort?.field === c.field ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</TableHead>))}{actions ? <TableHead /> : null}</TableRow></TableHeader>
        <TableBody>{view.map((r, i) => (<TableRow key={i}>{columns.map((c) => <TableCell key={c.field}>{formatCell(r[c.field], c.format)}</TableCell>)}{actions ? <TableCell className="text-right">{actions(r)}</TableCell> : null}</TableRow>))}</TableBody>
      </Table>
    </div>
  );
}
`,
  "src/components/charts/DistributionChart.tsx": `import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
// A bar chart of row counts grouped by a field (e.g. leads by stage) — derived from the loaded rows.
export function DistributionChart({ title, rows, field }: { title: string; rows: Record<string, unknown>[]; field: string }) {
  const counts: Record<string, number> = {};
  for (const r of rows) { const k = String(r[field] ?? "—"); counts[k] = (counts[k] ?? 0) + 1; }
  const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data}><XAxis dataKey="name" fontSize={12} /><YAxis allowDecimals={false} width={24} fontSize={12} /><Tooltip /><Bar dataKey="value" fill="hsl(var(--primary))" radius={4} /></BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
`,
  "src/lib/api.ts": `/// <reference types="vite/client" />
// Talks to the generated spine: GET /<entity>s (list) + /<entity>s/:id (read); POST command routes (see model.ts).
// Point at the backend with VITE_API_URL (default: same origin); optional VITE_API_TOKEN sends a Bearer header.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) || "";
const TOKEN = (import.meta.env.VITE_API_TOKEN as string | undefined) || "";
const headers = (): Record<string, string> => ({ "content-type": "application/json", ...(TOKEN ? { authorization: "Bearer " + TOKEN } : {}) });
const j = (r: Response) => r.json();
export const api = {
  list: (entity: string): Promise<Record<string, unknown>[]> => fetch(BASE + "/" + entity + "s", { headers: headers() }).then(j).catch(() => []),
  get: (entity: string, id: string): Promise<Record<string, unknown>> => fetch(BASE + "/" + entity + "s/" + id, { headers: headers() }).then(j),
  command: (path: string, body?: unknown): Promise<Record<string, unknown>> => fetch(BASE + path, { method: "POST", headers: headers(), body: JSON.stringify(body ?? {}) }).then(j),
};
`,
  "src/lib/format.tsx": `// Format-aware cell + KPI helpers, shared by every generated list page (the polished view-spec formats).
import { Badge } from "@/components/ui/badge";
export function formatCell(v: unknown, format?: string) {
  if (v === null || v === undefined || v === "") return "";
  if (format === "money") return "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 });
  if (format === "boolean" || typeof v === "boolean") return v ? "✓" : "✗";
  if (format === "badge") return <Badge>{String(v)}</Badge>;
  if (format === "longtext") { const s = String(v); return s.length > 60 ? s.slice(0, 60) + "…" : s; }
  return String(v);
}
export function metricValue(rows: Array<Record<string, unknown>>, m: { agg: string; field?: string }): number {
  if (m.agg === "count") return rows.length;
  const nums = rows.map((r) => Number(r[m.field as string])).filter((n) => !Number.isNaN(n));
  const sum = nums.reduce((a, b) => a + b, 0);
  return m.agg === "avg" ? (nums.length ? sum / nums.length : 0) : sum;
}
`,
  "src/components/ui/button.tsx": `import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  { variants: { variant: { default: "bg-primary text-primary-foreground shadow hover:bg-primary/90", secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80", outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground", ghost: "hover:bg-accent hover:text-accent-foreground" }, size: { default: "h-9 px-4 py-2", sm: "h-8 px-3", lg: "h-10 px-8" } }, defaultVariants: { variant: "default", size: "default" } },
);
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";
export { Button, buttonVariants };
`,
  "src/components/ui/card.tsx": `import * as React from "react";
import { cn } from "@/lib/utils";
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn("rounded-xl border bg-card text-card-foreground shadow", className)} {...props} />);
Card.displayName = "Card";
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />);
CardHeader.displayName = "CardHeader";
const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />);
CardTitle.displayName = "CardTitle";
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />);
CardContent.displayName = "CardContent";
export { Card, CardHeader, CardTitle, CardContent };
`,
  "src/components/ui/input.tsx": `import * as React from "react";
import { cn } from "@/lib/utils";
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input type={type} ref={ref} className={cn("flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)} {...props} />
));
Input.displayName = "Input";
export { Input };
`,
  "src/components/ui/label.tsx": `import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";
const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(({ className, ...props }, ref) => <LabelPrimitive.Root ref={ref} className={cn("text-sm font-medium leading-none", className)} {...props} />);
Label.displayName = "Label";
export { Label };
`,
  "src/components/ui/switch.tsx": `import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root className={cn("peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input", className)} {...props} ref={ref}>
    <SwitchPrimitives.Thumb className={cn("pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0")} />
  </SwitchPrimitives.Root>
));
Switch.displayName = "Switch";
export { Switch };
`,
  "src/components/ui/table.tsx": `import * as React from "react";
import { cn } from "@/lib/utils";
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...props }, ref) => <div className="relative w-full overflow-auto"><table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} /></div>);
Table.displayName = "Table";
const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />);
TableHeader.displayName = "TableHeader";
const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />);
TableBody.displayName = "TableBody";
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => <tr ref={ref} className={cn("border-b transition-colors hover:bg-muted/50", className)} {...props} />);
TableRow.displayName = "TableRow";
const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => <th ref={ref} className={cn("h-10 px-2 text-left align-middle font-medium text-muted-foreground", className)} {...props} />);
TableHead.displayName = "TableHead";
const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => <td ref={ref} className={cn("p-2 align-middle", className)} {...props} />);
TableCell.displayName = "TableCell";
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
`,
  "src/components/ui/select.tsx": `// Minimal Select (enough for reference LOVs; swap for the full shadcn Select when you wire options).
import * as React from "react";
import { cn } from "@/lib/utils";
export const Select = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ className, children, ...props }, ref) => <button ref={ref} className={cn("flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm", className)} {...props}>{children}</button>);
SelectTrigger.displayName = "SelectTrigger";
export const SelectValue = ({ placeholder }: { placeholder?: string }) => <span className="text-muted-foreground">{placeholder}</span>;
export const SelectContent = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
export { SelectTrigger };
`,
  ".gitignore": "node_modules/\ndist/\n.env\n.env.local\n",
  // Vite exposes only VITE_-prefixed vars to the client. VITE_API_URL = the spine base URL the pages fetch
  // from (data-fetching is a TODO in each page — read import.meta.env.VITE_API_URL when you wire it).
  ".env.example": "# Copy to .env.local. Only VITE_-prefixed vars reach the browser.\nVITE_API_URL=http://localhost:3000\n",
  // Vercel deploy config for the UI: Vite build + SPA fallback (react-router deep links resolve to index.html).
  "vercel.json": JSON.stringify({ $schema: "https://openapi.vercel.sh/vercel.json", framework: "vite", buildCommand: "npm run build", outputDirectory: "dist", rewrites: [{ source: "/(.*)", destination: "/index.html" }] }, null, 2) + "\n",
  "README.md": `# Generated UI (shadcn/ui)

Structure derived from the business model; skin from the Theme in \`src/index.css\`. TypeScript, \`strict\`.

\`\`\`bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm dev
\`\`\`

Screens: one list + detail per entity, navigation grouped by Business Area, master-detail child grids
for related records. Entity types are in \`src/types.ts\`. Rebrand by editing the CSS-variable tokens in
\`src/index.css\`. Wire the \`TODO\` data-fetch points to your backend API.
`,
};
