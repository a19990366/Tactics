export const logs: string[] = [];

export function log(s: string) {
  logs.unshift(s);
  if (logs.length > 80) logs.pop();
}

export function initLog() {
  logs.length = 0;
}
