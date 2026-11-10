export const communicationCategoryLabels: Record<string, string> = {
  information: "Information",
  maintenance: "Maintenance",
  security: "Sécurité",
  change: "Changement",
  event: "Événement",
  other: "Autre",
};

export const communicationStatusLabels: Record<string, string> = {
  draft: "Brouillon",
  scheduled: "Planifiée",
  published: "Publiée",
  archived: "Archivée",
};

export const communicationStatusTones: Record<string, "neutral" | "info" | "success" | "warning"> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "warning",
};

export const communicationChannelLabels: Record<string, string> = {
  in_app: "Notification interne",
  email: "E-mail",
  both: "Notification + e-mail",
};

export const meetingTypeLabels: Record<string, string> = {
  team: "Équipe",
  service: "Service",
  project: "Projet",
  manager_1on1: "Point responsable",
  crisis: "Cellule de crise",
  other: "Autre",
};

export const meetingStatusLabels: Record<string, string> = {
  planned: "Planifiée",
  done: "Réalisée",
  cancelled: "Annulée",
};

export const meetingStatusTones: Record<string, "info" | "success" | "neutral" | "danger"> = {
  planned: "info",
  done: "success",
  cancelled: "danger",
};

export const pointStatusLabels: Record<string, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  blocked: "Bloqué",
  done: "Traité",
};

export const pointStatusTones: Record<string, "neutral" | "info" | "warning" | "success"> = {
  open: "neutral",
  in_progress: "info",
  blocked: "warning",
  done: "success",
};

export const priorityLabels: Record<string, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique",
};

export const priorityTones: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const trainingStatusLabels: Record<string, string> = {
  planned: "Planifiée",
  in_progress: "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};

export const trainingStatusTones: Record<string, "info" | "warning" | "success" | "danger"> = {
  planned: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "danger",
};
