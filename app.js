const db = window.supabase.createClient('https://fzdtkmixmodttroesjgn.supabase.co', 'sb_publishable_EjZt9V2__QZmOzLfYa-Czw_T_CRsDwR');
const state = { players: [], games: [], grounds: [], register: {} };
let selectedDate = '';
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const expandedPlayers = new Set();
const $ = (selector) => document.querySelector(selector);
const dateInput = $('#selected-date');
const groundInput = $('#selected-ground');
const escapeHtml = (value) => { const node = document.createElement('div'); node.textContent = value || ''; return node.innerHTML; };
const formatDate = (value) => new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const formatCurrency = (value) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(value) || 0);
const currentGame = () => state.games.find((game) => game.date === selectedDate);
const isAmount = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

async function loadData() {
  const [players, games, grounds, registrations] = await Promise.all([
    db.from('players').select('*').order('name'),
    db.from('games').select('*').order('game_date'),
    db.from('grounds').select('*').order('is_home', { ascending: false }).order('name'),
    db.from('registrations').select('*')
  ]);
  const error = players.error || games.error || grounds.error || registrations.error;
  if (error) { console.error(error); $('#roster-caption').textContent = 'Could not connect to the shared register. Refresh and try again.'; return; }
  state.players = players.data || [];
  state.grounds = grounds.data || [];
  state.games = (games.data || []).map((game) => ({ date: game.game_date, ground_id: game.ground_id }));
  state.register = {};
  (registrations.data || []).forEach((record) => {
    state.register[record.game_date] ||= {};
    state.register[record.game_date][record.player_id] = { registered: Boolean(record.registered), attended: Boolean(record.attended), paid: Boolean(record.paid), amount: record.amount };
  });
  render();
}

function render() {
  $('#player-count').textContent = state.players.length;
  const selectedGround = groundInput.value;
  groundInput.innerHTML = state.grounds.map((ground) => `<option value="${ground.id}">${escapeHtml(ground.name)}${ground.is_home ? ' (Home Ground)' : ''}</option>`).join('');
  groundInput.value = state.grounds.some((ground) => ground.id === selectedGround) ? selectedGround : (state.grounds.find((ground) => ground.is_home)?.id || state.grounds[0]?.id || '');
  dateInput.value = selectedDate;
  const game = currentGame();
  const ground = state.grounds.find((item) => item.id === game?.ground_id);
  $('#selected-date-label').textContent = selectedDate ? formatDate(selectedDate) : 'Choose a day on the calendar';
  $('#game-status').textContent = game ? `${formatDate(game.date)} — ${ground?.name || 'Ground not set'}` : 'Choose a date';
  $('#delete-game').disabled = !game;
  renderCalendar(); renderSummary(); renderRoster(); renderPlayers();
}

function renderCalendar() {
  const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth();
  $('#calendar-month').textContent = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const today = new Date(); const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const scheduled = new Map(state.games.map((game) => [game.date, state.grounds.find((ground) => ground.id === game.ground_id)]));
  $('#calendar-days').innerHTML = Array.from({ length: firstWeekday }, () => '<span class="calendar-blank"></span>').concat(Array.from({ length: days }, (_, index) => {
    const day = index + 1; const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const ground = scheduled.get(date);
    const classes = ['calendar-day', date < todayKey ? 'is-past' : '', ground ? 'is-scheduled' : '', date === selectedDate ? 'is-selected' : '', date === todayKey ? 'is-today' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-calendar-date="${date}" aria-label="${formatDate(date)}${ground ? `, scheduled at ${ground.name}` : ''}"><span class="calendar-day-number">${day}</span>${ground ? `<span class="calendar-ground">${escapeHtml(ground.name)}</span>` : ''}</button>`;
  })).join('');
}

function renderSummary() {
  const records = selectedDate ? Object.values(state.register[selectedDate] || {}) : [];
  const metrics = [['Available', records.filter((record) => record.registered).length], ['Attended', records.filter((record) => record.attended).length], ['Paid', records.filter((record) => record.paid).length], ['Collected', formatCurrency(records.reduce((total, record) => total + (Number(record.amount) || 0), 0))]];
  $('#game-summary').innerHTML = metrics.map(([label, value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function renderRoster() {
  const roster = $('#roster');
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const isHistorical = Boolean(selectedDate && selectedDate < todayKey);
  $('#roster-caption').textContent = selectedDate
    ? (isHistorical
      ? `${formatDate(selectedDate)} — showing players with recorded activity only.`
      : `${formatDate(selectedDate)} — record availability, attendance and payment.`)
    : 'Select or create a game date to mark the register.';
  if (!state.players.length) { roster.innerHTML = $('#empty-state').innerHTML; return; }
  if (!selectedDate) { roster.innerHTML = '<div class="empty-state"><strong>Choose a game date first.</strong><span>Your player list is ready to use.</span></div>'; return; }
  const playersToShow = isHistorical
    ? state.players.filter((player) => {
      const record = state.register[selectedDate]?.[player.id] || {};
      return record.registered || record.attended || record.paid || isAmount(record.amount);
    })
    : state.players;
  if (!playersToShow.length) {
    roster.innerHTML = '<div class="empty-state"><strong>No player activity recorded for this date.</strong><span>Historical registers only show players with availability, attendance, payment, or an entered amount.</span></div>';
    return;
  }
  roster.innerHTML = playersToShow.map((player) => {
    const record = state.register[selectedDate]?.[player.id] || {};
    const contact = [player.phone, player.email].filter(Boolean).join(' · ');
    const amount = isAmount(record.amount) ? Number(record.amount).toFixed(2) : '';
    return `<div class="roster-row"><div class="player-info"><div class="player-name">${escapeHtml(player.name)}</div>${contact ? `<div class="player-contact">${escapeHtml(contact)}</div>` : ''}</div><label class="check-label registered"><input type="checkbox" data-player="${player.id}" data-field="registered" ${record.registered ? 'checked' : ''}> Available</label><label class="check-label"><input type="checkbox" data-player="${player.id}" data-field="attended" ${record.attended ? 'checked' : ''}> Attended</label><label class="check-label payment"><input type="checkbox" data-player="${player.id}" data-field="paid" ${record.paid ? 'checked' : ''}> Paid</label><label class="amount-label"><span>$</span><input type="number" min="0" step="0.01" inputmode="decimal" data-player="${player.id}" data-field="amount" value="${amount}" placeholder="0.00" aria-label="Amount for ${escapeHtml(player.name)}"></label></div>`;
  }).join('');
}

function renderPlayers() {
  const list = $('#players-list');
  if (!state.players.length) { list.innerHTML = $('#empty-state').innerHTML; return; }
  list.innerHTML = state.players.map((player) => {
    const history = state.games.map((game) => ({ date: game.date, ...(state.register[game.date]?.[player.id] || {}) })).filter((record) => record.registered || record.attended || record.paid || isAmount(record.amount));
    const totals = { registered: history.filter((record) => record.registered).length, attended: history.filter((record) => record.attended).length, paid: history.filter((record) => record.paid).length, amount: history.reduce((total, record) => total + (Number(record.amount) || 0), 0) };
    const isInArrears = history.some((record) => record.attended && !record.paid);
    const expanded = expandedPlayers.has(player.id); const contact = [player.phone, player.email].filter(Boolean).join(' · ') || 'No contact details';
    const rows = history.length ? `<li class="history-labels"><span>Date</span><span>Availability</span><span>Attendance</span><span>Payment</span></li>${history.sort((a, b) => b.date.localeCompare(a.date)).map((record) => `<li><span class="history-date">${formatDate(record.date)}</span><span class="history-status"><b class="${record.registered ? 'is-yes' : ''}">${record.registered ? 'Available' : 'Not available'}</b></span><span class="history-status"><b class="${record.attended ? 'is-yes' : ''}">${record.attended ? 'Attended' : 'Not attended'}</b></span><strong>${record.paid ? `Paid ${formatCurrency(record.amount)}` : 'Not paid'}</strong></li>`).join('')}` : '<li class="payment-empty">No availability, attendance or payment records yet.</li>';
    return `<article class="player-card"><div class="player-card-main"><div><h3>${escapeHtml(player.name)}</h3><p>${escapeHtml(contact)}</p></div><div class="player-actions"><button class="text-button" type="button" data-toggle-player="${player.id}" aria-expanded="${expanded}">${expanded ? 'Hide summary' : 'View summary'}</button><button class="button button-danger" type="button" data-delete-player="${player.id}">Remove</button></div></div><div class="player-payment-summary"><span>Available <strong>${totals.registered}</strong></span><span>Games attended <strong>${totals.attended}</strong></span><span>Paid dates <strong>${totals.paid}</strong></span><span class="${isInArrears ? 'is-in-arrears' : ''}"${isInArrears ? ' title="Attended game(s) awaiting payment"' : ''}>Total paid <strong>${formatCurrency(totals.amount)}</strong></span></div>${expanded ? `<div class="player-history"><h4>Dates and payments</h4><ul>${rows}</ul></div>` : ''}</article>`;
  }).join('');
}

function openGameDialog(date = selectedDate) { dateInput.value = date || ''; $('#game-dialog').showModal(); dateInput.focus(); }
function openPlayerDialog() { $('#player-form').reset(); $('#player-dialog').showModal(); $('#player-name').focus(); }
function openGroundDialog() { $('#ground-form').reset(); $('#ground-dialog').showModal(); $('#ground-name').focus(); }
async function addGame() { const date = dateInput.value; if (!date) return dateInput.focus(); const { error } = await db.from('games').upsert({ game_date: date, ground_id: groundInput.value || null }); if (error) return alert(`Could not save game: ${error.message}`); selectedDate = date; calendarMonth = new Date(`${date}T12:00:00`); calendarMonth.setDate(1); $('#game-dialog').close(); await loadData(); }
async function addPlayer() { const name = $('#player-name').value.trim(); if (!name) return; const { error } = await db.from('players').insert({ name, phone: $('#player-phone').value.trim(), email: $('#player-email').value.trim() }); if (error) return alert(`Could not save player: ${error.message}`); $('#player-dialog').close(); await loadData(); }
async function addGround() { const name = $('#ground-name').value.trim(); if (!name) return; if ($('#ground-home').checked) await db.from('grounds').update({ is_home: false }).eq('is_home', true); const { data, error } = await db.from('grounds').upsert({ name, is_home: $('#ground-home').checked }, { onConflict: 'name' }).select().single(); if (error) return alert(`Could not save ground: ${error.message}`); $('#ground-dialog').close(); await loadData(); groundInput.value = data.id; }
async function saveRoster(input) { if (!selectedDate) return; const old = state.register[selectedDate]?.[input.dataset.player] || { registered: false, attended: false, paid: false, amount: null }; const isPaid = input.dataset.field === 'paid' && input.checked; if (input.dataset.field === 'amount' && input.value === '' && old.paid) { alert('A paid player must have a dollar amount.'); input.value = Number(old.amount || 10).toFixed(2); return; } const value = input.type === 'checkbox' ? input.checked : (input.value === '' ? null : Number(input.value).toFixed(2)); const update = { ...old, [input.dataset.field]: value }; if (isPaid && !isAmount(old.amount)) update.amount = '10.00'; const { error } = await db.from('registrations').upsert({ game_date: selectedDate, player_id: input.dataset.player, ...update }); if (error) return alert(`Could not save register: ${error.message}`); await loadData(); }

document.querySelectorAll('[id^="add-player"]').forEach((button) => button.addEventListener('click', openPlayerDialog));
$('#add-ground').addEventListener('click', openGroundDialog); $('#ground-form').addEventListener('submit', (event) => { event.preventDefault(); addGround(); }); $('#player-form').addEventListener('submit', (event) => { event.preventDefault(); addPlayer(); }); $('#game-form').addEventListener('submit', (event) => { event.preventDefault(); addGame(); });
$('#add-game').addEventListener('click', () => openGameDialog());
$('#delete-game').addEventListener('click', async () => { if (!selectedDate || !confirm(`Delete ${formatDate(selectedDate)}?`)) return; const { error } = await db.from('games').delete().eq('game_date', selectedDate); if (error) return alert(`Could not delete game: ${error.message}`); selectedDate = ''; await loadData(); });
$('#previous-month').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); }); $('#next-month').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
$('#calendar-days').addEventListener('click', (event) => { const button = event.target.closest('[data-calendar-date]'); if (!button) return; selectedDate = button.dataset.calendarDate; calendarMonth = new Date(`${selectedDate}T12:00:00`); calendarMonth.setDate(1); currentGame() ? render() : openGameDialog(selectedDate); });
$('#roster').addEventListener('change', (event) => { if (event.target.matches('input[data-player]')) saveRoster(event.target); });
$('#players-list').addEventListener('click', async (event) => { const summary = event.target.closest('[data-toggle-player]'); if (summary) { const id = summary.dataset.togglePlayer; expandedPlayers.has(id) ? expandedPlayers.delete(id) : expandedPlayers.add(id); renderPlayers(); return; } const id = event.target.dataset.deletePlayer; if (!id || !confirm('Remove this player and their historical records?')) return; const { error } = await db.from('players').delete().eq('id', id); if (error) return alert(`Could not remove player: ${error.message}`); await loadData(); });
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.tab,.view').forEach((element) => element.classList.remove('is-active')); tab.classList.add('is-active'); $(`#${tab.dataset.view}`).classList.add('is-active'); }));
$('#export-data').addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'social-sports-backup.json'; link.click(); URL.revokeObjectURL(link.href); });
['players', 'games', 'grounds', 'registrations'].forEach((table) => db.channel(`shared-${table}`).on('postgres_changes', { event: '*', schema: 'public', table }, loadData).subscribe());
loadData();
