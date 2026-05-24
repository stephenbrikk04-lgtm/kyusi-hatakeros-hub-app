export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}

export function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

// Standard single-elimination seeding order for a bracket of `size` (power of 2).
// Returns an array of seed numbers (1-based) ordered by bracket slot top->bottom,
// so that 1 meets the lowest seed, top half / bottom half are balanced, etc.
export function seedOrder(size: number): number[] {
  let rounds = Math.log2(size)
  let seeds = [1, 2]
  for (let r = 1; r < rounds; r++) {
    const next: number[] = []
    const sum = seeds.length * 2 + 1
    for (const s of seeds) {
      next.push(s)
      next.push(sum - s)
    }
    seeds = next
  }
  return seeds
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
