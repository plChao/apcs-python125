'use strict';

const OPTION_KEYS = 'ABCDEFGHIJ';
const STORAGE_KEY = 'mcq-practice-record-v1';
const SETTINGS_KEY = 'mcq-practice-settings-v1';
const DIFFICULTY_ORDER = ['易', '中', '難'];

const state = {
  banks: [],          // 載入的題庫
  questions: [],      // 全部題目(已合併題庫來源)
  record: loadJson(STORAGE_KEY, {}),
  filter: { banks: new Set(), tags: new Set(), difficulties: new Set() },
  session: null,      // { ids, index, answers: {id: key} }
};

const $ = (id) => document.getElementById(id);

// ---------- storage ----------

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // 私密模式或儲存空間被封鎖時，練習照常進行，只是不記錄
  }
}

// ---------- 載入題庫 ----------

async function loadBanks() {
  const index = await fetch('data/index.json').then((r) => r.json());
  const banks = await Promise.all(index.banks.map((path) => fetch(path).then((r) => r.json())));
  state.banks = banks;
  state.questions = banks.flatMap((bank) =>
    bank.questions.map((q) => ({
      ...q,
      bankId: bank.id,
      bankTitle: bank.title,
      source: { ...bank.source, ...(q.source || {}) },
    }))
  );
}

// ---------- 內容區塊渲染 ----------
// 題幹、選項、解說都用同一種「區塊陣列」格式：
//   { type: "text",  text }
//   { type: "code",  code, lang }
//   { type: "image", src, alt, caption, width }   // .jpg / .png / .svg / .webp 檔案
//   { type: "svg",   svg, alt, caption, width }   // 直接寫在 JSON 裡的 SVG 原始碼

function renderBlocks(blocks, container) {
  const list = typeof blocks === 'string' ? [{ type: 'text', text: blocks }] : blocks || [];
  for (const block of list) {
    container.appendChild(renderBlock(block));
  }
}

function renderBlock(block) {
  switch (block.type) {
    case 'code': {
      const pre = document.createElement('pre');
      pre.className = 'code';
      const code = document.createElement('code');
      if (block.lang) code.className = `language-${block.lang}`;
      code.textContent = block.code;
      pre.appendChild(code);
      return pre;
    }
    case 'image':
    case 'svg': {
      const figure = document.createElement('figure');
      figure.className = 'media';
      const img = document.createElement('img');
      // 內嵌 SVG 轉成 data URL 用 <img> 顯示，SVG 裡的 script 不會執行
      img.src = block.type === 'svg'
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(block.svg)}`
        : block.src;
      img.alt = block.alt || '';
      img.loading = 'lazy';
      if (block.width) img.style.width = typeof block.width === 'number' ? `${block.width}px` : block.width;
      figure.appendChild(img);
      if (block.caption) {
        const caption = document.createElement('figcaption');
        caption.textContent = block.caption;
        figure.appendChild(caption);
      }
      return figure;
    }
    case 'text':
    default: {
      const p = document.createElement('p');
      p.textContent = block.text ?? '';
      return p;
    }
  }
}

// ---------- 首頁 ----------

function makeChip(label, count, pressed, onToggle) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip';
  btn.setAttribute('aria-pressed', String(pressed));
  btn.textContent = label;
  if (count !== undefined) {
    const span = document.createElement('span');
    span.className = 'count';
    span.textContent = count;
    btn.appendChild(span);
  }
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(next));
    onToggle(next);
    updateMatchCount();
    saveSettings();
  });
  return btn;
}

function toggleSet(set, value, on) {
  if (on) set.add(value);
  else set.delete(value);
}

function renderHome() {
  const bankList = $('bankList');
  bankList.replaceChildren();
  for (const bank of state.banks) {
    bankList.appendChild(
      makeChip(bank.title, bank.questions.length, state.filter.banks.has(bank.id), (on) =>
        toggleSet(state.filter.banks, bank.id, on)
      )
    );
  }

  const tagCount = new Map();
  for (const q of state.questions) {
    for (const tag of q.tags || []) tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
  }
  const tagList = $('tagList');
  tagList.replaceChildren();
  for (const [tag, count] of [...tagCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    tagList.appendChild(
      makeChip(tag, count, state.filter.tags.has(tag), (on) => toggleSet(state.filter.tags, tag, on))
    );
  }

  const difficulties = [...new Set(state.questions.map((q) => q.difficulty).filter(Boolean))].sort(
    (a, b) => DIFFICULTY_ORDER.indexOf(a) - DIFFICULTY_ORDER.indexOf(b)
  );
  const difficultyList = $('difficultyList');
  difficultyList.replaceChildren();
  for (const level of difficulties) {
    const count = state.questions.filter((q) => q.difficulty === level).length;
    difficultyList.appendChild(
      makeChip(level, count, state.filter.difficulties.has(level), (on) =>
        toggleSet(state.filter.difficulties, level, on)
      )
    );
  }

  updateMatchCount();
}

function filteredQuestions() {
  const { banks, tags, difficulties } = state.filter;
  return state.questions.filter((q) => {
    if (banks.size && !banks.has(q.bankId)) return false;
    if (tags.size && !(q.tags || []).some((t) => tags.has(t))) return false;
    if (difficulties.size && !difficulties.has(q.difficulty)) return false;
    if ($('chkWrongOnly').checked && state.record[q.id]?.lastCorrect !== false) return false;
    return true;
  });
}

// 使用者指定要抽的題數；空白或不合理的值回傳 null 表示全部
function requestedCount() {
  const value = parseInt($('inputCount').value, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function updateMatchCount() {
  const questions = filteredQuestions();
  const count = questions.length;
  const untried = questions.filter((q) => !state.record[q.id]).length;
  const wanted = requestedCount();
  $('matchCount').textContent = wanted && wanted < count
    ? `符合 ${count} 題(未做 ${untried})，抽 ${wanted} 題，未做的優先`
    : `符合 ${count} 題(未做 ${untried})`;
  $('btnStart').disabled = count === 0;
}

// 指定題數時先抽還沒做過的題目，不夠再從做過的題目隨機補；
// 沒有勾「打亂順序」就照原本題號排列
function pickQuestions(questions) {
  const wanted = requestedCount();
  let picked = questions;
  if (wanted && wanted < questions.length) {
    const untried = questions.filter((q) => !state.record[q.id]);
    const tried = questions.filter((q) => state.record[q.id]);
    const chosenIds = new Set([...shuffle(untried), ...shuffle(tried)].slice(0, wanted).map((q) => q.id));
    picked = questions.filter((q) => chosenIds.has(q.id));
  }
  return $('chkShuffle').checked ? shuffle(picked) : picked;
}

function saveSettings() {
  saveJson(SETTINGS_KEY, {
    banks: [...state.filter.banks],
    tags: [...state.filter.tags],
    difficulties: [...state.filter.difficulties],
    shuffle: $('chkShuffle').checked,
    shuffleOptions: $('chkShuffleOptions').checked,
    wrongOnly: $('chkWrongOnly').checked,
    count: $('inputCount').value,
  });
}

function restoreSettings() {
  const saved = loadJson(SETTINGS_KEY, null);
  if (!saved) return;
  state.filter.banks = new Set(saved.banks || []);
  state.filter.tags = new Set(saved.tags || []);
  state.filter.difficulties = new Set(saved.difficulties || []);
  $('chkShuffle').checked = !!saved.shuffle;
  $('chkShuffleOptions').checked = !!saved.shuffleOptions;
  $('chkWrongOnly').checked = !!saved.wrongOnly;
  // 舊版設定沒有 count 時用預設 10；使用者刻意清空(全部)則保留空白
  $('inputCount').value = saved.count ?? '10';
}

// ---------- 作答 ----------

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 「以上皆是 / 以上皆非 / 以上皆非或執行錯誤」這類選項指的是其他選項，位置要固定
function isFixedOption(option) {
  const text = typeof option === 'string' ? option : option?.[0]?.text;
  return typeof text === 'string' && text.trim().startsWith('以上');
}

// 回傳選項的顯示順序(原本的 index 陣列)：固定的選項留在原位，其餘互相打亂
function makeOptionOrder(q) {
  const order = q.options.map((_, i) => i);
  if (!$('chkShuffleOptions').checked || q.shuffleOptions === false) return order;
  const movable = order.filter((i) => !isFixedOption(q.options[i]));
  const shuffled = shuffle(movable);
  return order.map((i) => (movable.includes(i) ? shuffled[movable.indexOf(i)] : i));
}

// session.answers 存的是 JSON 裡的原始選項代號，畫面上顯示的是打亂後的代號
function displayKey(q, originalKey) {
  const order = state.session.optionOrder[q.id];
  return OPTION_KEYS[order.indexOf(OPTION_KEYS.indexOf(originalKey))];
}

function startSession(ordered) {
  state.session = {
    ids: ordered.map((q) => q.id),
    index: 0,
    answers: {},
    optionOrder: Object.fromEntries(ordered.map((q) => [q.id, makeOptionOrder(q)])),
  };
  showView('viewQuiz');
  renderQuestion();
}

function currentQuestion() {
  const id = state.session.ids[state.session.index];
  return state.questions.find((q) => q.id === id);
}

function renderQuestion() {
  const { session } = state;
  const q = currentQuestion();
  const chosen = session.answers[q.id];

  $('progressLabel').textContent = `${session.index + 1} / ${session.ids.length}`;
  $('qNumber').textContent = `${q.source?.name ? q.source.name + ' ' : ''}${q.sourceRef || q.id}`;
  $('qDifficulty').textContent = q.difficulty || '';
  $('qDifficulty').hidden = !q.difficulty;

  const tags = $('qTags');
  tags.replaceChildren();
  for (const tag of q.tags || []) {
    const span = document.createElement('span');
    span.textContent = tag;
    tags.appendChild(span);
  }

  const stem = $('qStem');
  stem.replaceChildren();
  renderBlocks(q.stem, stem);

  const options = $('qOptions');
  options.replaceChildren();
  session.optionOrder[q.id].forEach((originalIndex, position) => {
    const option = q.options[originalIndex];
    const key = OPTION_KEYS[originalIndex];
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    btn.dataset.key = key;

    const keyEl = document.createElement('span');
    keyEl.className = 'option-key';
    keyEl.textContent = `(${OPTION_KEYS[position]})`;
    const body = document.createElement('span');
    body.className = 'option-body';
    if (typeof option === 'string') renderOptionText(option, body);
    else renderBlocks(option, body);

    btn.append(keyEl, body);
    btn.addEventListener('click', () => answerQuestion(q, key));
    li.appendChild(btn);
    options.appendChild(li);
  });

  if (chosen) showResult(q, chosen);
  else $('qResult').hidden = true;

  $('btnPrev').disabled = session.index === 0;
  $('btnNext').textContent = session.index === session.ids.length - 1 ? '看結果' : '下一題';
  window.scrollTo({ top: 0 });
}

// 選項多半是程式輸出或程式碼，只在空白處換行，避免 `-=` 這種運算子被拆成兩行；
// 含中文的片段照常換行
function renderOptionText(text, container) {
  for (const token of text.split(/(\s+)/)) {
    if (!token) continue;
    if (/\s/.test(token) || /[　-鿿]/.test(token)) {
      container.append(token);
    } else {
      const span = document.createElement('span');
      span.className = 'nowrap';
      span.textContent = token;
      container.appendChild(span);
    }
  }
}

function answerQuestion(q, key) {
  if (state.session.answers[q.id]) return;
  state.session.answers[q.id] = key;

  const isCorrect = key === q.answer;
  const rec = state.record[q.id] || { attempts: 0, correct: 0 };
  rec.attempts += 1;
  if (isCorrect) rec.correct += 1;
  rec.lastCorrect = isCorrect;
  rec.lastAnsweredAt = new Date().toISOString();
  state.record[q.id] = rec;
  saveJson(STORAGE_KEY, state.record);

  showResult(q, key);
}

function showResult(q, chosen) {
  const isCorrect = chosen === q.answer;
  for (const btn of $('qOptions').querySelectorAll('.option-btn')) {
    btn.disabled = true;
    if (btn.dataset.key === q.answer) btn.classList.add('correct');
    else if (btn.dataset.key === chosen) btn.classList.add('wrong');
  }

  const verdict = $('qVerdict');
  const answerLabel = displayKey(q, q.answer);
  verdict.textContent = isCorrect ? `答對了！答案是 (${answerLabel})` : `答錯了，正確答案是 (${answerLabel})`;
  verdict.className = `verdict ${isCorrect ? 'correct' : 'wrong'}`;

  const explanation = $('qExplanation');
  explanation.replaceChildren();
  renderBlocks(q.explanation, explanation);

  const source = $('qSource');
  source.replaceChildren();
  if (q.source) {
    source.append('來源：');
    const label = [q.source.name, q.source.author && `(${q.source.author})`, q.sourceRef].filter(Boolean).join(' ');
    if (q.source.url) {
      const a = document.createElement('a');
      a.href = q.source.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = label;
      source.appendChild(a);
    } else {
      source.append(label);
    }
  }

  $('qResult').hidden = false;
}

// ---------- 結果 ----------

function renderSummary() {
  const { session } = state;
  const correct = session.ids.filter((id) => {
    const q = state.questions.find((x) => x.id === id);
    return session.answers[id] === q.answer;
  }).length;
  $('summaryScore').textContent = `${correct} / ${session.ids.length}`;
  $('progressLabel').textContent = '';

  const list = $('summaryList');
  list.replaceChildren();
  session.ids.forEach((id, i) => {
    const q = state.questions.find((x) => x.id === id);
    const chosen = session.answers[id];
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    const mark = document.createElement('span');
    if (!chosen) {
      mark.className = 'skip';
      mark.textContent = '－ 未作答';
    } else if (chosen === q.answer) {
      mark.className = 'ok';
      mark.textContent = '✓ 答對';
    } else {
      mark.className = 'ng';
      mark.textContent = `✗ 選 (${displayKey(q, chosen)})，答案 (${displayKey(q, q.answer)})`;
    }
    btn.append(`${i + 1}. ${q.sourceRef || q.id}　`, mark);
    btn.addEventListener('click', () => {
      session.index = i;
      showView('viewQuiz');
      renderQuestion();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });

  $('btnRetryWrong').disabled = correct === session.ids.length;
}

// ---------- 練習進度 ----------

function percent(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function renderProgress() {
  const total = state.questions.length;
  const done = state.questions.filter((q) => state.record[q.id]);
  const correct = done.filter((q) => state.record[q.id].lastCorrect).length;
  const wrong = done.length - correct;
  const todo = total - done.length;

  $('statDone').innerHTML = `${done.length}<small>/ ${total} 題・${percent(done.length, total)}%</small>`;
  $('statCorrect').innerHTML = `${percent(correct, done.length)}%<small>${correct} 題</small>`;
  $('statWrong').innerHTML = `${percent(wrong, done.length)}%<small>${wrong} 題</small>`;

  const segments = [
    { cls: 'seg-correct', label: '答對', value: correct },
    { cls: 'seg-wrong', label: '答錯', value: wrong },
    { cls: 'seg-todo', label: '未做', value: todo },
  ];
  const bar = $('progressBar');
  bar.replaceChildren();
  bar.setAttribute('aria-label', segments.map((s) => `${s.label} ${s.value} 題`).join('，'));
  const legend = $('progressLegend');
  legend.replaceChildren();
  for (const seg of segments) {
    if (seg.value) {
      const span = document.createElement('span');
      span.className = seg.cls;
      span.style.flex = String(seg.value);
      span.title = `${seg.label} ${seg.value} 題(${percent(seg.value, total)}%)`;
      bar.appendChild(span);
    }
    const li = document.createElement('li');
    const swatch = document.createElement('i');
    swatch.className = seg.cls;
    li.append(swatch, `${seg.label} ${seg.value}`);
    legend.appendChild(li);
  }

  // 常錯：答錯過的題目，依答錯次數、答錯比例排序
  const frequent = state.questions
    .map((q) => {
      const rec = state.record[q.id];
      return rec ? { q, rec, wrongTimes: rec.attempts - rec.correct } : null;
    })
    .filter((item) => item && item.wrongTimes > 0)
    .sort((a, b) => b.wrongTimes - a.wrongTimes || b.wrongTimes / b.rec.attempts - a.wrongTimes / a.rec.attempts);

  const frequentList = $('frequentList');
  frequentList.replaceChildren();
  if (!frequent.length) {
    frequentList.appendChild(Object.assign(document.createElement('li'), { className: 'empty', textContent: '目前沒有答錯過的題目' }));
  }
  for (const { q, rec, wrongTimes } of frequent) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    const name = document.createElement('span');
    name.textContent = `${q.source?.name ? q.source.name + ' ' : ''}${q.sourceRef || q.id}`;
    const tags = Object.assign(document.createElement('small'), { textContent: (q.tags || []).join('、') });
    name.appendChild(tags);
    const count = document.createElement('span');
    count.className = 'wrong-count';
    count.textContent = `錯 ${wrongTimes} / ${rec.attempts} 次${rec.lastCorrect ? '・最近答對' : ''}`;
    btn.append(name, count);
    btn.addEventListener('click', () => startSession([q]));
    li.appendChild(btn);
    frequentList.appendChild(li);
  }
  $('btnPracticeFrequent').hidden = !frequent.length;
  $('btnPracticeFrequent').onclick = () => startSession(frequent.map((item) => item.q));

  // 各標籤答對率(以最近一次結果計算)
  const tagStats = new Map();
  for (const q of done) {
    for (const tag of q.tags || []) {
      const stat = tagStats.get(tag) || { done: 0, correct: 0 };
      stat.done += 1;
      if (state.record[q.id].lastCorrect) stat.correct += 1;
      tagStats.set(tag, stat);
    }
  }
  const tagStatList = $('tagStatList');
  tagStatList.replaceChildren();
  if (!tagStats.size) {
    tagStatList.appendChild(Object.assign(document.createElement('li'), { className: 'empty', textContent: '還沒有作答紀錄' }));
  }
  const sortedTags = [...tagStats].sort(
    (a, b) => a[1].correct / a[1].done - b[1].correct / b[1].done || b[1].done - a[1].done
  );
  for (const [tag, stat] of sortedTags) {
    const li = document.createElement('li');
    const name = Object.assign(document.createElement('span'), { className: 'tag-name', textContent: tag });
    const meter = document.createElement('div');
    meter.className = 'meter';
    const fill = document.createElement('span');
    fill.style.width = `${percent(stat.correct, stat.done)}%`;
    meter.appendChild(fill);
    const rate = Object.assign(document.createElement('span'), {
      className: 'rate',
      textContent: `${percent(stat.correct, stat.done)}%(${stat.correct}/${stat.done})`,
    });
    li.append(name, meter, rate);
    tagStatList.appendChild(li);
  }
}

// ---------- 畫面切換 ----------

function showView(id) {
  for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== id;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === id));
  }
  if (id === 'viewHome') {
    $('progressLabel').textContent = '';
    renderHome();
  } else if (id === 'viewProgress') {
    $('progressLabel').textContent = '';
    renderProgress();
  }
}

function bindEvents() {
  $('btnHome').addEventListener('click', () => showView('viewHome'));
  $('btnBackHome').addEventListener('click', () => showView('viewHome'));
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  }
  $('btnResetRecord').addEventListener('click', () => {
    if (!window.confirm('確定要清除所有作答紀錄？清除後無法復原。')) return;
    state.record = {};
    saveJson(STORAGE_KEY, state.record);
    renderProgress();
  });
  $('btnStart').addEventListener('click', () => startSession(pickQuestions(filteredQuestions())));
  $('btnClearTags').addEventListener('click', () => {
    state.filter.tags.clear();
    saveSettings();
    renderHome();
  });
  for (const id of ['chkShuffle', 'chkShuffleOptions', 'chkWrongOnly', 'inputCount']) {
    $(id).addEventListener('input', () => {
      updateMatchCount();
      saveSettings();
    });
  }
  $('btnPrev').addEventListener('click', () => {
    if (state.session.index > 0) {
      state.session.index -= 1;
      renderQuestion();
    }
  });
  $('btnNext').addEventListener('click', () => {
    if (state.session.index < state.session.ids.length - 1) {
      state.session.index += 1;
      renderQuestion();
    } else {
      showView('viewSummary');
      renderSummary();
    }
  });
  $('btnRetryWrong').addEventListener('click', () => {
    const { session } = state;
    const wrong = session.ids
      .map((id) => state.questions.find((q) => q.id === id))
      .filter((q) => session.answers[q.id] !== q.answer);
    startSession(wrong);
  });
}

async function init() {
  bindEvents();
  restoreSettings();
  try {
    await loadBanks();
  } catch (err) {
    $('viewHome').replaceChildren(
      Object.assign(document.createElement('p'), {
        className: 'card',
        textContent: '題庫載入失敗。請用網頁伺服器開啟(例如 python3 -m http.server)，不要直接雙擊 index.html。',
      })
    );
    return;
  }
  showView('viewHome');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
