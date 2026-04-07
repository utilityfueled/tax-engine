import {
  publicHostedAffordanceCatalog,
  publicHostedPlanCatalog,
  type HostedPlanId,
  type WorkspaceDeploymentMode
} from "@tax-engine/contracts";

type DeploymentEnvironment = Record<string, string | undefined>;

export interface DeploymentModeAffordanceView {
  id: string;
  label: string;
  badgeLabel: string;
  badgeTone: string;
  summary: string;
}

export interface DeploymentModeViewModel {
  mode: WorkspaceDeploymentMode;
  modeBadgeLabel: string;
  modeBadgeTone: string;
  deploymentLabel: string;
  summary: string;
  statusNotes: string[];
  planCatalogVisible: boolean;
  affordances: DeploymentModeAffordanceView[];
}

function formatPlanBadge(planId: HostedPlanId) {
  switch (planId) {
    case "starter":
      return {
        badgeLabel: "Starter",
        badgeTone: "starter"
      };
    case "plus":
      return {
        badgeLabel: "Plus",
        badgeTone: "plus"
      };
    case "review":
      return {
        badgeLabel: "Review Preview",
        badgeTone: "review"
      };
  }
}

export function resolveDeploymentMode(
  env: DeploymentEnvironment = process.env
): WorkspaceDeploymentMode {
  const configuredMode = env.TAX_ENGINE_DEPLOYMENT_MODE?.trim().toLowerCase();

  return configuredMode === "hosted" ? "hosted" : "self-host";
}

export function buildDeploymentModeViewModel(
  mode: WorkspaceDeploymentMode
): DeploymentModeViewModel {
  if (mode === "hosted") {
    return {
      mode,
      modeBadgeLabel: "Cloud",
      modeBadgeTone: "hosted",
      deploymentLabel: "cloud account",
      summary: "Your hosted account stores billing state, reminder settings, and privacy-safe workspace shells while raw tax forms stay out of durable server storage.",
      statusNotes: [
        "Sign in to manage billing and unlock hosted software features.",
        "Workspace shells and progress markers sync across devices without storing raw forms or OCR text on the server.",
        "Optional AI features may send selected redacted data to configured model providers."
      ],
      planCatalogVisible: true,
      affordances: publicHostedAffordanceCatalog.map((affordance) => {
        const badge = affordance.rollout === "coming-soon"
          ? {
              badgeLabel: "Coming Soon",
              badgeTone: "coming-soon"
            }
          : formatPlanBadge(affordance.minimumPlanId);

        return {
          id: affordance.id,
          label: affordance.label,
          badgeLabel: badge.badgeLabel,
          badgeTone: badge.badgeTone,
          summary: affordance.summary
        };
      })
    };
  }

  return {
    mode,
    modeBadgeLabel: "Local",
    modeBadgeTone: "self-host",
    deploymentLabel: "local (on your device)",
    summary: "Local mode stores returns in your browser by default. Your data stays on your device. No account needed.",
    statusNotes: [
      "All features are free in local mode.",
      "Uploads, answers, and completed returns are stored in your browser — no account required.",
      "All calculations run locally on your device.",
      "Optional AI features can send selected data to providers you configure."
    ],
    planCatalogVisible: false,
    affordances: [
      {
        id: "local-workspace",
        label: "Local tax returns",
        badgeLabel: "Free",
        badgeTone: "ungated",
        summary: "Create, edit, and resume tax returns stored locally in your browser."
      },
      {
        id: "provider-summary",
        label: "AI-powered summary",
        badgeLabel: "Free",
        badgeTone: "ungated",
        summary: "Generate an AI summary of your draft return with privacy-safe data handling."
      },
      {
        id: "filing-pack-export",
        label: "Download completed return",
        badgeLabel: "Free",
        badgeTone: "ungated",
        summary: "Export your completed tax return documents — no subscription required."
      }
    ]
  };
}

export function getHostedPlanCatalog() {
  return publicHostedPlanCatalog;
}
