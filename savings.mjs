export const MAX_CELLS = 5000;

export function cents(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || !Number.isSafeInteger(Math.round(number * 100))) {
    throw new Error('Usa montos positivos y válidos.');
  }
  const result = Math.round(number * 100);
  if (result < 1 || Math.abs(number * 100 - result) > 0.000001) {
    throw new Error('Los montos pueden tener hasta dos decimales.');
  }
  return result;
}

export function createCells(target, amounts) {
  const goal = cents(target);
  if (!amounts.length) throw new Error('Ingresa al menos un monto por casilla.');
  const values = amounts.map(cents);
  const cells = [];
  let remaining = goal;
  while (remaining > 0) {
    if (cells.length >= MAX_CELLS) throw new Error(`El plan supera las ${MAX_CELLS} casillas. Aumenta los montos por casilla.`);
    const amount = Math.min(values[cells.length % values.length], remaining);
    cells.push({ monto: amount / 100, activo: false });
    remaining -= amount;
  }
  return cells;
}

export function summarize(plan) {
  const cells = Array.isArray(plan.celdas) ? plan.celdas : [];
  const savedCents = cells.reduce((sum, cell) => sum + (cell.activo ? Math.round(Number(cell.monto) * 100) || 0 : 0), 0);
  const targetCents = Math.round(Number(plan.objetivo) * 100) || 0;
  return {
    saved: savedCents / 100,
    remaining: Math.max(0, targetCents - savedCents) / 100,
    completed: cells.filter(cell => cell.activo).length,
    count: cells.length,
    percent: targetCents > 0 ? Math.min(100, savedCents / targetCents * 100) : 0,
    covered: cells.reduce((sum, cell) => sum + (Math.round(Number(cell.monto) * 100) || 0), 0) / 100,
  };
}

export function applyDeposit(cells, amount) {
  let remaining = cents(amount);
  let marked = 0;
  const next = cells.map(cell => {
    const value = Math.round(Number(cell.monto) * 100);
    if (!cell.activo && value > 0 && value <= remaining) {
      remaining -= value;
      marked++;
      return { ...cell, activo: true };
    }
    return { ...cell };
  });
  return { cells: next, marked, applied: (cents(amount) - remaining) / 100, remainder: remaining / 100 };
}
