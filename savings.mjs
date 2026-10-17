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

export function editPlan(plan, title, target) {
  const titulo = String(title).trim();
  if (!titulo || titulo.length > 100) throw new Error('Escribe un nombre de hasta 100 caracteres.');
  const goal = cents(target);
  const saved = Math.round(summarize(plan).saved * 100);
  if (goal === Math.round(Number(plan.objetivo) * 100)) {
    return { titulo, objetivo: goal / 100, celdas: plan.celdas };
  }
  let remaining = Math.max(0, goal - saved);
  const celdas = [];
  for (const cell of plan.celdas) {
    if (cell.activo) celdas.push({ ...cell });
    else if (remaining > 0) {
      const amount = Math.min(cents(cell.monto), remaining);
      celdas.push({ ...cell, monto: amount / 100 });
      remaining -= amount;
    }
  }
  // Keep existing saved cells intact; extend the pending board using its amounts.
  const amounts = plan.celdas.length ? plan.celdas.map(cell => cell.monto) : [goal / 100];
  if (remaining > 0) celdas.push(...createCells(remaining / 100, amounts));
  if (celdas.length > MAX_CELLS) throw new Error(`El plan supera las ${MAX_CELLS} casillas.`);
  return { titulo, objetivo: goal / 100, celdas };
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
