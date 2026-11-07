const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*+-?_";

export function generatePassword(length = 20): string {
  const pools = [UPPER, LOWER, DIGITS, SYMBOLS];
  const all = pools.join("");
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  const chars = Array.from(values, (value, index) => {
    const pool = index < pools.length ? pools[index] : all;
    return pool[value % pool.length];
  });
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapValues = new Uint32Array(1);
    crypto.getRandomValues(swapValues);
    const target = swapValues[0] % (index + 1);
    [chars[index], chars[target]] = [chars[target], chars[index]];
  }
  return chars.join("");
}
