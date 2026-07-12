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
      scripts: { dev: "vite", build: "vite build", preview: "vite preview", typecheck: "tsc --noEmit", lint: "eslint src" },
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
      },
    },
    null,
    2,
  ),
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
  "index.html": `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Generated UI</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`,
  "src/main.tsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
`,
  "src/lib/utils.ts": `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
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
  ".gitignore": "node_modules/\ndist/\n.env\n",
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
