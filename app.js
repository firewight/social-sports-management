Exit code: 0
Wall time: 0.2 seconds
Output:
const db = window.supabase.createClient(
  'https://fzdtkmixmodttroesjgn.supabase.co',
  'sb_publishable_EjZt9V2__QZmOzLfYa-Czw_T_CRsDwR'
);

const state = { players: [], games: [], grounds: [], register: {} };
let selectedDate = '';
let calendarMonth = new Date();
const expandedPlayerSummaries = new Set();
calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);

const $ = (selector) => document.querySelector(selector);
const dateInput = $('#selected-date');
const groundInput = $('#selected-ground');
const formatDate = (value) => new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const formatCurrency = (value) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(value) || 0);
const selectedGame = () => state.games.find((game) => game.date === selectedDate);
const escapeHtml = (value) => { const div = document.createElement('div'); div.textContent = value || ''; return div.innerHTML; };

async function migrateLegacyData() {
  const legacy = localStorage.getItem('social-sports-management-v1');
  if (!legacy || localStorage.getItem('social-sports-management-supabase-migrated')) return;
  try {
    const saved = JSON.parse(legacy);
    const players = (saved.players || []).map(({ id, name, phone = '', email = '' }) => ({ id, name, phone, email }));
    const games = (saved.games || []).map((game) => ({ game_date: game.date }));
    if (players.length) {
      const { error } = await db.from('players').upsert(players);
      if (error) throw error;
    }
    if (games.length) {
      const { error } = await db.from('games').upsert(games);
      if (error) throw error;
    }
    const registrations = Object.entries(saved.register || {}).flatMap(([game_date, entries]) => Object.entries(entries).map(([player_id, record]) => ({
      game_date, player_id, attended: Boolean(record.attended), paid: Boolean(record.paid), amount: record.amount === '' || record.amount == null ? null : Number(record.amount)
    })));
    if (registrations.length) {
      const { error } = await db.from('registrations').upsert(registrations);
      if (error) throw error;
    }
    localStorage.setItem('social-sports-management-supabase-migrated', 'true');
  } catch (error) {
    console.error('Legacy data migration failed', error);
  }
}

async function loadData() {
  const [players, games, grounds, registrations] = await Promise.all([
    db.from('players').select('*').order('name'),
    db.from('games').select('*').order('game_date'),
    db.from('grounds').select('*').order('is_home', { ascending: false }).order('name'),
    db.from('registrations').select('*')
  ]);
  if (players.error || games.error || grounds.error || registrations.error) {
    console.error(players.error || games.error || grounds.error || registrations.error);
    $('#roster-caption').textContent = 'Could not connect to the shared register. Refresh and try again.';
    return;
  }
  state.players = players.data;
  state.grounds = grounds.data;
  state.games = games.data.map((game) => ({ date: game.game_date, ground_id: game.ground_id }));
  state.register = {};
  registrations.data.forEach((record) => {
    const date = record.game_date;
    state.register[date] ||= {};
    state.register[date][record.player_id] = { attended: record.attended, paid: record.paid, amount: record.amount };
  });
  render();
}

function render() {
  $('#player-count').textContent = state.players.length;
  groundInput.innerHTML = state.grounds.map((ground) => `<option value="${ground.id}">${escapeHtml(ground.name)}${ground.is_home ? ' (Home Ground)' : ''}</option>`).join('');
  if (!groundInput.value) groundInput.value = state.grounds.find((ground) => ground.is_home)?.id || state.grounds[0]?.id || '';
  dateInput.value = selectedDate;
  const game = selectedGame();
  const gameGround = state.grounds.find((ground) => ground.id === game?.ground_id);
  $('#selected-date-label').textContent = selectedDate ? formatDate(selectedDate) : 'Choose a day on the calendar';
  $('#game-status').textContent = game ? `${formatDate(game.date)}${gameGround ? ` Â· ${gameGround.name}` : ''}` : 'Choose a date';
  $('#delete-game').disabled = !game;
  renderCalendar(); renderSummary(); renderRoster(); renderPlayerPaymentHistory(); renderSchedule();
}

function renderCalendar() {
  $('#calendar-month').textContent = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const scheduled = new Map(state.games.map((game) => [game.date, state.grounds.find((ground) => ground.id === game.ground_id)]));
  const today = new Date(); const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  $('#calendar-days').innerHTML = Array.from({ length: firstWeekday }, () => '<span class="calendar-blank"></span>').concat(Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1; const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const ground = scheduled.get(key); const classes = ['calendar-day']; if (key < todayKey) classes.push('is-past'); if (ground) classes.push('is-scheduled'); if (key === selectedDate) classes.push('is-selected'); if (key === todayKey) classes.push('is-today');
    return `<button class="${classes.join(' ')}" type="button" data-calendar-date="${key}" aria-label="${formatDate(key)}${ground ? `, scheduled game at ${ground.name}` : ', schedule game'}"><span class="calendar-day-number">${day}</span>${ground ? `<span class="calendar-ground">${escapeHtml(ground.name)}</span>` : ''}</button>`;
  })).join('');
}

function renderSummary() {
  const entries = selectedDate ? Object.values(state.register[selectedDate] || {}) : [];
  const attended = entries.filter((item) => item.attended).length;
  const paid = entries.filter((item) => item.paid).length;
  const received = entries.reduce((total, item) => total + (Number(item.amount) || 0), 0);
  $('#game-summary').innerHTML = [['Registered', state.players.length], ['Attended', attended], ['Paid', paid], ['Collected', formatCurrency(received)]].map(([label, value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function renderRoster() {
  const roster = $('#roster');
  $('#roster-caption').textContent = selectedDate ? `${formatDate(selectedDate)} â€” mark attendance and payment.` : 'Select or create a game date to mark the register.';
  if (!state.players.length) { roster.innerHTML = $('#empty-state').innerHTML; return; }
  if (!selectedDate) { roster.innerHTML = '<div class="empty-state"><strong>Choose a game date first.</strong><span>Your registered player list is ready to use.</span></div>'; return; }
  roster.innerHTML = state.players.map((player) => {
    const record = state.register[selectedDate]?.[player.id] || {};
    const contact = [player.phone, player.email].filter(Boolean).join(' Â· ');
    return `<div class="roster-row"><div class="player-info"><div class="player-name">${escapeHtml(player.name)}</div>${contact ? `<div class="player-contact">${escapeHtml(contact)}</div>` : ''}</div><label class="check-label"><input data-player="${player.id}" data-field="attended" type="checkbox" ${record.attended ? 'checked' : ''}> Attended</label><label class="check-label payment"><input data-player="${player.id}" data-field="paid" type="checkbox" ${record.paid ? 'checked' : ''}> Paid</label><label class="amount-label"><span>$</span><input data-player="${player.id}" data-field="amount" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Dollar amount for ${escapeHtml(player.name)}" value="${Number(record.amount) ? Number(record.amount).toFixed(2) : ''}" placeholder="0.00"></label></div>`;
  }).join('');
}

function renderPlayers() {
  const list = $('#players-list');
  if (!state.players.length) { list.innerHTML = $('#empty-state').innerHTML; return; }
  list.innerHTML = state.players.map((player) => `<article class="player-card"><div><h3>${escapeHtml(player.name)}</h3><p>${escapeHtml([player.phone, player.email].filter(Boolean).join(' Â· ') || 'No contact details')}</p></div><button class="button button-danger" type="button" data-delete-player="${player.id}">Remove</button></article>`).join('');
}

function renderPlayerPaymentHistory() {
  const list = $('#players-list');
  if (!state.players.length) { list.innerHTML = $('#empty-state').innerHTML; return; }
  list.innerHTML = state.players.map((player) => {
    const history = state.games.map((game) => ({ date: game.date, ...(state.register[game.date]?.[player.id] || {}) })).filter((record) => record.attended || record.paid || Number(record.amount));
    const attended = history.filter((record) => record.attended).length;
    const paid = history.filter((record) => record.paid).length;
    const totalPaid = history.reduce((total, record) => total + (Number(record.amount) || 0), 0);
    const expanded = expandedPlayerSummaries.has(player.id);
    const contact = [player.phone, player.email].filter(Boolean).join(' / ') || 'No contact details';
    const historyRows = history.length ? [...history].sort((a, b) => b.date.localeCompare(a.date)).map((record) => `<li><span>${formatDate(record.date)}</span><span>${record.attended ? 'Attended' : 'Not marked attended'}</span><strong>${record.paid ? `Paid ${formatCurrency(record.amount)}` : 'Not paid'}</strong></li>`).join('') : '<li class="payment-empty">No attendance or payment records yet.</li>';
    return `<article class="player-card"><div class="player-card-main"><div><h3>${escapeHtml(player.name)}</h3><p>${escapeHtml(contact)}</p></div><div class="player-actions"><button class="text-button" type="button" data-toggle-player-summary="${player.id}" aria-expanded="${expanded}">${expanded ? 'Hide summary' : 'View summary'}</button><button class="button button-danger" type="button" data-delete-player="${player.id}">Remove</button></div></div><div class="player-payment-summary"><span>Games attended <strong>${attended}</strong></span><span>Paid dates <strong>${paid}</strong></span><span>Total paid <strong>${formatCurrency(totalPaid)}</strong></span></div>${expanded ? `<div class="player-history"><h4>Dates and payments</h4><ul>${historyRows}</ul></div>` : ''}</article>`;
  }).join('');
}

function renderPlayerPaymentHistory() {
  const list = $('#players-list');
  if (!state.players.length) { list.innerHTML = $('#empty-state').innerHTML; return; }
  list.innerHTML = state.players.map((player) => {
    const history = state.games.map((game) => ({ date: game.date, ...(state.register[game.date]?.[player.id] || {}) })).filter((record) => record.attended || record.paid || Number(record.amount));
    const attended = history.filter((record) => record.attended).length;
    const paid = history.filter((record) => record.paid).length;
    const totalPaid = history.reduce((total, record) => total + (Number(record.amount) || 0), 0);
    const contact = [player.phone, player.email].filter(Boolean).join(' / ') || 'No contact details';
    const rows = history.length ? [...history].sort((a, b) => b.date.localeCompare(a.date)).map((record) => `<li><span>${formatDate(record.date)}</span><span>${record.attended ? 'Attended' : 'Not marked attended'}</span><strong>${record.paid ? `Paid ${formatCurrency(record.amount)}` : 'Not paid'}</strong></li>`).join('') : '<li class="payment-empty">No attendance or payment records yet.</li>';
    return `<article class="player-card"><div class="player-card-main"><div><h3>${escapeHtml(player.name)}</h3><p>${escapeHtml(contact)}</p></div><button class="button button-danger" type="button" data-delete-player="${player.id}">Remove</button></div><div class="player-payment-summary"><span>Games attended <strong>${attended}</strong></span><span>Paid dates <strong>${paid}</strong></span><span>Total paid <strong>${formatCurrency(totalPaid)}</strong></span></div><details class="player-history"><summary>Dates and payments</summary><ul>${rows}</ul></details></article>`;
  }).join('');
}

function renderSchedule() {
  const list = $('#schedule-list');
  if (!state.games.length) { list.innerHTML = '<div class="empty-state"><strong>No game dates yet.</strong><span>Add a date to start tracking your team.</span></div>'; return; }
  list.innerHTML = [...state.games].sort((a, b) => a.date.localeCompare(b.date)).map((game) => {
    const records = Object.values(state.register[game.date] || {}); const collected = records.reduce((total, item) => total + (Number(item.amount) || 0), 0);
    return `<button class="schedule-card" type="button" data-select-game="${game.date}"><span class="date-badge">${new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short' }).format(new Date(`${game.date}T12:00:00`))}</span><div><h3>${formatDate(game.date)}</h3><p>${records.filter((r) => r.attended).length} attended Â· ${records.filter((r) => r.paid).length} paid Â· ${formatCurrency(collected)}</p></div><span>â€º</span></button>`;
  }).join('');
}

async function addGame() {
  const date = dateInput.value; if (!date) return dateInput.focus();
  const { error } = await db.from('games').upsert({ game_date: date, ground_id: groundInput.value || null });
  if (error) return alert(`Could not add game date: ${error.message}`);
  selectedDate = date; calendarMonth = new Date(`${date}T12:00:00`); calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1); await loadData();
}

function openGameDialog(date = selectedDate) {
  dateInput.value = date || '';
  $('#game-dialog').showModal();
  dateInput.focus();
}

async function removeGame() {
  if (!selectedDate || !confirm(`Delete the game date ${formatDate(selectedDate)}?`)) return;
  const { error } = await db.from('games').delete().eq('game_date', selectedDate);
  if (error) return alert(`Could not delete game date: ${error.message}`);
  selectedDate = ''; await loadData();
}

function openPlayerDialog() { $('#player-form').reset(); $('#player-dialog').showModal(); $('#player-name').focus(); }
function openGroundDialog() { $('#ground-form').reset(); $('#ground-dialog').showModal(); $('#ground-name').focus(); }
async function addGround() {
  const name = $('#ground-name').value.trim(); if (!name) return;
  const isHome = $('#ground-home').checked;
  if (isHome) await db.from('grounds').update({ is_home: false }).eq('is_home', true);
  const { data, error } = await db.from('grounds').upsert({ name, is_home: isHome }, { onConflict: 'name' }).select().single();
  if (error) return alert(`Could not save ground: ${error.message}`);
  $('#ground-dialog').close(); await loadData(); groundInput.value = data.id;
}
async function addPlayer() {
  const name = $('#player-name').value.trim(); if (!name) return;
  const { error } = await db.from('players').insert({ name, phone: $('#player-phone').value.trim(), email: $('#player-email').value.trim() });
  if (error) return alert(`Could not save player: ${error.message}`);
  $('#player-dialog').close(); await loadData();
}

document.querySelectorAll('[id^="add-player"]').forEach((button) => button.addEventListener('click', openPlayerDialog));
$('#add-ground').addEventListener('click', openGroundDialog);
$('#ground-form').addEventListener('submit', (event) => { event.preventDefault(); addGround(); });
['#add-game', '#add-game-schedule'].forEach((id) => $(id).addEventListener('click', () => openGameDialog()));
$('#game-form').addEventListener('submit', (event) => { event.preventDefault(); addGame(); $('#game-dialog').close(); });
$('#delete-game').addEventListener('click', removeGame);
dateInput.addEventListener('change', () => { selectedDate = dateInput.value; render(); });
$('#previous-month').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
$('#next-month').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
$('#calendar-days').addEventListener('click', (event) => { const day = event.target.closest('[data-calendar-date]'); if (!day) return; selectedDate = day.dataset.calendarDate; calendarMonth = new Date(`${selectedDate}T12:00:00`); if (!selectedGame()) openGameDialog(selectedDate); else render(); });
$('#player-form').addEventListener('submit', (event) => { event.preventDefault(); addPlayer(); });
$('#roster').addEventListener('change', async (event) => {
  const input = event.target; if (!input.matches('input[data-player]') || !selectedDate) return;
  const oldRecord = state.register[selectedDate]?.[input.dataset.player] || { attended: false, paid: false, amount: null };
  const value = input.type === 'checkbox' ? input.checked : (input.value === '' ? null : Number(input.value).toFixed(2));
  const record = { ...oldRecord, [input.dataset.field]: value };
  const { error } = await db.from('registrations').upsert({ game_date: selectedDate, player_id: input.dataset.player, ...record });
  if (error) return alert(`Could not save register: ${error.message}`);
  await loadData();
});
$('#players-list').addEventListener('click', (event) => {
  const summaryButton = event.target.closest('[data-toggle-player-summary]');
  if (!summaryButton) return;
  const id = summaryButton.dataset.togglePlayer;
  if (expandedPlayerSummaries.has(id)) expandedPlayerSummaries.delete(id); else expandedPlayerSummaries.add(id);
  renderPlayerPaymentHistory();
});
$('#players-list').addEventListener('click', async (event) => {
  const id = event.target.dataset.deletePlayer; if (!id || !confirm('Remove this player from the registered list? Historical game records will also be removed.')) return;
  const { error } = await db.from('players').delete().eq('id', id);
  if (error) return alert(`Could not remove player: ${error.message}`);
  await loadData();
});
$('#schedule-list').addEventListener('click', (event) => { const card = event.target.closest('[data-select-game]'); if (!card) return; selectedDate = card.dataset.selectGame; document.querySelector('[data-view="gameday"]').click(); render(); });
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.tab,.view').forEach((element) => element.classList.remove('is-active')); tab.classList.add('is-active'); $(`#${tab.dataset.view}`).classList.add('is-active'); }));
$('#export-data').addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'social-sports-backup.json'; link.click(); URL.revokeObjectURL(link.href); });

['players', 'games', 'grounds', 'registrations'].forEach((table) => db.channel(`shared-${table}`).on('postgres_changes', { event: '*', schema: 'public', table }, loadData).subscribe());
migrateLegacyData().then(loadData);

