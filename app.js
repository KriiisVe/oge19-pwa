// app.js
(() => {
  const $ = (s) => document.querySelector(s);

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

  const installBtn = $("#installBtn");

  const LS_KEY = "oge19_state_v1";

  // ----- Data prep -----
  const bank = Array.isArray(window.QUESTIONS_BANK) ? window.QUESTIONS_BANK : [];
  if (!bank.length) console.warn("QUESTIONS_BANK пуст — добавь вопросы в questions.js");

  const bankTrue = bank.filter(x => x.isTrue);
  const bankFalse = bank.filter(x => !x.isTrue);

  // ----- PWA install prompt -----
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove("hidden");
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add("hidden");
  });

  // ----- State -----
  const defaultState = () => ({
    mode: null, // "quick" | "full"
    ticketIndex: 0,
    ticketsTotal: 0,

    // For full: we stop when every bank item was used at least once (as an option)
    usedIds: {},

    // Pools for selecting without repeats (when possible)
    poolTrue: [],
    poolFalse: [],

    // Current ticket questions
    ticket: [], // [{qid, kTrue, options:[{id,text,isTrue}], selectedIds:[], checked:false, isCorrect:false}]

    // Score
    correctQuestions: 0,
    answeredQuestions: 0,
    totalTargetQuestions: 0, // for quick: 3, for full: dynamic but roughly ceil(N/3)*3 questions shown; we count per question
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

  function takeFromPool(isTrue, count, avoidSet) {
    // take ids prioritizing unused, refilling when empty
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
    // kTrue is 1 or 2
    const kTrue = Math.random() < 0.5 ? 1 : 2;
    const avoid = new Set();

    refillPoolsIfNeeded();
    const trueIds = takeFromPool(true, kTrue, avoid);
    const falseIds = takeFromPool(false, 3 - kTrue, avoid);

    const options = shuffle([...trueIds, ...falseIds].map(id => {
      const item = getById(id);
      return { id: item.id, text: item.text, isTrue: item.isTrue };
    }));

    // track used for FULL mode (as options usage)
    if (state.mode === "full") {
      for (const o of options) state.usedIds[o.id] = true;
    }

    return {
      qid: cryptoRandomId(),
      kTrue,
      options,
      selectedIds: [],
      checked: false,
      isCorrect: null,
    };
  }

  function cryptoRandomId() {
    // small safe id
    if (crypto?.getRandomValues) {
      const b = new Uint32Array(1);
      crypto.getRandomValues(b);
      return "q" + b[0].toString(16);
    }
    return "q" + Math.random().toString(16).slice(2);
  }

  function makeTicket() {
    return [makeQuestion(), makeQuestion(), makeQuestion()];
  }

  function show(view) {
    home.classList.add("hidden");
    test.classList.add("hidden");
    result.classList.add("hidden");
    view.classList.remove("hidden");
  }

  function showHome() {
    show(home);
  }

  function showTest() {
    show(test);
    renderTicket();
  }

  function showResult() {
    show(result);
    renderResult();
  }

  // ----- Start modes -----
  function startMode(mode) {
    state = defaultState();
    state.mode = mode;

    // quick: ровно 1 билет (3 вопроса)
    if (mode === "quick") {
      state.ticketsTotal = 1;
      state.totalTargetQuestions = 3;
    }

    // full: идём билетами, пока не использовали все утверждения хотя бы раз
    if (mode === "full") {
      state.totalTargetQuestions = 0; // будем считать по факту
      state.usedIds = {};
    }

    state.ticketIndex = 0;
    state.ticket = makeTicket();
    saveState();
    showTest();
  }

  // ----- Rendering -----
  function renderTicket() {
    ticketResult.textContent = "";

    // ticket header
    if (state.mode === "quick") {
      ticketTitle.textContent = `Билет 1 из 1`;
    } else {
      // ticketsTotal заранее неизвестно — покажем "Билет N"
      ticketTitle.textContent = `Билет ${state.ticketIndex + 1}`;
    }

    // counts
    const totalAnswered = state.answeredQuestions;
    const totalCorrect = state.correctQuestions;
    scoreNow.textContent = `Верно сейчас: ${totalCorrect}/${Math.max(totalAnswered, 0)}`;

    // per-ticket: checked/required
    const checkedCount = state.ticket.filter(q => q.selectedIds.length > 0).length;
    ticketSub.textContent = `Отмечено: ${checkedCount}/3`;

    // buttons
    const allChecked = state.ticket.every(q => q.checked);
    submitTicket.classList.toggle("hidden", allChecked);
    nextTicket.classList.toggle("hidden", !allChecked);

    questionsWrap.innerHTML = "";

    state.ticket.forEach((q, idx) => {
      const card = document.createElement("div");
      card.className = "qCard";

      // after check: color state
      if (q.checked) {
        card.classList.add(q.isCorrect ? "stateOk" : "stateBad");
      }

      const head = document.createElement("div");
      head.className = "qHead";

      const title =
