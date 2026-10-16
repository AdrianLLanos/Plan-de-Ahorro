import test from 'node:test';
import assert from 'node:assert/strict';
import { createCells, applyDeposit, summarize, MAX_CELLS } from './savings.mjs';

test('Una meta no divisible se alcanza exactamente con una última casilla ajustada', () => {
  const cells = createCells(550, [100, 200]);
  assert.deepEqual(cells.map(cell => cell.monto), [100, 200, 100, 150]);
  assert.equal(summarize({ objetivo: 550, celdas: cells.map(cell => ({ ...cell, activo: true })) }).saved, 550);
});

test('Los decimales no acumulan errores ni generan casillas extra', () => {
  assert.deepEqual(createCells(0.3, [0.1]).map(cell => cell.monto), [0.1, 0.1, 0.1]);
  const result = applyDeposit(createCells(0.3, [0.1]), 0.3);
  assert.equal(result.applied, 0.3);
  assert.equal(result.remainder, 0);
  assert.equal(result.marked, 3);
});

test('Rechaza entradas que podrían bloquear o corromper el plan', () => {
  for (const amount of [0, -1, '', NaN, Infinity, 0.001, 'abc']) {
    assert.throws(() => createCells(100, [amount]));
    assert.throws(() => applyDeposit([], amount));
  }
  assert.throws(() => createCells(100, []));
  assert.throws(() => createCells(MAX_CELLS + 1, [1]));
});

test('Un abono insuficiente no inventa ahorro', () => {
  const cells = createCells(20, [5]);
  const result = applyDeposit(cells, 2);
  assert.equal(result.marked, 0);
  assert.equal(result.applied, 0);
  assert.equal(result.remainder, 2);
  assert.deepEqual(result.cells, cells);
});

test('Un abono variable respeta las casillas existentes y reporta el sobrante', () => {
  const cells = [{ monto: 100, activo: true }, { monto: 200, activo: false }, { monto: 100, activo: false }];
  const result = applyDeposit(cells, 150);
  assert.deepEqual(result.cells.map(cell => cell.activo), [true, false, true]);
  assert.equal(result.applied, 100);
  assert.equal(result.remainder, 50);
  assert.equal(cells[2].activo, false);
});

test('El progreso de planes antiguos usa la meta monetaria, no la cantidad de casillas', () => {
  const stats = summarize({ objetivo: 500, celdas: [{ monto: 100, activo: true }, { monto: 300, activo: true }] });
  assert.equal(stats.percent, 80);
  assert.equal(stats.remaining, 100);
  assert.equal(stats.covered, 400);
});

test('Un abono superior a lo pendiente no sobrepasa la meta y reporta el excedente', () => {
  const result = applyDeposit(createCells(25, [10]), 30);
  assert.equal(result.applied, 25);
  assert.equal(result.remainder, 5);
  assert.equal(summarize({ objetivo: 25, celdas: result.cells }).percent, 100);
});
