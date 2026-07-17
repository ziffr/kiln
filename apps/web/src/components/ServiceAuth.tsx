// The read-only view of an external service's CREDENTIAL declaration.
//
// External services have no editing screen yet (like comms/integrations/binding, they're authored in
// model.json and round-tripped via ⬇/⬆ Export/Import model) — so this DISPLAYS the grant rather than
// collecting it, and says plainly where the value belongs: in the deploy's .env, never in the model.
import { Icon } from "./Icon";

export interface ServiceOption {
  id: string;
  name: string;
  invocation: string;
  auth?: string;
  credentialEnv?: string;
  headerName?: string;
}

type T = (k: string, o?: Record<string, unknown>) => string;

/** One line: how (and with which env var) a real run authenticates this vendor call — or that it doesn't. */
export function ServiceAuthNote({ service, t }: { service?: ServiceOption; t: T }): React.JSX.Element | null {
  if (!service) return null;
  const scheme = service.auth ?? "none";
  const declared = Boolean(service.credentialEnv) && scheme !== "none";
  if (!declared) {
    return (
      <p className="svc-auth svc-auth-none muted">
        <Icon name="unlock" size={11} /> {t("svcAuthNone")}
      </p>
    );
  }
  return (
    <p className="svc-auth muted">
      <Icon name="lock" size={11} />{" "}
      {t("svcAuthDeclared", { scheme: scheme === "header" ? `${scheme} (${service.headerName})` : scheme })}{" "}
      <code className="svc-auth-var">{service.credentialEnv}</code>
      <span className="svc-auth-hint"> · {t("svcAuthEnvHint")}</span>
    </p>
  );
}
