export interface Session {
  userGuid: string;
  userName: string;
  userPhone: string;
}

const KEYS = {
  userGuid: "userGUID",
  userName: "userName",
  userPhone: "userPhone",
} as const;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function loadSession(): Session | null {
  if (!isBrowser()) return null;
  const userGuid = sessionStorage.getItem(KEYS.userGuid);
  const userName = sessionStorage.getItem(KEYS.userName);
  const userPhone = sessionStorage.getItem(KEYS.userPhone);
  if (!userGuid || !userName || !userPhone) return null;
  return { userGuid, userName, userPhone };
}

export function saveSession(s: Session): void {
  if (!isBrowser()) return;
  sessionStorage.setItem(KEYS.userGuid, s.userGuid);
  sessionStorage.setItem(KEYS.userName, s.userName);
  sessionStorage.setItem(KEYS.userPhone, s.userPhone);
}

export function clearSession(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(KEYS.userGuid);
  sessionStorage.removeItem(KEYS.userName);
  sessionStorage.removeItem(KEYS.userPhone);
}
