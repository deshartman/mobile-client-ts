const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";

function sydneyTimestamp(): string {
  return new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function logOut(identifier: string, message: string): void {
  console.log(`${GREEN}[${sydneyTimestamp()}] [${identifier}] ${message}${RESET}`);
}

export function logError(identifier: string, message: string): void {
  console.error(`${RED}[${sydneyTimestamp()}] [${identifier}] ${message}${RESET}`);
}
