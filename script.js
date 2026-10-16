import { createCells, summarize, applyDeposit } from './savings.mjs';

const $ = id => document.getElementById(id);
const money = value => '$' + new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(value);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const filters = new Map();
const busy = new Set();
let planes = [];
let paginaActual = 1;
const porPagina = 7;
let ready = false;
let creating = false;
let db, firestore;
let toastTimer;
let newPlanId;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function message(text, error = false) {
  clearTimeout(toastTimer);
  $('mensaje').textContent = text;
  $('mensaje').classList.toggle('error', error);
  $('mensaje').hidden = false;
  toastTimer = setTimeout(() => { $('mensaje').hidden = true; }, 9000);
}

function connection(text, type = '') {
  $('conexion').textContent = text;
  $('conexion').className = `connection ${type}`;
}

function confirmAction(action, plan) {
  const dialog = $('confirmacion');
  if (dialog.open) return Promise.resolve(false);
  const deleting = action === 'delete';
  dialog.dataset.variant = deleting ? 'delete' : 'reset';
  $('confirm-icon').textContent = deleting ? '×' : '↺';
  $('confirm-title').textContent = deleting ? '¿Eliminar este plan?' : '¿Reiniciar progreso?';
  $('confirm-description').textContent = deleting
    ? 'Se eliminarán el plan y todo su progreso. Esta acción no se puede deshacer.'
    : 'Se desmarcarán todas las casillas y el ahorro registrado volverá a cero. Tu plan y su meta se conservarán.';
  $('confirm-plan').textContent = plan.titulo;
  $('confirm-accept').textContent = deleting ? 'Sí, eliminar plan' : 'Sí, reiniciar';
  dialog.returnValue = '';
  return new Promise(resolve => {
    const finish = accepted => {
      dialog.removeEventListener('submit', onSubmit);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close(accepted ? 'confirm' : 'cancel');
      document.body.classList.remove('modal-open');
      resolve(accepted);
    };
    const onSubmit = event => {
      event.preventDefault();
      finish(event.submitter?.value === 'confirm');
    };
    const onCancel = event => {
      event.preventDefault();
      finish(false);
    };
    const onClose = () => finish(dialog.returnValue === 'confirm');
    dialog.addEventListener('submit', onSubmit);
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    document.body.classList.add('modal-open');
  });
}

$('confirmacion').addEventListener('click', event => {
  const dialog = $('confirmacion');
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
});

function planCard(plan) {
  const stats = summarize(plan);
  const filter = filters.get(plan.id) || 'all';
  const id = escapeHTML(plan.id);
  const disabled = busy.has(plan.id) ? 'disabled' : '';
  const nextIndex = plan.celdas.findIndex(cell => !cell.activo);
  const visibleCells = plan.celdas.map((cell, index) => {
    if ((filter === 'completed' && !cell.activo) || (filter === 'pending' && cell.activo)) return '';
    return `<button type="button" class="celda ${cell.activo ? 'activa' : ''} ${!cell.activo && index === nextIndex ? 'next-cell' : ''}" data-action="toggle" data-index="${index}" aria-pressed="${Boolean(cell.activo)}" aria-label="Casilla ${index + 1}, ${escapeHTML(money(cell.monto))}, ${cell.activo ? 'ahorrada' : 'pendiente'}" ${disabled}>${cell.activo ? '✓ ' : ''}${escapeHTML(new Intl.NumberFormat('es-BO').format(cell.monto))}</button>`;
  }).join('');
  const uniqueAmounts = [...new Set(plan.celdas.map(cell => cell.monto))];
  const amountSummary = uniqueAmounts.length <= 3 ? uniqueAmounts.map(money).join(' / ') : 'Montos variables';
  const goalReached = stats.saved >= Number(plan.objetivo);
  return `<article class="plan" data-plan-id="${id}" aria-label="${escapeHTML(plan.titulo)}" aria-busy="${busy.has(plan.id)}">
    <div class="plan-head"><div class="plan-title-row"><div><h3>📌 ${escapeHTML(plan.titulo)}</h3><p>Meta fijada: <strong>${money(plan.objetivo)}</strong> &nbsp;·&nbsp; Por casilla: ${escapeHTML(amountSummary)}</p></div><div class="percent"><span>PROGRESO TOTAL</span><strong>${stats.percent.toFixed(1)}%</strong></div></div>
    <div class="progress" role="progressbar" aria-label="Progreso de ahorro" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${stats.percent.toFixed(1)}"><div class="progress-fill" style="width:${stats.percent}%"></div></div><div class="progress-labels"><span>Inicio: $0</span><strong>${money(stats.saved)} ahorrados</strong><span>${money(plan.objetivo)} Meta</span></div></div>
    <div class="plan-body"><div class="plan-tools"><div class="plan-stats"><span><strong>${money(stats.remaining)}</strong>Monto restante</span><span><strong>${stats.completed} <small>/ ${stats.count}</small></strong>Casillas ahorradas</span></div>
    <form class="deposit-form" data-plan-id="${id}"><div class="deposit-field"><label for="abono-${id}">Abono rápido ($)</label><input id="abono-${id}" name="deposit" type="number" min="0.01" step="0.01" placeholder="Ej: 200" required ${disabled}></div><button type="submit" class="button secondary" ${disabled}>Abonar</button></form></div>
    ${stats.covered < Number(plan.objetivo) ? '<p class="notice">Las casillas de este plan anterior no cubren toda la meta. Tu progreso se calcula sobre el objetivo original.</p>' : ''}
    <div class="grid-toolbar"><h4>Tablero de ahorro</h4><div class="filters" role="group" aria-label="Filtrar casillas">${[['all', 'Todas', stats.count], ['completed', 'Ahorradas', stats.completed], ['pending', 'Pendientes', stats.count - stats.completed]].map(([value, label, count]) => `<button type="button" class="filter" data-action="filter" data-filter="${value}" aria-pressed="${filter === value}">${label} (${count})</button>`).join('')}</div></div>
    <div class="legend"><span><i class="done"></i>Ahorrada</span><span><i class="next"></i>Próxima a ahorrar</span><span><i></i>Pendiente</span></div>
    <div class="grid">${visibleCells || '<p class="grid-empty">No hay casillas en este filtro.</p>'}</div>
    <div class="plan-actions"><span class="${goalReached ? 'complete-label' : ''}">${busy.has(plan.id) ? 'Guardando cambios…' : goalReached ? '✓ ¡Objetivo cumplido!' : 'Haz clic en una casilla para marcar o desmarcar.'}</span><div><button type="button" class="text-button" data-action="reset" ${disabled}>Reiniciar progreso</button><button type="button" class="text-button danger" data-action="delete" ${disabled}>Eliminar plan</button></div></div></div>
  </article>`;
}

function render() {
  const retained = new Map([...document.querySelectorAll('.plan')].map(card => [card.dataset.planId, {
    deposit: card.querySelector('[name=deposit]').value,
    scroll: card.querySelector('.grid').scrollTop,
  }]));
  const focused = document.activeElement;
  const focusedPlan = focused?.closest('.plan')?.dataset.planId;
  const focusedId = focused?.id;
  const focusedAction = focused?.dataset.action;
  const focusedIndex = focused?.dataset.index;
  const focusedFilter = focused?.dataset.filter;
  const pages = Math.max(1, Math.ceil(planes.length / porPagina));
  paginaActual = Math.max(1, Math.min(paginaActual, pages));
  const totals = planes.map(summarize);
  const saved = totals.reduce((sum, plan) => sum + Math.round(plan.saved * 100), 0) / 100;
  $('totalGlobal').textContent = $('resumenAhorrado').textContent = money(saved);
  $('resumenRestante').textContent = money(totals.reduce((sum, plan) => sum + Math.round(plan.remaining * 100), 0) / 100);
  $('resumenActivos').textContent = totals.filter(plan => plan.remaining > 0).length;
  $('resumenCumplidos').textContent = totals.filter(plan => plan.remaining === 0).length;
  $('cantidadPlanes').textContent = `${planes.length} ${planes.length === 1 ? 'plan' : 'planes'}`;
  $('planes').setAttribute('aria-busy', 'false');
  $('planes').innerHTML = planes.length ? planes.slice((paginaActual - 1) * porPagina, paginaActual * porPagina).map(planCard).join('') : '<div class="empty"><span aria-hidden="true">🌱</span><h3>Tu próxima meta empieza aquí</h3><p>Crea tu primer plan y convierte cada casilla en un paso adelante.</p></div>';
  document.querySelectorAll('.plan').forEach(card => {
    const previous = retained.get(card.dataset.planId);
    if (previous) {
      card.querySelector('[name=deposit]').value = previous.deposit;
      card.querySelector('.grid').scrollTop = previous.scroll;
    }
    if (card.dataset.planId === focusedPlan) {
      const replacement = [...card.querySelectorAll('button,input')].find(element => focusedId ? element.id === focusedId : focusedAction && element.dataset.action === focusedAction && element.dataset.index === focusedIndex && element.dataset.filter === focusedFilter);
      replacement?.focus({ preventScroll: true });
    }
  });
  document.querySelector('.pagination').hidden = planes.length <= porPagina;
  $('infoPagina').textContent = `Página ${paginaActual} de ${pages}`;
  $('paginaAnterior').disabled = paginaActual === 1;
  $('paginaSiguiente').disabled = paginaActual === pages;
}

function revealNewPlan() {
  if (!newPlanId) return;
  const index = planes.findIndex(plan => plan.id === newPlanId);
  if (index === -1) return;
  paginaActual = Math.floor(index / porPagina) + 1;
  render();
  [...document.querySelectorAll('.plan')].find(card => card.dataset.planId === newPlanId)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  newPlanId = null;
}

async function changePlan(id, action) {
  if (!ready || busy.has(id)) return;
  const originalFocus = document.activeElement;
  const focusId = originalFocus?.id;
  const focusIndex = originalFocus?.dataset.index;
  busy.add(id);
  render();
  try {
    const result = await firestore.runTransaction(db, async transaction => {
      const reference = firestore.doc(db, 'planes', id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('Este plan ya no existe.');
      const plan = snapshot.data();
      const changed = action(plan);
      if (changed.remove) transaction.delete(reference);
      else transaction.update(reference, { celdas: changed.cells });
      return changed;
    });
    if (result.message) message(result.message);
    return true;
  } catch (error) {
    console.error('No se pudo guardar el plan:', error);
    message(error.code ? 'No se pudo guardar en Firebase. Revisa tu conexión y los permisos e inténtalo de nuevo.' : error.message, true);
    return false;
  } finally {
    busy.delete(id);
    render();
    const card = [...document.querySelectorAll('.plan')].find(item => item.dataset.planId === id);
    if (card) {
      const focusTarget = [...card.querySelectorAll('button,input')].find(element => focusId ? element.id === focusId : focusIndex !== undefined && element.dataset.index === focusIndex);
      focusTarget?.focus({ preventScroll: true });
    }
  }
}

$('plan-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (creating) return;
  if (!ready) return message('Espera a que se conecte Firebase antes de crear un plan.', true);
  const title = $('titulo').value.trim();
  if (!title) return message('Escribe un nombre para tu plan.', true);
  let cells;
  try { cells = createCells($('objetivo').value, $('montos').value.split(',').map(value => value.trim())); }
  catch (error) { return message(error.message, true); }
  creating = true;
  $('crearPlan').disabled = true;
  $('crearPlan').textContent = 'Guardando…';
  try {
    const created = await firestore.addDoc(firestore.collection(db, 'planes'), { titulo: title, objetivo: Number($('objetivo').value), celdas: cells });
    newPlanId = created.id;
    $('plan-form').reset();
    revealNewPlan();
    message('Tu plan se creó y se guardó en Firebase.');
  } catch (error) {
    console.error('No se pudo crear el plan:', error);
    message('No se pudo crear el plan. Revisa tu conexión y los permisos de Firebase.', true);
  } finally {
    creating = false;
    $('crearPlan').disabled = false;
    $('crearPlan').textContent = '＋ Crear plan';
  }
});

$('planes').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  const card = button?.closest('.plan');
  if (!card) return;
  const id = card.dataset.planId;
  const action = button.dataset.action;
  if (action === 'filter') { filters.set(id, button.dataset.filter); render(); return; }
  if (action === 'toggle') {
    const index = Number(button.dataset.index);
    const desired = button.getAttribute('aria-pressed') !== 'true';
    await changePlan(id, plan => {
      if (!plan.celdas[index]) throw new Error('La casilla ya no existe.');
      return { cells: plan.celdas.map((cell, i) => i === index ? { ...cell, activo: desired } : cell) };
    });
  }
  const selectedPlan = planes.find(plan => plan.id === id);
  if (!selectedPlan) return;
  if (action === 'reset' && await confirmAction(action, selectedPlan)) {
    await changePlan(id, plan => ({ cells: plan.celdas.map(cell => ({ ...cell, activo: false })), message: 'Progreso reiniciado.' }));
  }
  if (action === 'delete' && await confirmAction(action, selectedPlan)) {
    await changePlan(id, () => ({ remove: true, message: 'Plan eliminado.' }));
  }
});

$('planes').addEventListener('submit', async event => {
  const form = event.target.closest('.deposit-form');
  if (!form) return;
  event.preventDefault();
  const id = form.dataset.planId;
  const amount = form.elements.deposit.value;
  const saved = await changePlan(id, plan => {
    const result = applyDeposit(plan.celdas, amount);
    if (!result.marked) throw new Error('El monto no alcanza para una casilla pendiente o el plan ya está completo. No se registró ningún abono.');
    return { cells: result.cells, message: `${money(result.applied)} registrados en ${result.marked} ${result.marked === 1 ? 'casilla' : 'casillas'}.${result.remainder ? ` Quedaron ${money(result.remainder)} sin aplicar; ese saldo no se guardó.` : ''}` };
  });
  if (saved) {
    const card = [...document.querySelectorAll('.plan')].find(item => item.dataset.planId === id);
    if (card) card.querySelector('[name=deposit]').value = '';
  }
});

$('paginaAnterior').addEventListener('click', () => { paginaActual--; render(); });
$('paginaSiguiente').addEventListener('click', () => { paginaActual++; render(); });
window.addEventListener('scroll', () => { $('btnArriba').hidden = window.scrollY < 300; }, { passive: true });
$('btnArriba').addEventListener('click', () => window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }));

async function connect() {
  $('crearPlan').disabled = true;
  try {
    const modules = await Promise.all([import('./firebase.js'), import('https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js')]);
    db = modules[0].db;
    firestore = modules[1];
    firestore.onSnapshot(firestore.collection(db, 'planes'), { includeMetadataChanges: true }, snapshot => {
      planes = snapshot.docs.map(item => ({ ...item.data(), id: item.id })).map(plan => ({ ...plan, celdas: Array.isArray(plan.celdas) ? plan.celdas : [] }));
      ready = true;
      $('crearPlan').disabled = creating;
      connection(snapshot.metadata.hasPendingWrites ? 'Guardando…' : snapshot.metadata.fromCache ? 'Datos en caché' : 'Sincronizado', snapshot.metadata.fromCache ? '' : 'online');
      render();
      revealNewPlan();
    }, loadError);
  } catch (error) { loadError(error); }
}

function loadError(error) {
  console.error('No se pudo conectar a Firebase:', error);
  ready = false;
  $('crearPlan').disabled = true;
  connection('Sin conexión a Firebase', 'error');
  $('planes').setAttribute('aria-busy', 'false');
  if (!planes.length) $('planes').innerHTML = '<div class="empty"><span aria-hidden="true">☁</span><h3>No pudimos cargar tus planes</h3><p>Revisa la conexión y los permisos de Firebase. Después, recarga la página.</p></div>';
  message('No se pudo conectar a Firebase. Revisa la conexión y los permisos del proyecto.', true);
}

connect();
