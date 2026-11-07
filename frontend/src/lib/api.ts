const API_BASE = "/api/v1";

export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  fields: ApiFieldError[];

  constructor(message: string, status: number, code = "API_ERROR", fields: ApiFieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function getCookie(name: string): string | null {
  const value = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
  return value ? decodeURIComponent(value) : null;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  const isFormData = options.body instanceof FormData;

  if (options.body && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCookie("pnfor_csrf");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    credentials: "include",
  }).catch(() => {
    throw new ApiError(
      "Le serveur SI PNFor PILOTE est injoignable. Vérifiez qu'il est démarré.",
      0,
      "NETWORK_ERROR",
    );
  });

  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let detail = `Erreur ${response.status}`;
    let fields: ApiFieldError[] = [];
    try {
      const body = await response.json();
      code = body.code ?? code;
      detail = body.detail ?? body.title ?? detail;
      fields = Array.isArray(body.errors) ? body.errors : [];
    } catch {
      detail = response.statusText || detail;
    }
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("auth:unauthorized"));
    }
    throw new ApiError(detail, response.status, code, fields);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}
