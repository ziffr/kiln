import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./studio-auth"; // installs the fetch wrapper for the optional studio passphrase lock
import "./i18n";
import "./styles.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary onReset={() => window.location.reload()}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
