export interface AdminProfile {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

export interface AdminSession {
  accessToken: string;
  expiresAt: number;
  admin: AdminProfile;
}

const ADMIN_SESSION_KEY = '4b-admin-session';

export function getAdminSession(): AdminSession | null {
  const rawSession = window.localStorage.getItem(ADMIN_SESSION_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession) as AdminSession;
    if (!session.accessToken || session.expiresAt <= Date.now()) {
      clearAdminSession();
      return null;
    }

    return session;
  } catch {
    clearAdminSession();
    return null;
  }
}

export function saveAdminSession(session: AdminSession) {
  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

export function clearAdminSession() {
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}

export function getAdminToken() {
  return getAdminSession()?.accessToken;
}

export function isAdminAuthenticated() {
  return Boolean(getAdminSession());
}
