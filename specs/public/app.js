import { firebaseConfig, choirName } from './config.js';

const VOICES = [
  { k: 'S', short: 'S', long: 'Soprane' },
  { k: 'A', short: 'A', long: 'Alto' },
  { k: 'H', short: 'H', long: 'Hommes' },
  { k: 'T', short: 'Tous', long: 'Tous' },
];
const VNAME = Object.fromEntries(VOICES.map((v) => [v.k, v.long]));
const KEY_STORE = 'chorale-cle';
const WEEK = 7 * 86400000;

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

let api;
let songs = [];
let inbox = [];
const drafts = new Map(); // hash -> { voice, songId, newTitle, query, open }
let lastPick = null;      // dernier morceau choisi, pour pré-remplir les suivants
let tab = 'songs';

/* ---------- utilitaires ---------- */
function store(k, v) { try { localStorage.setItem(k, v); } catch {} }
function read(k) { try { return localStorage.getItem(k); } catch { return null; } }

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

function ago(ms) {
  const d = Date.now() - ms, m = Math.round(d / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return 'le ' + new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
const dateShort = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function guessType(file) {
  if (file.type && file.type !== 'application/octet-stream') return file.type.split(';')[0];
  const ext = (file.name || '').split('.').pop().toLowerCase();
  return { opus: 'audio/ogg', ogg: 'audio/ogg', m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', wav: 'audio/wav' }[ext] || 'audio/ogg';
}
async function sha256(file) {
  const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- feuille modale ---------- */
function sheet(html, bind) {
  const wrap = $('#sheet-wrap'), s = $('#sheet');
  s.innerHTML = html; wrap.hidden = false;
  const close = () => { wrap.hidden = true; s.innerHTML = ''; };
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  bind?.(s, close);
  return close;
}
function confirmSheet(title, text, okLabel, danger = false) {
  return new Promise((resolve) => {
    sheet(`<h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="row"><button class="secondary" data-no>Annuler</button>
      <button class="${danger ? 'danger-btn' : 'primary'}" data-ok>${esc(okLabel)}</button></div>`,
    (s, close) => {
      $('[data-no]', s).onclick = () => { close(); resolve(false); };
      $('[data-ok]', s).onclick = () => { close(); resolve(true); };
    });
  });
}

/* ---------- onglets ---------- */
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('#view-songs').hidden = t !== 'songs';
  $('#view-inbox').hidden = t !== 'inbox';
  window.scrollTo(0, 0);
}

/* ---------- vue Morceaux ---------- */
function sortedSongs() {
  return [...songs].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.title.localeCompare(b.title, 'fr'));
}

function renderSongs() {
  const q = norm($('#search').value);
  $('#search').hidden = songs.length < 7;
  const list = sortedSongs().filter((s) => !q || norm(s.title).includes(q));
  const ul = $('#songs');
  if (!songs.length) {
    ul.innerHTML = `<li class="empty"><strong>Aucun morceau pour l'instant</strong>
      Déposez les enregistrements reçus sur WhatsApp, puis classez-les dans « À classer ».</li>`;
    return;
  }
  if (!list.length) { ul.innerHTML = `<li class="empty">Aucun morceau ne correspond.</li>`; return; }
  ul.innerHTML = list.map((s) => {
    const fresh = s.updatedAt && Date.now() - s.updatedAt < WEEK;
    const btns = VOICES.map((v) => {
      const x = s.voices?.[v.k];
      const playing = cur && cur.songId === s.id && cur.voice === v.k;
      return `<button class="vbtn${playing ? ' playing' : ''}" data-v="${v.k}" data-song="${esc(s.id)}" ${x ? '' : 'disabled'}
        aria-label="${esc(v.long)}${x ? '' : ' (pas encore reçu)'}">${esc(v.short)}<small>${x ? dateShort(x.at) : '—'}</small></button>`;
    }).join('');
    return `<li class="song">
      <div class="song-head">
        <div class="song-title">${esc(s.title)}${fresh ? '<span class="new">Nouveau</span>' : ''}
          <div class="song-sub">${s.updatedAt ? 'Mis à jour ' + ago(s.updatedAt) : ''}</div></div>
        <button class="icon-btn dots" data-menu="${esc(s.id)}" aria-label="Options du morceau">
          <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
      </div>
      <div class="voices">${btns}</div>
    </li>`;
  }).join('');
}

$('#songs').addEventListener('click', (e) => {
  const b = e.target.closest('.vbtn');
  if (b && !b.disabled) {
    const s = songs.find((x) => x.id === b.dataset.song);
    const v = s?.voices?.[b.dataset.v];
    if (v) play({ hash: v.hash, songId: s.id, voice: b.dataset.v, title: s.title });
    return;
  }
  const m = e.target.closest('[data-menu]');
  if (m) songMenu(songs.find((x) => x.id === m.dataset.menu));
});

function songMenu(s) {
  if (!s) return;
  const empty = !Object.keys(s.voices || {}).length;
  sheet(`<h3>${esc(s.title)}</h3><div class="menu">
      <button data-a="rename">Renommer</button>
      ${empty ? '<button data-a="del" class="danger">Supprimer le morceau</button>' : ''}
      <button data-a="close">Fermer</button></div>
      ${empty ? '' : '<p style="margin-top:12px;font-size:13px">Pour corriger une voix, lancez-la puis touchez « Mal classé ? ».</p>'}`,
  (el, close) => {
    el.onclick = async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      close();
      if (a === 'rename') renameSheet(s);
      if (a === 'del' && await confirmSheet('Supprimer ce morceau ?', s.title, 'Supprimer', true)) {
        await api.deleteSong(s.id); toast('Morceau supprimé');
      }
    };
  });
}
function renameSheet(s) {
  sheet(`<h3>Renommer</h3><input value="${esc(s.title)}" maxlength="120">
    <div class="row"><button class="secondary" data-no>Annuler</button><button class="primary" data-ok>Enregistrer</button></div>`,
  (el, close) => {
    const i = $('input', el); i.focus(); i.select();
    $('[data-no]', el).onclick = close;
    $('[data-ok]', el).onclick = async () => {
      if (!i.value.trim()) return;
      close(); await api.renameSong(s.id, i.value); toast('Morceau renommé');
    };
  });
}
$('#search').addEventListener('input', renderSongs);

/* ---------- vue À classer ---------- */
function draftFor(hash) {
  if (!drafts.has(hash)) drafts.set(hash, { voice: null, songId: lastPick?.songId || null, newTitle: lastPick?.newTitle || null, query: '', open: false });
  return drafts.get(hash);
}
function songTitle(d) {
  if (d.songId) return songs.find((s) => s.id === d.songId)?.title;
  return d.newTitle;
}

function renderInbox() {
  const badge = $('#badge');
  badge.hidden = !inbox.length; badge.textContent = inbox.length;
  const ul = $('#inbox');
  const items = [...inbox].sort((a, b) => a.createdAt - b.createdAt);
  if (!items.length) {
    ul.innerHTML = `<li class="empty"><strong>Tout est classé</strong>Les nouveaux enregistrements déposés apparaîtront ici.</li>`;
    return;
  }
  const keep = new Set(items.map((i) => i.hash));
  [...ul.children].forEach((li) => { if (!keep.has(li.dataset.hash)) li.remove(); });
  ul.querySelector('.empty')?.remove();
  items.forEach((it, idx) => {
    let li = ul.querySelector(`li[data-hash="${it.hash}"]`);
    if (!li) { li = document.createElement('li'); li.className = 'item'; li.dataset.hash = it.hash; renderItem(li, it); }
    if (ul.children[idx] !== li) ul.insertBefore(li, ul.children[idx] || null);
  });
}

function renderItem(li, it) {
  const d = draftFor(it.hash);
  const title = songTitle(d);
  const playing = cur && cur.hash === it.hash && !audio.paused;
  const target = d.songId && songs.find((s) => s.id === d.songId);
  const replaces = target && d.voice && target.voices?.[d.voice];
  li.innerHTML = `
    <div class="item-head">
      <button class="play-circle" data-play aria-label="Écouter">${playing ? ICON_PAUSE : ICON_PLAY}</button>
      <div class="item-meta"><b>Enregistrement reçu</b><span>${ago(it.createdAt)}</span></div>
    </div>
    <div class="label">Voix annoncée par le prof</div>
    <div class="pills">${VOICES.map((v) => `<button class="pill" data-v="${v.k}" aria-pressed="${d.voice === v.k}">${esc(v.long)}</button>`).join('')}</div>
    <div class="label">Morceau</div>
    <div class="picker">${title
      ? `<div class="chosen"><span>${esc(title)}${d.newTitle ? ' (nouveau)' : ''}</span><button data-clear aria-label="Changer de morceau">×</button></div>`
      : `<input type="text" data-q placeholder="Tapez le titre…" value="${esc(d.query)}" autocomplete="off"><div class="sugg-wrap"></div>`}
    </div>
    ${replaces ? `<div class="hint">Remplacera l'enregistrement ${esc(VNAME[d.voice])} du ${dateShort(replaces.at)}</div>` : ''}
    <div class="item-actions">
      <button class="primary" data-ok ${d.voice && title ? '' : 'disabled'}>Classer</button>
      <button class="link-btn danger" data-del>Supprimer</button>
    </div>`;
  if (!title && d.open) renderSugg(li, d);
}

function renderSugg(li, d) {
  const w = $('.sugg-wrap', li);
  if (!w) return;
  const q = norm(d.query);
  const list = sortedSongs().filter((s) => !q || norm(s.title).includes(q)).slice(0, 8);
  const exact = songs.some((s) => norm(s.title) === q);
  const html = list.map((s) => `<button data-pick="${esc(s.id)}">${esc(s.title)}</button>`).join('')
    + (q && !exact ? `<button class="create" data-create>+ Nouveau morceau « ${esc(d.query.trim())} »</button>` : '');
  w.innerHTML = html ? `<div class="sugg">${html}</div>` : '';
}

const itemOf = (el) => {
  const li = el.closest('li.item');
  return li ? { li, it: inbox.find((i) => i.hash === li.dataset.hash) } : {};
};

$('#inbox').addEventListener('click', async (e) => {
  const { li, it } = itemOf(e.target);
  if (!it) return;
  const d = draftFor(it.hash);
  const t = e.target;
  if (t.closest('[data-play]')) {
    if (cur && cur.hash === it.hash) togglePlay();
    else play({ hash: it.hash, title: 'À classer', voice: null, sub: 'reçu ' + ago(it.createdAt) });
    return;
  }
  const pill = t.closest('.pill');
  if (pill) { d.voice = pill.dataset.v; renderItem(li, it); return; }
  if (t.closest('[data-clear]')) { d.songId = null; d.newTitle = null; d.open = true; renderItem(li, it); $('[data-q]', li)?.focus(); return; }
  const pick = t.closest('[data-pick]');
  if (pick) { d.songId = pick.dataset.pick; d.newTitle = null; d.open = false; renderItem(li, it); return; }
  if (t.closest('[data-create]')) { d.newTitle = d.query.trim(); d.songId = null; d.open = false; renderItem(li, it); return; }
  if (t.closest('[data-del]')) {
    if (await confirmSheet('Supprimer cet audio ?', "À utiliser si ce n'est pas un enregistrement de répétition.", 'Supprimer', true)) {
      await api.removeInbox(it.hash); drafts.delete(it.hash); toast('Audio supprimé');
    }
    return;
  }
  if (t.closest('[data-ok]')) {
    const btn = t.closest('[data-ok]'); btn.disabled = true; btn.textContent = 'Classement…';
    const res = await api.classify({ hash: it.hash, voice: d.voice, songId: d.songId, newTitle: d.newTitle });
    if (!res.ok) {
      toast(res.reason === 'already' ? "Déjà classé par quelqu'un d'autre" : 'Oups, réessayez');
      if (res.reason !== 'already') renderItem(li, it);
      return;
    }
    const title = songTitle(d);
    toast(`Classé : ${title} · ${VNAME[d.voice]}`);
    // Les autres audios sans morceau choisi prennent ce morceau par défaut
    const pickNew = d.newTitle ? { newTitle: d.newTitle } : { songId: d.songId };
    lastPick = pickNew;
    if (cur?.hash === it.hash) stop();
    drafts.delete(it.hash);
    setTimeout(() => {
      // un nouveau morceau a maintenant un id : on le retrouve par son titre
      if (pickNew.newTitle) {
        const s = songs.find((x) => norm(x.title) === norm(pickNew.newTitle));
        if (s) lastPick = { songId: s.id };
      }
      for (const [h, x] of drafts) {
        if (x.newTitle && lastPick.songId && norm(x.newTitle) === norm(pickNew.newTitle || '')) { x.newTitle = null; x.songId = lastPick.songId; }
        if (!x.songId && !x.newTitle) Object.assign(x, lastPick, { open: false });
      }
      document.querySelectorAll('#inbox li.item').forEach((l) => {
        const i = inbox.find((z) => z.hash === l.dataset.hash);
        if (i) renderItem(l, i);
      });
    }, 400);
  }
});

$('#inbox').addEventListener('input', (e) => {
  if (!e.target.matches('[data-q]')) return;
  const { li, it } = itemOf(e.target);
  if (!it) return;
  const d = draftFor(it.hash);
  d.query = e.target.value; d.open = true;
  renderSugg(li, d);
});
$('#inbox').addEventListener('focusin', (e) => {
  if (!e.target.matches('[data-q]')) return;
  const { li, it } = itemOf(e.target);
  if (!it) return;
  const d = draftFor(it.hash); d.open = true; renderSugg(li, d);
});
$('#inbox').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.matches('[data-q]')) return;
  const { li } = itemOf(e.target);
  ($('[data-pick]', li) || $('[data-create]', li))?.click();
});

/* ---------- dépôt ---------- */
async function uploadFiles(fileList) {
  const files = [...fileList].filter((f) => f.size > 0);
  if (!files.length) return;
  let added = 0, dup = 0, failed = 0;
  for (let i = 0; i < files.length; i++) {
    toast(`Envoi ${i + 1}/${files.length}…`, 60000);
    try {
      const f = files[i];
      const hash = await sha256(f);
      if (await api.exists(hash)) { dup++; continue; }
      await api.upload(f, hash, guessType(f));
      added++;
    } catch (e) { console.warn(e); failed++; }
  }
  const parts = [];
  if (added) parts.push(`${added} audio${added > 1 ? 's' : ''} à classer`);
  if (dup) parts.push(`${dup} déjà reçu${dup > 1 ? 's' : ''}`);
  if (failed) parts.push(`${failed} en échec`);
  toast(parts.join(' · ') || 'Rien à envoyer', 3500);
  if (added) setTab('inbox');
}
$('#file').addEventListener('change', async (e) => { await uploadFiles(e.target.files); e.target.value = ''; });

async function takeShared() {
  if (!('caches' in window)) return;
  const c = await caches.open('shared');
  const keys = await c.keys();
  if (!keys.length) return;
  const files = [];
  for (const k of keys) {
    const r = await c.match(k);
    const b = await r.blob();
    files.push(new File([b], decodeURIComponent(r.headers.get('x-name') || 'audio'), { type: b.type }));
    await c.delete(k);
  }
  await uploadFiles(files);
}

/* ---------- lecteur ---------- */
const audio = $('#audio');
let cur = null;
const SPEEDS = [1, 0.85, 0.7];
let speedIdx = 0;

async function play(item) {
  cur = item;
  document.body.classList.add('has-player');
  $('#player').hidden = false;
  $('#p-title').textContent = item.title;
  $('#p-voice').textContent = item.voice ? VNAME[item.voice] : item.sub || '';
  $('#p-wrong').hidden = !item.songId;
  $('#p-seek').value = 0; $('#p-time').textContent = '0:00';
  try {
    audio.src = await api.url(item.hash);
    audio.playbackRate = SPEEDS[speedIdx];
    await audio.play();
  } catch (e) {
    console.warn(e);
    toast("Lecture impossible sur ce téléphone");
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.voice ? VNAME[item.voice] : choirName, album: choirName });
  }
  refreshPlaying();
}
function togglePlay() { audio.paused ? audio.play() : audio.pause(); }
function stop() {
  audio.pause(); audio.removeAttribute('src'); audio.load();
  cur = null; $('#player').hidden = true; document.body.classList.remove('has-player');
  refreshPlaying();
}
function refreshPlaying() {
  $('#p-play').innerHTML = audio.paused ? ICON_PLAY : ICON_PAUSE;
  $('#p-play').setAttribute('aria-label', audio.paused ? 'Lecture' : 'Pause');
  document.querySelectorAll('.vbtn').forEach((b) => b.classList.toggle('playing', !!cur && cur.songId === b.dataset.song && cur.voice === b.dataset.v));
  document.querySelectorAll('#inbox li.item [data-play]').forEach((b) => {
    const on = cur && cur.hash === b.closest('li').dataset.hash && !audio.paused;
    b.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
  });
}
audio.addEventListener('play', refreshPlaying);
audio.addEventListener('pause', refreshPlaying);
audio.addEventListener('ended', refreshPlaying);
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  $('#p-seek').value = Math.round((audio.currentTime / audio.duration) * 1000);
  $('#p-time').textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
});
$('#p-seek').addEventListener('input', (e) => { if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration; });
$('#p-play').onclick = togglePlay;
$('#p-close').onclick = stop;
$('#p-back').onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 10); };
$('#p-speed').onclick = () => {
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  audio.playbackRate = SPEEDS[speedIdx];
  $('#p-speed').textContent = `Vitesse ${String(SPEEDS[speedIdx]).replace('.', ',')}×`;
};
$('#p-loop').onclick = () => {
  audio.loop = !audio.loop;
  $('#p-loop').setAttribute('aria-pressed', String(audio.loop));
};
$('#p-wrong').onclick = async () => {
  if (!cur?.songId) return;
  const c = cur;
  const ok = await confirmSheet('Mal classé ?', `« ${c.title} · ${VNAME[c.voice]} » retournera dans « À classer » pour être reclassé.`, 'Remettre à classer');
  if (!ok) return;
  stop();
  await api.unclassify(c.songId, c.voice);
  toast('Remis dans « À classer »');
};

/* ---------- démarrage ---------- */
function keyFromText(txt) {
  txt = (txt || '').trim();
  try { const u = new URL(txt); return u.searchParams.get('cle') || ''; } catch {}
  return txt.replace(/^.*cle=/, '').replace(/[^A-Za-z0-9_-]/g, '');
}

function showGate(msg) {
  $('#gate').hidden = false;
  if (msg) $('#gate-msg').textContent = msg;
  $('#gate-go').onclick = async () => {
    const k = keyFromText($('#gate-input').value);
    if (!k) return;
    $('#gate-go').disabled = true;
    if (await api.join(k)) { store(KEY_STORE, k); $('#gate').hidden = true; start(); }
    else { $('#gate-msg').textContent = "Ce lien n'est pas (ou plus) valide. Demandez le lien à jour dans le groupe WhatsApp."; }
    $('#gate-go').disabled = false;
  };
}

let started = false;
function start() {
  if (started) return; started = true;
  api.onSongs((s) => { songs = s; renderSongs(); if (tab === 'inbox') document.querySelectorAll('#inbox li.item').forEach((l) => { const i = inbox.find((z) => z.hash === l.dataset.hash); if (i && !l.contains(document.activeElement)) renderItem(l, i); }); });
  api.onInbox((i) => { inbox = i; renderInbox(); });
  takeShared().catch((e) => console.warn(e));
}

async function boot() {
  document.title = choirName;
  $('#title').textContent = choirName;
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  const params = new URLSearchParams(location.search);
  const demo = firebaseConfig.apiKey === 'REMPLACER' || params.has('demo');
  if (demo) {
    const { createDemoBackend } = await import('./backend-demo.js');
    api = createDemoBackend();
    $('#demo').hidden = false;
    start();
    return;
  }
  const { createFirebaseBackend } = await import('./backend-firebase.js');
  api = await createFirebaseBackend(firebaseConfig);
  const k = params.get('cle') || read(KEY_STORE);
  if (!k) return showGate();
  if (await api.join(k)) { store(KEY_STORE, k); start(); }
  else showGate("Ce lien n'est pas (ou plus) valide. Demandez le lien à jour dans le groupe WhatsApp.");
}
boot();
