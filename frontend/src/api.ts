const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? "http://localhost:4000" : "");
const AUTH_TOKEN_STORAGE_KEY = "xp_predictor.authToken";

function readStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!stored) return null;
  const token = stored.trim();
  return token ? token : null;
}

let authToken: string | null = readStoredAuthToken();

export type UserRole = "USER" | "ADMIN";

export type AuthUser = {
  id: number;
  loginId: string;
  role: UserRole;
  createdAt: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type SessionInput = {
  playedAt: string;
  stage1: string;
  stage2: string;
  weapon: string;
  wins: number;
  losses: number;
  fatigue: number;
  irritability: number;
  memo?: string;
};

export type Session = SessionInput & {
  id: number;
  userId?: number | null;
};

export type SessionWithUser = Session & {
  user?: {
    id: number;
    loginId: string;
    role: UserRole;
  } | null;
};

export type PredictionConditionInput = {
  stage1: string;
  stage2: string;
  weapon: string;
  fatigue: number;
  irritability: number;
};

export type Prediction = {
  predictedWinRate: number;
  baseWinRate: number;
  weaponWinRate: number;
  stageWinRate: number;
  mentalPenalty: number;
  note: string;
};

export type AdminUser = {
  id: number;
  loginId: string;
  role: UserRole;
  createdAt: string;
  _count: {
    sessions: number;
  };
};

export function setAuthToken(token: string) {
  const normalized = token.trim();
  authToken = normalized || null;
  if (typeof window === "undefined") return;
  if (authToken) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authToken);
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function clearAuthToken() {
  authToken = null;
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function hasAuthToken() {
  return Boolean(authToken);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function register(input: {
  loginId: string;
  password: string;
}): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function login(input: {
  loginId: string;
  password: string;
}): Promise<AuthResponse> {
  return requestJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchMe(): Promise<AuthUser> {
  return requestJson<AuthUser>("/api/auth/me");
}

export async function logout(): Promise<void> {
  await requestJson<{ ok: true }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function createSession(input: SessionInput): Promise<Session> {
  return requestJson<Session>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchSessions(userId?: number): Promise<Session[]> {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return requestJson<Session[]>(`/api/sessions${query}`);
}

export async function fetchPrediction(userId?: number): Promise<Prediction> {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return requestJson<Prediction>(`/api/prediction${query}`);
}

export async function fetchPredictionByCondition(
  input: PredictionConditionInput & { userId?: number }
): Promise<Prediction> {
  return requestJson<Prediction>("/api/prediction/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  return requestJson<AdminUser[]>("/api/admin/users");
}

export async function updateUserRole(userId: number, role: UserRole): Promise<AuthUser> {
  return requestJson<AuthUser>(`/api/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export async function fetchAdminSessions(userId?: number): Promise<SessionWithUser[]> {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return requestJson<SessionWithUser[]>(`/api/admin/sessions${query}`);
}





