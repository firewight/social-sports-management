Exit code: 0
Wall time: 0.2 seconds
Output:
const supabase = window.supabase.createClient(
  'https://fzdtkmixmodttroesjgn.supabase.co',
  'sb_publishable_EjZt9V2__QZmOzLfYa-Czw_T_CRsDwR'
);

const state = { players: [], games: [], register: {} };
let selectedDate = '';
let calendarMonth = new Date();
calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);

const $ = (selector) => document.querySelector(selector);
const dateInput = $('#selected-date');
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
      const { error } = await supabase.from('players').upsert(players);
      if (error) throw error;
    }
    if (games.length) {
      const { error } = await supabase.from('games').upsert(games);
      if (error) throw error;
    }
    const registrations = Object.entries(saved.register || {}).flatMap(([game_date, entries]) => Object.entries(entries).map(([player_id, record]) => ({
      game_date, player_id, attended: Boolean(record.attended), paid: Boolean(record.paid), amount: record.amount === '' || record.amount == null ? null : Number(record.amount)
    })));
    if (registrations.length) {
      const { error } = await supabase.from('registrations').upsert(registrations);
      if (error) throw error;
    }
    localStorage.setItem('social-sports-management-supabase-migrated', 'true');
  } catch (error) {
    console.error('Legacy data migration failed', error);
  }
}

async function loadData() {
  const [players, games, registrations] = await Promise.all([
    supabase.from('players').select('*').order('name'),
    supabase.from('games').select('*').order('game_date'),
    supabase.from('registrations').select('*')
  ]);
  if (players.error || games.error || registrations.error) {
    console.error(players.error || games.error || registrations.error);
    $('#roster-caption').textContent = 'Could not connect to the shared register. Refresh and try again.';
    return;
  }
  state.players = players.data;
  state.games = games.data.map((game) => ({ date: game.game_date }));
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
  dateInput.value = selectedDate;
  const game = selectedGame();
  $('#game-status').textContent = game ? formatDate(game.date) : 'Choose a date';
  $('#delete-game').disabled = !game;
  renderCalendar(); renderSummary(); renderRoster(); renderPlayers(); renderSchedule();
}

function renderCalendar() {
  $('#calendar-month').textContent = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const scheduled = new Set(state.games.map((game) => game.date));
  const today = new Date(); const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  $('#calendar-days').innerHTML = Array.from({ length: firstWeekday }, () => '<span class="calendar-blank"></span>').concat(Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1; const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const classes = ['calendar-day']; if (scheduled.has(key)) classes.push('is-scheduled'); if (key === selectedDate) classes.push('is-selected'); if (key === todayKey) classes.push('is-today');
    return `<button class="${classes.join(' ')}" type="button" data-calendar-date="${key}" aria-label="${formatDate(key)}${scheduled.has(key) ? ', scheduled game' : ''}">${day}</button>`;
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
  const { error } = await supabase.from('games').upsert({ game_date: date });
  if (error) return alert(`Could not add game date: ${error.message}`);
  selectedDate = date; calendarMonth = new Date(`${date}T12:00:00`); calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1); await loadData();
}

async function removeGame() {
  if (!selectedDate || !confirm(`Delete the game date ${formatDate(selectedDate)}?`)) return;
  const { error } = await supabase.from('games').delete().eq('game_date', selectedDate);
  if (error) return alert(`Could not delete game date: ${error.message}`);
  selectedDate = ''; await loadData();
}

function openPlayerDialog() { $('#player-form').reset(); $('#player-dialog').showModal(); $('#player-name').focus(); }
async function addPlayer() {
  const name = $('#player-name').value.trim(); if (!name) return;
  const { error } = await supabase.from('players').insert({ name, phone: $('#player-phone').value.trim(), email: $('#player-email').value.trim() });
  if (error) return alert(`Could not save player: ${error.message}`);
  $('#player-dialog').close(); await loadData();
}

document.querySelectorAll('[id^="add-player"]').forEach((button) => button.addEventListener('click', openPlayerDialog));
['#add-game', '#add-game-schedule'].forEach((id) => $(id).addEventListener('click', addGame));
$('#delete-game').addEventListener('click', removeGame);
dateInput.addEventListener('change', () => { selectedDate = dateInput.value; render(); });
$('#previous-month').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
$('#next-month').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
$('#calendar-days').addEventListener('click', (event) => { const day = event.target.closest('[data-calendar-date]'); if (!day) return; selectedDate = day.dataset.calendarDate; calendarMonth = new Date(`${selectedDate}T12:00:00`); render(); });
$('#player-form').addEventListener('submit', (event) => { event.preventDefault(); addPlayer(); });
$('#roster').addEventListener('change', async (event) => {
  const input = event.target; if (!input.matches('input[data-player]') || !selectedDate) return;
  const oldRecord = state.register[selectedDate]?.[input.dataset.player] || { attended: false, paid: false, amount: null };
  const value = input.type === 'checkbox' ? input.checked : (input.value === '' ? null : Number(input.value).toFixed(2));
  const record = { ...oldRecord, [input.dataset.field]: value };
  const { error } = await supabase.from('registrations').upsert({ game_date: selectedDate, player_id: input.dataset.player, ...record });
  if (error) return alert(`Could not save register: ${error.message}`);
  await loadData();
});
$('#players-list').addEventListener('click', async (event) => {
  const id = event.target.dataset.deletePlayer; if (!id || !confirm('Remove this player from the registered list? Historical game records will also be removed.')) return;
  const { error } = await supabase.from('players').delete().eq('id', id);
  if (error) return alert(`Could not remove player: ${error.message}`);
  await loadData();
});
$('#schedule-list').addEventListener('click', (event) => { const card = event.target.closest('[data-select-game]'); if (!card) return; selectedDate = card.dataset.selectGame; document.querySelector('[data-view="gameday"]').click(); render(); });
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.tab,.view').forEach((element) => element.classList.remove('is-active')); tab.classList.add('is-active'); $(`#${tab.dataset.view}`).classList.add('is-active'); }));
$('#export-data').addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'social-sports-backup.json'; link.click(); URL.revokeObjectURL(link.href); });

['players', 'games', 'registrations'].forEach((table) => supabase.channel(`shared-${table}`).on('postgres_changes', { event: '*', schema: 'public', table }, loadData).subscribe());
migrateLegacyData().then(loadData);

