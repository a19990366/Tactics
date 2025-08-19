export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
export function rnd(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
export function facingDir(team: "A" | "B") {
  return team === "A" ? +1 : -1;
}
export function newId() {
  return Math.random().toString(36).slice(2);
}
export function diceKey() {
  let s = "";
  for (let i = 0; i < 6; i++)
    s += (1 + Math.floor(Math.random() * 6)).toString();
  return s;
}
