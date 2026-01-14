(() => {
  const $ = (s) => document.querySelector(s);

  // =========================
  // THEME (checked = DARK)
  // =========================
  const themeToggle = $("#themeToggle");
  const THEME_KEY = "oge19_theme";

  function applyTheme(theme) {
    const isLight = theme === "light";
    document.body.classList.toggle("light", isLight);
    if (themeToggle) themeToggle.checked = !isLight; // checked = dark
  }

  applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");

  themeToggle?.addEventListener("change", () => {
    const theme = themeToggle.checked ? "dark" : "light";
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  });

  // =========================
  // APP
  // =========================
  const home = $("#home");
  const test = $("#test");
  const result = $("#result");

  const startQuick = $("#startQuick");
  const startFull = $("#startFull");
  const submitTicket = $("#submitTicket");
  const nextTicket = $("#nextTicket");
  const resetBtn = $("#reset");

  const questionsWrap = $("#questionsWrap");
  const ticketTitle = $("#ticketTitle");
  const ticketSub = $("#ticketSub");
  const scoreNow = $("#scoreNow");
  const ticketResult = $("#ticketResult");

  const tryAgain = $("#tryAgain");
  const shareBtn = $("#shareBtn");
  const shareHint = $("#shareHint");
  const finalText = $("#finalText");

  const installBtn = $("#installBtn");
  const aboutOffline = $("#aboutOffline");

  const LS_KEY = "oge19_state_v1";

  // ----- Bank -----
  const bank = Array.isArray(window.QUESTIONS_BANK) ? window.QUESTIONS_BANK : [];
  if (!bank.length) console.warn("QUESTIONS_BANK пуст — проверь questions.js (window.QUESTIONS_BANK)");

  const bankTrue = bank.filter(x => x.isTrue);
  const bankFalse = bank.filter(x => !x.isTrue);

  // Всего вопросов в full: 1 вопрос = 3 утверждения
  const TOTAL_QUESTIONS_FULL = Math.ceil(bank.length / 3);

  // ----- PWA install prompt -----
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn?.classList.remove("hidden");
  });

  installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn?.classList.add("hidden");
  });

  // ----- State -----
  const defaultState = () => ({
    mode: null, // "quick" | "full"
    ticketIndex: 0,
    usedIds: {},     // для full: какие утверждения уже встречались как варианты
    poolTrue: [],
    poolFalse: [],
    ticket: [],      // 3 вопроса
    correctQuestions: 0,
    answeredQuestions: 0
  });

  let state = loadState() ?? defaultState();

  function saveState() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function hardReset() {
    state = defaultState();
    saveState();
    showHome();
  }

  // ----- Helpers -----
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function refillPoolsIfNeeded() {
    if (!state.poolTrue.length) state.poolTrue = shuffle(bankTrue.map(x => x.id));
    if (!state.poolFalse.length) state.poolFalse = shuffle(bankFalse.map(x => x.id));
  }

  function getById(id) {
    return bank.find(x => x.id === id);
  }

  function cryptoRandomId() {
    if (crypto?.getRandomValues) {
      const b = new Uint32Array(1);
      crypto.getRandomValues(b);
      return "q" + b[0].toString(16);
    }
    return "q" + Math.random().toString(16).slice(2);
  }

  function takeFromPool(isTrue, count, avoidSet) {
    const poolName = isTrue ? "poolTrue" : "poolFalse";
    const poolBank = isTrue ? bankTrue : bankFalse;
    const out = [];

    while (out.length < count) {
      if (!state[poolName].length) state[poolName] = shuffle(poolBank.map(x => x.id));
      const id = state[poolName].shift();
      if (avoidSet.has(id)) continue;
      out.push(id);
      avoidSet.add(id);
    }
    return out;
  }

  function makeQuestion() {
    const kTrue = Math.random() < 0.5 ? 1 : 2; // 1 или 2 истинных
    const avoid = new Set();

    refillPoolsIfNeeded();

    const trueIds = takeFromPool(true, kTrue, avoid);
    const falseIds = takeFromPool(false, 3 - kTrue, avoid);

    const options = shuffle([...trueIds, ...falseIds].map(id => {
      const item = getById(id);
      return { id: item.id, text: item.text, isTrue: item.isTrue };
    }));

    if (state.mode === "full") {
      for (const o of options) state.usedIds[o.id] = true;
    }

    return {
      qid: cryptoRandomId(),
      kTrue,
      options,
      selectedIds: [],
      checked: false,
      isCorrect: null
    };
  }

  function makeTicket() {
    return [makeQuestion(), makeQuestion(), makeQuestion()];
  }

  function allBankUsedOnce() {
    return Object.keys(state.usedIds).length >= bank.length;
  }

  function show(view) {
    home?.classList.add("hidden");
    test?.classList.add("hidden");
    result?.classList.add("hidden");
    view?.classList.remove("hidden");
  }

  function showHome() { show(home); }
  function showTest() { show(test); renderTicket(); }
  function showResult() { show(result); renderResult(); }

  function startMode(mode) {
    state = defaultState();
    state.mode = mode;
    if (mode === "full") state.usedIds = {};
    state.ticketIndex = 0;
    state.ticket = makeTicket();
    saveState();
    showTest();
  }

  // ----- Render -----
  function renderTicket() {
    if (!questionsWrap) return;

    if (ticketResult) ticketResult.textContent = "";

    if (ticketTitle) {
      ticketTitle.textContent = (state.mode === "quick")
        ? "Билет 1 из 1"
        : `Билет ${state.ticketIndex + 1}`;
    }

    const totalAll = (state.mode === "quick") ? 3 : TOTAL_QUESTIONS_FULL;
    if (scoreNow) scoreNow.textContent = `Верно сейчас: ${state.correctQuestions}/${totalAll}`;

    const markedCount = state.ticket.reduce((acc, q) => acc + (q.selectedIds.length > 0 ? 1 : 0), 0);
    if (ticketSub) ticketSub.textContent = `Отмечено: ${markedCount}/3`;

    const allChecked = state.ticket.every(q => q.checked);
    submitTicket?.classList.toggle("hidden", allChecked);
    nextTicket?.classList.toggle("hidden", !allChecked);

    questionsWrap.innerHTML = "";

    state.ticket.forEach((q, idx) => {
      const card = document.createElement("div");
      card.className = "qCard";
      if (q.checked) card.classList.add(q.isCorrect ? "stateOk" : "stateBad");

      const head = document.createElement("div");
      head.className = "qHead";

      const title = document.createElement("div");
      title.className = "qTitle";
      title.textContent = `${idx + 1}. ${
        q.kTrue === 1
          ? "Какое из следующих утверждений истинно?"
          : "Какие из следующих утверждений истинны?"
      }`;

      head.appendChild(title);
      card.appendChild(head);

      const opts = document.createElement("div");
      opts.className = "opts";

      q.options.forEach((opt) => {
        const row = document.createElement("label");
        row.className = "opt";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.disabled = q.checked;
        cb.checked = q.selectedIds.includes(opt.id);

        cb.addEventListener("change", () => {
          if (cb.checked) {
            if (!q.selectedIds.includes(opt.id)) q.selectedIds.push(opt.id);
          } else {
            q.selectedIds = q.selectedIds.filter(id => id !== opt.id);
          }
          saveState();
          renderTicket();
        });

        const t = document.createElement("div");
        t.className = "optText";
        t.textContent = opt.text;

        row.appendChild(cb);
        row.appendChild(t);

        if (q.checked) {
          const hint = document.createElement("div");
          hint.className = "optHint";
          const selected = q.selectedIds.includes(opt.id);

          if (opt.isTrue && selected) hint.textContent = "✓ Вы выбрали истинное";
          else if (opt.isTrue && !selected) hint.textContent = "• Истинное (не выбрано)";
          else if (!opt.isTrue && selected) hint.textContent = "• Ложное (выбрано ошибочно)";
          else hint.textContent = "";

          row.appendChild(hint);
        }

        opts.appendChild(row);
      });

      card.appendChild(opts);

      if (q.checked) {
        const feedback = document.createElement("div");
        feedback.className = "qFeedback";

        const badge = document.createElement("span");
        badge.className = "badge " + (q.isCorrect ? "badgeOk" : "badgeBad");
        badge.textContent = q.isCorrect ? "✅ Верно" : "❌ Неправильно";
        feedback.appendChild(badge);

        card.appendChild(feedback);

        if (!q.isCorrect) {
          const block = document.createElement("div");
          block.className = "tiny";
          block.style.marginTop = "8px";

          const trueOptions = q.options.filter(o => o.isTrue);
          block.innerHTML = "<b>Истинные:</b><br>" + trueOptions.map(t => "• " + t.text).join("<br>");
          card.appendChild(block);
        }
      }

      questionsWrap.appendChild(card);
    });
  }

  // ----- Check logic -----
  function setsEqual(aArr, bArr) {
    const a = new Set(aArr);
    const b = new Set(bArr);
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  function checkTicket() {
    const missing = state.ticket.filter(q => q.selectedIds.length === 0).length;
    if (missing > 0) {
      if (ticketResult) ticketResult.textContent = "Нужно отметить ответы во всех 3 вопросах.";
      return;
    }

    let correctInTicket = 0;

    state.ticket.forEach((q) => {
      const correctIds = q.options.filter(o => o.isTrue).map(o => o.id);
      q.checked = true;
      q.isCorrect = setsEqual(q.selectedIds, correctIds);

      state.answeredQuestions += 1;
      if (q.isCorrect) {
        state.correctQuestions += 1;
        correctInTicket += 1;
      }
    });

    if (ticketResult) ticketResult.textContent = `Результат билета: ${correctInTicket}/3.`;

    saveState();
    renderTicket();
  }

  function nextStep() {
    if (state.mode === "quick") {
      showResult();
      return;
    }

    if (allBankUsedOnce()) {
      showResult();
      return;
    }

    state.ticketIndex += 1;
    state.ticket = makeTicket();
    saveState();
    renderTicket();
  }

  // ----- Result + Share -----
  function renderResult() {
    const total = state.answeredQuestions;
    const correct = state.correctQuestions;
    const percent = total ? Math.round((correct / total) * 100) : 0;

    const modeLabel = state.mode === "quick" ? "3 случайных" : "по всем вопросам";
    if (finalText) finalText.textContent = `Режим: ${modeLabel}. Верно: ${correct}/${total} (${percent}%).`;

    if (shareHint) {
      shareHint.textContent = navigator.share
        ? "Нажми «Поделиться» — можно отправить в Telegram."
        : "Если «Поделиться» не работает, откроется Telegram с готовым сообщением.";
    }
  }

  async function shareResult() {
    const total = state.answeredQuestions;
    const correct = state.correctQuestions;
    const percent = total ? Math.round((correct / total) * 100) : 0;
    const modeLabel = state.mode === "quick" ? "3 случайных" : "по всем вопросам";
    const text = `ОГЭ 19 — результат ✅\nРежим: ${modeLabel}\nВерно: ${correct}/${total} (${percent}%)`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "ОГЭ 19 — результат", text });
        return;
      } catch {}
    }

    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(text)}`;
    window.open(tgUrl, "_blank", "noopener,noreferrer");
  }

  // ----- Events -----
  startQuick?.addEventListener("click", () => startMode("quick"));
  startFull?.addEventListener("click", () => startMode("full"));

  submitTicket?.addEventListener("click", checkTicket);
  nextTicket?.addEventListener("click", nextStep);

  resetBtn?.addEventListener("click", hardReset);

  tryAgain?.addEventListener("click", () => {
    if (!state.mode) showHome();
    else startMode(state.mode);
  });

  shareBtn?.addEventListener("click", shareResult);

  aboutOffline?.addEventListener("click", () => {
    alert("Офлайн режим включён: приложение кэширует файлы через Service Worker и работает без интернета.");
  });

  // ----- Bootstrap -----
  if (state.mode && state.ticket?.length) showTest();
  else showHome();
})();
  if (!bank.length) console.warn("QUESTIONS_BANK пуст — добавь вопросы в questions.js");

  const bankTrue = bank.filter(x => x.isTrue);
  const bankFalse = bank.filter(x => !x.isTrue);

  // ----- PWA install prompt -----
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn?.classList.remove("hidden");
  });

  installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn?.classList.add("hidden");
  });

  // ----- State -----
  const defaultState = () => ({
    mode: null, // "quick" | "full"
    ticketIndex: 0,

    // For full: ids used at least once (as options in questions)
    usedIds: {},

    // pools for nicer randomness without repeats (when possible)
    poolTrue: [],
    poolFalse: [],

    // current ticket of 3 questions
    ticket: [],

    // overall score
    correctQuestions: 0,
    answeredQuestions: 0
  });

  let state = loadState() ?? defaultState();

  function saveState() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function hardReset() {
    state = defaultState();
    saveState();
    showHome();
  }

  // ----- Helpers -----
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function refillPoolsIfNeeded() {
    if (!state.poolTrue.length) state.poolTrue = shuffle(bankTrue.map(x => x.id));
    if (!state.poolFalse.length) state.poolFalse = shuffle(bankFalse.map(x => x.id));
  }

  function getById(id) {
    return bank.find(x => x.id === id);
  }

  function cryptoRandomId() {
    if (crypto?.getRandomValues) {
      const b = new Uint32Array(1);
      crypto.getRandomValues(b);
      return "q" + b[0].toString(16);
    }
    return "q" + Math.random().toString(16).slice(2);
  }

  function takeFromPool(isTrue, count, avoidSet) {
    const poolName = isTrue ? "poolTrue" : "poolFalse";
    const poolBank = isTrue ? bankTrue : bankFalse;
    const out = [];

    while (out.length < count) {
      if (!state[poolName].length) state[poolName] = shuffle(poolBank.map(x => x.id));
      const id = state[poolName].shift();
      if (avoidSet.has(id)) continue;
      out.push(id);
      avoidSet.add(id);
    }
    return out;
  }

  function makeQuestion() {
    // kTrue: 1 or 2
    const kTrue = Math.random() < 0.5 ? 1 : 2;
    const avoid = new Set();

    refillPoolsIfNeeded();

    const trueIds = takeFromPool(true, kTrue, avoid);
    const falseIds = takeFromPool(false, 3 - kTrue, avoid);

    const options = shuffle([...trueIds, ...falseIds].map(id => {
      const item = getById(id);
      return { id: item.id, text: item.text, isTrue: item.isTrue };
    }));

    if (state.mode === "full") {
      for (const o of options) state.usedIds[o.id] = true;
    }

    return {
      qid: cryptoRandomId(),
      kTrue,
      options,
      selectedIds: [],
      checked: false,
      isCorrect: null
    };
  }

  function makeTicket() {
    return [makeQuestion(), makeQuestion(), makeQuestion()];
  }

  function allBankUsedOnce() {
    return Object.keys(state.usedIds).length >= bank.length;
  }

  function show(view) {
    home?.classList.add("hidden");
    test?.classList.add("hidden");
    result?.classList.add("hidden");
    view?.classList.remove("hidden");
  }

  function showHome() { show(home); }
  function showTest() { show(test); renderTicket(); }
  function showResult() { show(result); renderResult(); }

  // ----- Start modes -----
  function startMode(mode) {
    state = defaultState();
    state.mode = mode;

    if (mode === "full") state.usedIds = {};

    state.ticketIndex = 0;
    state.ticket = makeTicket();
    saveState();
    showTest();
  }

  // ----- Render -----
  function renderTicket() {
    if (!questionsWrap) return;

    if (ticketResult) ticketResult.textContent = "";

    // Header
    if (ticketTitle) {
      if (state.mode === "quick") ticketTitle.textContent = `Билет 1 из 1`;
      else ticketTitle.textContent = `Билет ${state.ticketIndex + 1}`;
    }

    // Counts
    const totalAnswered = state.answeredQuestions;
    const totalCorrect = state.correctQuestions;
    // if (scoreNow) scoreNow.textContent = `Верно сейчас: ${totalCorrect}/${Math.max(totalAnswered, 0)}`;
// сколько всего вопросов в тесте
const TOTAL_QUESTIONS =
  state.mode === "quick"
    ? 3                          // 1 билет = 3 вопроса
    : Math.ceil(bank.length / 3); // 117 утверждений → 39 вопросов

// сколько решено верно всего
const totalCorrect = state.correctQuestions;

// выводим в шапке
scoreNow.textContent = `Верно сейчас: ${totalCorrect}/${TOTAL_QUESTIONS}`;

    const markedCount = state.ticket.reduce((acc, q) => acc + (q.selectedIds.length > 0 ? 1 : 0), 0);
    if (ticketSub) ticketSub.textContent = `Отмечено: ${markedCount}/3`;

    const allChecked = state.ticket.every(q => q.checked);
    submitTicket?.classList.toggle("hidden", allChecked);
    nextTicket?.classList.toggle("hidden", !allChecked);

    // Questions
    questionsWrap.innerHTML = "";

    state.ticket.forEach((q, idx) => {
      const card = document.createElement("div");
      card.className = "qCard";
      if (q.checked) card.classList.add(q.isCorrect ? "stateOk" : "stateBad");

      const head = document.createElement("div");
      head.className = "qHead";

      const title = document.createElement("div");
      title.className = "qTitle";

      const needText = (q.kTrue === 1)
        ? "Какое из следующих утверждений истинно?"
        : "Какие из следующих утверждений истинны?";

      title.textContent = `${idx + 1}. ${needText}`;

      const meta = document.createElement("div");
      meta.className = "qMeta hidden";
      meta.textContent = ``;

      head.appendChild(title);
      head.appendChild(meta);
      card.appendChild(head);

      const opts = document.createElement("div");
      opts.className = "opts";

      q.options.forEach((opt) => {
        const row = document.createElement("label");
        row.className = "opt";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.disabled = q.checked;
        cb.checked = q.selectedIds.includes(opt.id);

        cb.addEventListener("change", () => {
          if (cb.checked) {
            if (!q.selectedIds.includes(opt.id)) q.selectedIds.push(opt.id);
          } else {
            q.selectedIds = q.selectedIds.filter(id => id !== opt.id);
          }
          saveState();
          renderTicket();
        });

        const t = document.createElement("div");
        t.className = "optText";
        t.textContent = opt.text;

        row.appendChild(cb);
        row.appendChild(t);

        if (q.checked) {
          const hint = document.createElement("div");
          hint.className = "optHint";

          const selected = q.selectedIds.includes(opt.id);
          if (opt.isTrue && selected) hint.textContent = "✓ Вы выбрали истинное";
          else if (opt.isTrue && !selected) hint.textContent = "• Истинное (не выбрано)";
          else if (!opt.isTrue && selected) hint.textContent = "• Ложное (выбрано ошибочно)";
          else hint.textContent = "";

          row.appendChild(hint);
        }

        opts.appendChild(row);
      });

      card.appendChild(opts);

      if (q.checked) {
        const feedback = document.createElement("div");
        feedback.className = "qFeedback";

        const badge = document.createElement("span");
        badge.className = "badge " + (q.isCorrect ? "badgeOk" : "badgeBad");
        badge.textContent = q.isCorrect ? "✅ Верно" : "❌ Неправильно";

        const msg = document.createElement("span");
        msg.textContent = q.isCorrect ? "" : "";

        feedback.appendChild(badge);
        feedback.appendChild(msg);

        card.appendChild(feedback);

        if (!q.isCorrect) {
          const block = document.createElement("div");
          block.className = "tiny";
          block.style.marginTop = "8px";

          const trueOptions = q.options.filter(o => o.isTrue);
          block.innerHTML =
            "<b>Истинные:</b><br>" +
            trueOptions.map(t => "• " + t.text).join("<br>");

          card.appendChild(block);
        }
      }

      questionsWrap.appendChild(card);
    });
  }

  // ----- Check logic -----
  function setsEqual(aArr, bArr) {
    const a = new Set(aArr);
    const b = new Set(bArr);
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  function checkTicket() {
    const missing = state.ticket.filter(q => q.selectedIds.length === 0).length;
    if (missing > 0) {
      if (ticketResult) ticketResult.textContent = `Нужно отметить ответы во всех 3 вопросах.`;
      return;
    }

    let correctInTicket = 0;

    state.ticket.forEach((q) => {
      const correctIds = q.options.filter(o => o.isTrue).map(o => o.id);

      q.checked = true;
      q.isCorrect = setsEqual(q.selectedIds, correctIds);

      state.answeredQuestions += 1;
      if (q.isCorrect) {
        state.correctQuestions += 1;
        correctInTicket += 1;
      }
    });

    if (ticketResult) ticketResult.textContent = `Результат билета: ${correctInTicket}/3.`;

    saveState();
    renderTicket();
  }

  function nextStep() {
    const isQuick = state.mode === "quick";

    if (isQuick) {
      showResult();
      return;
    }

    if (allBankUsedOnce()) {
      showResult();
      return;
    }

    state.ticketIndex += 1;
    state.ticket = makeTicket();
    saveState();
    renderTicket();
  }

  // ----- Result + Share -----
  function renderResult() {
    const total = state.answeredQuestions;
    const correct = state.correctQuestions;
    const percent = total ? Math.round((correct / total) * 100) : 0;

    const modeLabel = state.mode === "quick" ? "3 случайных" : "по всем вопросам";
    if (finalText) finalText.textContent = `Режим: ${modeLabel}. Верно: ${correct}/${total} (${percent}%).`;

    if (shareHint) {
      shareHint.textContent = navigator.share
        ? "Нажми «Поделиться» — можно отправить в Telegram."
        : "Если кнопка «Поделиться» не работает, откроется Telegram с готовым сообщением.";
    }
  }

  async function shareResult() {
    const total = state.answeredQuestions;
    const correct = state.correctQuestions;
    const percent = total ? Math.round((correct / total) * 100) : 0;
    const modeLabel = state.mode === "quick" ? "3 случайных" : "по всем вопросам";

    const text = `ОГЭ 19 — результат ✅\nРежим: ${modeLabel}\nВерно: ${correct}/${total} (${percent}%)`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "ОГЭ 19 — результат", text });
        return;
      } catch {}
    }

    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(text)}`;
    window.open(tgUrl, "_blank", "noopener,noreferrer");
  }

  // ----- Events (safe) -----
  startQuick?.addEventListener("click", () => startMode("quick"));
  startFull?.addEventListener("click", () => startMode("full"));

  submitTicket?.addEventListener("click", checkTicket);
  nextTicket?.addEventListener("click", nextStep);

  resetBtn?.addEventListener("click", hardReset);
  tryAgain?.addEventListener("click", () => {
    if (!state.mode) showHome();
    else startMode(state.mode);
  });

  shareBtn?.addEventListener("click", shareResult);

  aboutOffline?.addEventListener("click", () => {
    alert("Офлайн режим включён: приложение кэширует файлы через Service Worker и работает без интернета.");
  });

  // ----- Bootstrap -----
  if (state.mode && state.ticket?.length) showTest();
  else showHome();
})();
