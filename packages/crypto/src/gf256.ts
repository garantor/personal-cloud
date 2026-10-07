/**
 * Galois Field GF(2^8) arithmetic using AES irreducible polynomial 0x11b (x^8 + x^4 + x^3 + x + 1).
 */

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    const willOverflow = (x & 0x80) !== 0;
    x = (x << 1) & 0xff;
    if (willOverflow) {
      x ^= 0x1d; // 0x11d & 0xff
    }
  }
  LOG_TABLE[0] = 0;
})();

export function gfAdd(a: number, b: number): number {
  return a ^ b;
}

export function gfSub(a: number, b: number): number {
  return a ^ b;
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero in GF(2^8)');
  if (a === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] - LOG_TABLE[b] + 255) % 255];
}

export function gfInv(a: number): number {
  if (a === 0) throw new Error('Inversion of zero in GF(2^8)');
  return EXP_TABLE[255 - LOG_TABLE[a]];
}
