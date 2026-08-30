(() => {
  "use strict";

  const BANK_TESTS = (window.BIOLOGY_BANK_TESTS || []).map((test) => ({ ...test, group: "bank" }));
  const ATC_TESTS = window.BIOLOGY_ATC_TESTS || [];
  const TESTS = [...BANK_TESTS, ...ATC_TESTS];
  const BANK_STATS = window.BIOLOGY_BANK_STATS || {};
  const ATC_STATS = window.BIOLOGY_ATC_STATS || {};
  const STORAGE_KEY = "biology-practice-test-v3";
  const HISTORY_KEY = "biology-practice-history-v1";
  const TEST_DURATION_MS = 3 * 60 * 60 * 1000;
  let QUESTIONS = [];

  const app = document.querySelector("#app");
  const headerActions = document.querySelector("#headerActions");
  const toast = document.querySelector("#toast");
  const finishDialog = document.querySelector("#finishDialog");
  const finishDialogText = document.querySelector("#finishDialogText");
  const confirmFinish = document.querySelector("#confirmFinish");

  let toastTimer;
  let clockTimer;
  let state = loadState();

  function freshState() {
    return {
      mode: "start",
      selectedGroup: "bank",
      selectedTestId: null,
      currentIndex: 0,
      reviewIndex: 0,
      answers: {},
      shuffledOptions: {},
      startedAt: null,
      deadline: null,
      finishedAt: null,
      historySaved: false,
    };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || typeof parsed !== "object") return freshState();
      return { ...freshState(), ...parsed };
    } catch {
      return freshState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY));
      return Array.isArray(history) ? history : [];
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function activeTest() {
    return TESTS.find((test) => test.id === state.selectedTestId)
      || TESTS.find((test) => test.group === state.selectedGroup)
      || TESTS[0];
  }

  function syncQuestions() {
    const test = activeTest();
    QUESTIONS = test?.questions || [];
    if (test && state.selectedTestId !== test.id) state.selectedTestId = test.id;
    if (test) state.selectedGroup = test.group;
  }

  function shuffle(items) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [output[index], output[target]] = [output[target], output[index]];
    }
    return output;
  }

  function shuffleDifferently(items, previousOrder = []) {
    const output = shuffle(items);
    const matchesPrevious = output.length > 1
      && previousOrder.length === output.length
      && output.every((item, index) => item === previousOrder[index]);
    if (matchesPrevious) [output[0], output[1]] = [output[1], output[0]];
    return output;
  }

  function decodeOptionOrders(attempt, test) {
    return Object.fromEntries(test.questions
      .filter((question) => Array.isArray(question.options))
      .map((question) => {
        const order = attempt?.optionOrders?.[question.id];
        const options = Array.isArray(order) && order.length === question.options.length
          ? order.map((index) => question.options[index]).filter((option) => option !== undefined)
          : question.options;
        return [question.id, options.length === question.options.length ? options : question.options];
      }));
  }

  function encodeOptionOrders() {
    return Object.fromEntries(QUESTIONS
      .filter((question) => Array.isArray(question.options))
      .map((question) => [
        question.id,
        (state.shuffledOptions[question.id] || question.options).map((option) => question.options.indexOf(option)),
      ]));
  }

  function encodeAnswers() {
    return Object.fromEntries(QUESTIONS.flatMap((question) => {
      const answer = state.answers[question.id];
      if (answer === undefined || answer === null || answer === "" || Array.isArray(answer) && !answer.length) return [];
      if (question.type === "choice") return [[question.id, { kind: "option", value: question.options.indexOf(answer) }]];
      if (question.type === "multiple") return [[question.id, { kind: "multiple", value: answer.map((option) => question.options.indexOf(option)) }]];
      return [[question.id, { kind: "text", value: String(answer) }]];
    }));
  }

  function decodeAnswers(attempt, test) {
    const questions = new Map(test.questions.map((question) => [String(question.id), question]));
    return Object.fromEntries(Object.entries(attempt.answers || {}).flatMap(([id, encoded]) => {
      const question = questions.get(String(id));
      if (!question || !encoded || typeof encoded !== "object") return [];
      if (encoded.kind === "option") return [[id, question.options?.[encoded.value] ?? ""]];
      if (encoded.kind === "multiple") return [[id, (encoded.value || []).map((index) => question.options?.[index]).filter(Boolean)]];
      return [[id, encoded.value ?? ""]];
    }));
  }

  function startNewTest(testId = state.selectedTestId || TESTS[0]?.id) {
    const previousAttempt = loadHistory().find((attempt) => attempt.testId === testId);
    const now = Date.now();
    state = {
      ...freshState(),
      mode: "test",
      selectedTestId: testId,
      startedAt: now,
      deadline: now + TEST_DURATION_MS,
    };
    syncQuestions();
    const previousOrders = decodeOptionOrders(previousAttempt, activeTest());
    state.shuffledOptions = Object.fromEntries(
      QUESTIONS.filter((question) => Array.isArray(question.options)).map((question) => [
        question.id,
        shuffleDifferently(question.options, previousOrders[question.id]),
      ])
    );
    saveState();
    render();
    showToast("Նոր թեստը սկսված է։ Պատասխանների հերթականությունը խառնված է։");
  }

  function escapeHTML(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function answeredCount() {
    return QUESTIONS.filter((question) => {
      const answer = state.answers[question.id];
      return Array.isArray(answer) ? answer.length > 0 : String(answer ?? "").trim() !== "";
    }).length;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function formatTime(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
  }

  function updateTimer() {
    const timer = document.querySelector("#timer");
    if (!timer || !state.deadline) return;
    const remaining = state.deadline - Date.now();
    timer.textContent = formatTime(remaining);
    if (remaining <= 0 && state.mode === "test") finishTest(true);
  }

  function beginClock() {
    clearInterval(clockTimer);
    if (state.mode !== "test") return;
    updateTimer();
    clockTimer = window.setInterval(updateTimer, 1000);
  }

  function renderHeader() {
    if (state.mode === "test") {
      headerActions.innerHTML = `
        <span class="timer" id="timer">${formatTime((state.deadline || Date.now()) - Date.now())}</span>
        <button class="button button-danger" id="finishButton">Ավարտել</button>
      `;
      document.querySelector("#finishButton").addEventListener("click", openFinishDialog);
    } else if (state.mode === "review") {
      headerActions.innerHTML = `<button class="button button-secondary" id="backToResults">Արդյունքներ</button>`;
      document.querySelector("#backToResults").addEventListener("click", () => {
        state.mode = "results";
        saveState();
        render();
      });
    } else {
      headerActions.innerHTML = "";
    }
  }

  function formatAttemptDate(timestamp) {
    try {
      return new Intl.DateTimeFormat("hy-AM", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toLocaleString();
    }
  }

  function renderHistoryMarkup() {
    const history = loadHistory();
    if (!history.length) {
      return `
        <section class="history-card history-empty">
          <div><p class="eyebrow">Արդյունքների պատմություն</p><h2>Ավարտված փորձեր դեռ չկան</h2></div>
          <p>Յուրաքանչյուր ավարտված թեստ այստեղ կպահվի առանձին, ներառյալ նույն տարբերակի կրկնակի փորձերը։</p>
        </section>
      `;
    }
    return `
      <section class="history-card">
        <div class="history-head">
          <div><p class="eyebrow">Արդյունքների պատմություն</p><h2>Ձեր նախորդ փորձերը</h2></div>
          <span>${history.length} ավարտված թեստ</span>
        </div>
        <div class="history-list">
          ${history.map((attempt) => `
            <article class="history-item">
              <div class="history-score"><strong>${escapeHTML(attempt.percent)}%</strong><span>${escapeHTML(attempt.totalCorrect)} / ${escapeHTML(attempt.total)} ճիշտ</span></div>
              <div class="history-copy">
                <strong>${escapeHTML(attempt.testTitle)}</strong>
                <span>${escapeHTML(formatAttemptDate(attempt.finishedAt))} · ${escapeHTML(formatTime(attempt.finishedAt - attempt.startedAt))}</span>
              </div>
              <button class="button button-secondary history-open" data-attempt-id="${escapeHTML(attempt.id)}">Դիտել արդյունքը</button>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function openHistoryAttempt(attemptId) {
    const attempt = loadHistory().find((item) => item.id === attemptId);
    const test = TESTS.find((item) => item.id === attempt?.testId);
    if (!attempt || !test) {
      showToast("Այս փորձի թեստն այլևս հասանելի չէ։");
      return;
    }
    state = {
      ...freshState(),
      mode: "results",
      selectedGroup: test.group,
      selectedTestId: test.id,
      answers: decodeAnswers(attempt, test),
      shuffledOptions: decodeOptionOrders(attempt, test),
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      historySaved: true,
    };
    saveState();
    render();
  }

  function renderStart() {
    const selectedTest = activeTest();
    const selectedGroup = selectedTest?.group || state.selectedGroup || "bank";
    const groupTests = TESTS.filter((test) => test.group === selectedGroup);
    const selectedId = groupTests.some((test) => test.id === selectedTest?.id) ? selectedTest.id : groupTests[0]?.id;
    const isOfficial = selectedGroup === "atc";
    const testButtons = groupTests.map((test, index) => `
      <button class="variant-button ${isOfficial ? "official-variant" : ""} ${test.id === selectedId ? "selected" : ""}" data-test-id="${test.id}" aria-pressed="${test.id === selectedId}">
        <span>${isOfficial ? escapeHTML(test.shortTitle || test.title) : index + 1}</span>
      </button>
    `).join("");
    const facts = isOfficial
      ? [
          [ATC_STATS.tests || ATC_TESTS.length, "պաշտոնական թեստ"],
          [ATC_STATS.years?.join(", ") || "2024–2025", "քննական տարիներ"],
          ["70 / 80", "առաջադրանք / գնահատվող պատասխան"],
        ]
      : [
          [BANK_STATS.tests || BANK_TESTS.length, "շտեմարանի տարբերակ"],
          [BANK_STATS.choiceQuestions || "—", "շտեմարանի ընտրովի հարց"],
          [BANK_STATS.shortQuestions || "—", "կարճ պատասխանով խնդիր"],
        ];
    app.innerHTML = `
      <section class="start-layout">
        <div class="start-stack">
          <div class="start-card">
          <div class="start-hero">
            <p class="eyebrow">Կենսաբանության թեստեր</p>
            <h1>Ընտրեք աղբյուրը և թեստային տարբերակը</h1>
            <p>Շտեմարանի կազմված տարբերակները և ԳԹԿ-ի իրական քննությունները պահվում են առանձին խմբերով։</p>
          </div>
          <div class="start-body">
            <div class="source-tabs" role="tablist" aria-label="Թեստերի աղբյուր">
              <button class="source-tab ${selectedGroup === "bank" ? "selected" : ""}" data-group="bank" role="tab" aria-selected="${selectedGroup === "bank"}">
                <strong>Շտեմարան</strong><span>86 կազմված տարբերակ</span>
              </button>
              <button class="source-tab ${selectedGroup === "atc" ? "selected" : ""}" data-group="atc" role="tab" aria-selected="${selectedGroup === "atc"}">
                <strong>ԳԹԿ պաշտոնական</strong><span>2024–2025 քննություններ</span>
              </button>
            </div>
            <div class="test-facts">
              ${facts.map(([value, label]) => `<div class="fact"><strong>${escapeHTML(value)}</strong><span>${escapeHTML(label)}</span></div>`).join("")}
            </div>
            <div class="variant-picker">
              <div class="variant-picker-head">
                <div><strong>Ընտրեք տարբերակը</strong><span id="selectedVariantLabel">${escapeHTML(groupTests.find((test) => test.id === selectedId)?.title || "")}</span></div>
                <span>${isOfficial ? "70 առաջադրանք · 80 գնահատվող պատասխան" : "60 հարց · 3 ժամ"}</span>
              </div>
              <div class="variant-grid ${isOfficial ? "official-grid" : ""}" role="group" aria-label="Թեստային տարբերակներ">${testButtons}</div>
            </div>
            <button class="button button-primary button-large" id="startTest">Սկսել ընտրված թեստը</button>
            <p class="bank-note">${isOfficial
              ? "Այս խմբում միայն ԳԹԿ-ի հրապարակած քննաթերթերն ու վերջնական պատասխաններն են։ Պահպանված են համապատասխանեցման, հերթականության, բազմընտրության և ճիշտ/սխալ ձևաչափերը։"
              : "Այս խմբի բոլոր հարցերը վերցված են կենսաբանության շտեմարանի 1–4 մասերից։ Ընտրովի պատասխանների տեղերը խառնվում են թեստը սկսելիս։"}</p>
          </div>
          </div>
          ${renderHistoryMarkup()}
        </div>
      </section>
    `;
    document.querySelectorAll(".source-tab").forEach((button) => {
      button.addEventListener("click", () => {
        const group = button.dataset.group;
        const firstTest = TESTS.find((test) => test.group === group);
        state.selectedGroup = group;
        state.selectedTestId = firstTest?.id || null;
        saveState();
        render();
      });
    });
    document.querySelectorAll(".variant-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedTestId = button.dataset.testId;
        state.selectedGroup = activeTest().group;
        saveState();
        document.querySelectorAll(".variant-button").forEach((item) => {
          const selected = item === button;
          item.classList.toggle("selected", selected);
          item.setAttribute("aria-pressed", String(selected));
        });
        document.querySelector("#selectedVariantLabel").textContent = activeTest().title;
      });
    });
    document.querySelector("#startTest").addEventListener("click", () => startNewTest(state.selectedTestId || selectedId));
    document.querySelectorAll(".history-open").forEach((button) => {
      button.addEventListener("click", () => openHistoryAttempt(button.dataset.attemptId));
    });
  }

  function renderSource(question) {
    if (!question.source) return "";
    if (question.source.kind === "atc") {
      return `<p class="source-label official-source">ԳԹԿ · ${escapeHTML(question.source.year)} · ${escapeHTML(question.source.phase)} · Թեստ ${escapeHTML(question.source.variant)} · Առաջադրանք ${escapeHTML(question.source.question)} · <a href="${escapeHTML(question.source.sourceUrl)}" target="_blank" rel="noopener">քննաթերթ</a> · <a href="${escapeHTML(question.source.answerKeyUrl)}" target="_blank" rel="noopener">պատասխաններ</a></p>`;
    }
    return `<p class="source-label">Շտեմարան · Մաս ${question.source.part} · ${escapeHTML(question.source.topicName)} · Առաջադրանք ${escapeHTML(question.source.question)}</p>`;
  }

  function renderQuestionNav(mode = "test") {
    const answered = answeredCount();
    const progress = Math.round((answered / QUESTIONS.length) * 100);
    const dots = QUESTIONS.map((question, index) => {
      const hasAnswer = String(state.answers[question.id] ?? "").trim() !== "";
      const current = index === (mode === "review" ? state.reviewIndex : state.currentIndex);
      let classes = "question-dot";
      if (mode === "review") classes += isCorrect(question) ? " correct" : " incorrect";
      else if (hasAnswer) classes += " answered";
      if (current) classes += " current";
      return `<button class="${classes}" data-index="${index}" aria-label="Առաջադրանք ${question.id}">${question.id}</button>`;
    }).join("");

    return `
      <aside class="question-nav">
        <div class="nav-summary">
          <div class="nav-summary-row"><strong>${mode === "review" ? "Պատասխանների ստուգում" : "Առաջընթաց"}</strong><span>${answered}/${QUESTIONS.length}</span></div>
          <div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div>
        </div>
        <div class="question-list">${dots}</div>
      </aside>
    `;
  }

  function renderMedia(question) {
    if (question.images) {
      return `<div class="question-images">${question.images.map((src, index) => `<img src="${src}" alt="Առաջադրանք ${question.id}, գծապատկեր ${index + 1}" />`).join("")}</div>`;
    }
    if (question.image) {
      return `<img class="question-image ${question.source?.visualPages ? "page-scan" : ""}" src="${question.image}" alt="Առաջադրանք ${question.id}-ի գծապատկերը" />`;
    }
    return "";
  }

  function renderOptions(question, review = false) {
    const options = state.shuffledOptions[question.id] || question.options;
    const userAnswer = state.answers[question.id];
    return `<div class="options">${options.map((option) => {
      const selected = userAnswer === option;
      let classes = "option";
      if (selected) classes += " selected";
      if (review && option === question.correct) classes += " correct-option";
      if (review && selected && option !== question.correct) classes += " wrong-option";
      return `
        <label class="${classes}">
          <input type="radio" name="question-${question.id}" value="${escapeHTML(option)}" ${selected ? "checked" : ""} ${review ? "disabled" : ""} />
          <span class="option-marker">✓</span>
          <span class="option-text">${escapeHTML(option)}</span>
        </label>
      `;
    }).join("")}</div>`;
  }

  function renderMultipleOptions(question, review = false) {
    const options = state.shuffledOptions[question.id] || question.options;
    const userAnswers = Array.isArray(state.answers[question.id]) ? state.answers[question.id] : [];
    return `<div class="options">${options.map((option) => {
      const selected = userAnswers.includes(option);
      const isAnswer = question.correct.includes(option);
      let classes = "option multi-option";
      if (selected) classes += " selected";
      if (review && isAnswer) classes += " correct-option";
      if (review && selected && !isAnswer) classes += " wrong-option";
      return `
        <label class="${classes}">
          <input type="checkbox" name="question-${question.id}" value="${escapeHTML(option)}" ${selected ? "checked" : ""} ${review ? "disabled" : ""} />
          <span class="option-marker">✓</span>
          <span class="option-text">${escapeHTML(option)}</span>
        </label>
      `;
    }).join("")}</div>`;
  }

  function questionTypeLabel(question) {
    if (question.type === "choice") return "Ընտրովի պատասխան";
    if (question.type === "multiple") return "Մի քանի ճիշտ պատասխան";
    if (question.answerMode === "set") return "Համարների բազմություն";
    return "Գրավոր պատասխան";
  }

  function renderTest() {
    const question = QUESTIONS[state.currentIndex] || QUESTIONS[0];
    state.currentIndex = Math.max(0, Math.min(QUESTIONS.length - 1, state.currentIndex));
    const currentAnswer = state.answers[question.id];
    const answered = Array.isArray(currentAnswer) ? currentAnswer.length > 0 : String(currentAnswer ?? "").trim() !== "";
    const typeLabel = questionTypeLabel(question);
    const input = question.type === "choice"
      ? renderOptions(question)
      : question.type === "multiple"
        ? `${renderMultipleOptions(question)}<p class="input-help">Նշեք բոլոր ճիշտ տարբերակները։</p>`
        : `
          <textarea class="answer-input" id="shortAnswer" placeholder="${escapeHTML(question.placeholder || "Մուտքագրեք պատասխանը")}">${escapeHTML(state.answers[question.id] || "")}</textarea>
          <p class="input-help">${question.answerMode === "set" ? "Համարները կարող եք գրել ցանկացած հերթականությամբ՝ բաժանելով ստորակետով։" : "Հաջորդականության դեպքում համարների կարգը կարևոր է։"}</p>
        `;

    app.innerHTML = `
      <section class="test-layout">
        ${renderQuestionNav("test")}
        <article class="question-panel">
          <div class="question-panel-head">
            <div>
              <p class="question-kicker">Առաջադրանք ${question.id} / ${QUESTIONS.length}</p>
              <h1>${escapeHTML(question.prompt)}</h1>
            </div>
            <span class="type-badge">${typeLabel}</span>
          </div>
          <div class="question-content">
            ${renderSource(question)}
            ${question.context ? `<div class="question-context">${escapeHTML(question.context)}</div>` : ""}
            ${renderMedia(question)}
            ${input}
          </div>
          <footer class="question-footer">
            <span class="save-state">${answered ? "✓ Պատասխանը պահպանված է" : "Պատասխան դեռ չկա"}</span>
            <div class="footer-group">
              <button class="button button-secondary" id="previousQuestion" ${state.currentIndex === 0 ? "disabled" : ""}>Նախորդը</button>
              <button class="button button-primary" id="nextQuestion">${state.currentIndex === QUESTIONS.length - 1 ? "Ավարտել" : "Հաջորդը"}</button>
            </div>
          </footer>
        </article>
      </section>
    `;

    bindQuestionNavigation("test");
    document.querySelector("#previousQuestion").addEventListener("click", () => goToQuestion(state.currentIndex - 1));
    document.querySelector("#nextQuestion").addEventListener("click", () => {
      saveVisibleShortAnswer();
      if (state.currentIndex === QUESTIONS.length - 1) openFinishDialog();
      else goToQuestion(state.currentIndex + 1);
    });

    document.querySelectorAll(`input[name="question-${question.id}"]`).forEach((inputNode) => {
      inputNode.addEventListener("change", () => {
        if (question.type === "multiple") {
          state.answers[question.id] = [...document.querySelectorAll(`input[name="question-${question.id}"]:checked`)].map((node) => node.value);
        } else {
          state.answers[question.id] = inputNode.value;
        }
        saveState();
        showToast("Պատասխանը պահպանված է");
        renderTest();
      });
    });

    const shortAnswer = document.querySelector("#shortAnswer");
    if (shortAnswer) {
      shortAnswer.addEventListener("input", () => {
        state.answers[question.id] = shortAnswer.value;
        saveState();
      });
      shortAnswer.addEventListener("blur", () => showToast("Պատասխանը պահպանված է"));
    }
  }

  function saveVisibleShortAnswer() {
    const question = QUESTIONS[state.currentIndex];
    const input = document.querySelector("#shortAnswer");
    if (question?.type === "short" && input) {
      state.answers[question.id] = input.value;
      saveState();
    }
  }

  function goToQuestion(index) {
    saveVisibleShortAnswer();
    state.currentIndex = Math.max(0, Math.min(QUESTIONS.length - 1, index));
    saveState();
    renderTest();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindQuestionNavigation(mode) {
    document.querySelectorAll(".question-dot").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);
        if (mode === "review") {
          state.reviewIndex = index;
          saveState();
          renderReview();
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          goToQuestion(index);
        }
      });
    });
  }

  function openFinishDialog() {
    saveVisibleShortAnswer();
    const unanswered = QUESTIONS.length - answeredCount();
    finishDialogText.textContent = unanswered
      ? `Դուք ունեք ${unanswered} անպատասխան առաջադրանք։ Ավարտելուց հետո պատասխանները փոխել հնարավոր չի լինի։`
      : "Բոլոր առաջադրանքները պատասխանված են։ Ավարտելուց հետո կտեսնեք մանրամասն արդյունքները։";
    finishDialog.showModal();
  }

  confirmFinish.addEventListener("click", () => finishTest(false));

  function saveFinishedAttempt() {
    if (state.historySaved) return;
    const test = activeTest();
    const score = scoreSummary();
    const attempt = {
      id: `${state.finishedAt}-${Math.random().toString(36).slice(2, 10)}`,
      testId: test.id,
      testTitle: test.title,
      group: test.group,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      total: QUESTIONS.length,
      totalCorrect: score.totalCorrect,
      percent: score.percent,
      choiceCorrect: score.choiceCorrect,
      choiceTotal: score.choiceTotal,
      shortCorrect: score.shortCorrect,
      shortTotal: score.shortTotal,
      answers: encodeAnswers(),
      optionOrders: encodeOptionOrders(),
    };
    const history = loadHistory();
    history.unshift(attempt);
    saveHistory(history.slice(0, 200));
    state.historySaved = true;
  }

  function finishTest(fromTimer) {
    saveVisibleShortAnswer();
    state.finishedAt = Date.now();
    saveFinishedAttempt();
    state.mode = "results";
    saveState();
    finishDialog.close();
    render();
    if (fromTimer) showToast("Ժամանակը ավարտվել է։ Թեստը փակվեց ավտոմատ։");
  }

  function answerTokens(value) {
    const westernArmenianDigits = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
    const normalizedDigits = String(value ?? "").replace(/[٠-٩]/g, (digit) => westernArmenianDigits[digit]);
    return normalizedDigits.match(/\d+(?:[.,]\d+)?/g)?.map((token) => token.replace(",", ".").replace(/^0+(?=\d)/, "")) || [];
  }

  function normalizeAnswer(question, value) {
    const tokens = answerTokens(value);
    if (question.answerMode === "set") return tokens.sort((a, b) => Number(a) - Number(b)).join(",");
    if (tokens.length) return tokens.join(",");
    return String(value ?? "").trim().toLocaleLowerCase("hy-AM").replace(/\s+/g, " ");
  }

  function isCorrect(question) {
    const answer = state.answers[question.id];
    if (question.acceptAny) return Array.isArray(answer) ? answer.length > 0 : String(answer ?? "").trim() !== "";
    if (question.type === "choice") return answer === question.correct;
    if (question.type === "multiple") {
      const selected = Array.isArray(answer) ? [...answer].sort() : [];
      return selected.length === question.correct.length && selected.every((value, index) => value === [...question.correct].sort()[index]);
    }
    return normalizeAnswer(question, answer) === normalizeAnswer(question, question.correct);
  }

  function scoreSummary() {
    const choiceQuestions = QUESTIONS.filter((question) => question.type === "choice" || question.type === "multiple");
    const shortQuestions = QUESTIONS.filter((question) => question.type === "short");
    const choiceCorrect = choiceQuestions.filter(isCorrect).length;
    const shortCorrect = shortQuestions.filter(isCorrect).length;
    return {
      choiceCorrect,
      shortCorrect,
      choiceTotal: choiceQuestions.length,
      shortTotal: shortQuestions.length,
      totalCorrect: choiceCorrect + shortCorrect,
      percent: Math.round(((choiceCorrect + shortCorrect) / QUESTIONS.length) * 100),
    };
  }

  function renderResults() {
    const score = scoreSummary();
    app.innerHTML = `
      <section class="results-wrap">
        <div class="results-hero">
          <div class="results-head">
            <div>
              <p class="eyebrow">Թեստն ավարտված է</p>
              <h1>Ձեր արդյունքը</h1>
              <p>Դիտեք յուրաքանչյուր առաջադրանքի ճիշտ պատասխանը և համեմատեք ձեր ընտրության հետ։</p>
            </div>
            <div class="score-ring"><div><strong>${score.percent}%</strong><span>${score.totalCorrect} / ${QUESTIONS.length} ճիշտ</span></div></div>
          </div>
        </div>
        <div class="result-stats">
          <div class="result-stat"><strong>${score.choiceCorrect}/${score.choiceTotal}</strong><span>ընտրությամբ պատասխաններ</span></div>
          <div class="result-stat"><strong>${score.shortCorrect}/${score.shortTotal}</strong><span>գրավոր պատասխաններ</span></div>
          <div class="result-stat"><strong>${QUESTIONS.length - score.totalCorrect}</strong><span>սխալ կամ բաց թողնված</span></div>
        </div>
        <div class="result-actions">
          <button class="button button-primary" id="reviewAnswers">Դիտել պատասխանները</button>
          <button class="button button-secondary" id="newTest">Ընտրել այլ տարբերակ</button>
        </div>
      </section>
    `;
    document.querySelector("#reviewAnswers").addEventListener("click", () => {
      state.mode = "review";
      state.reviewIndex = 0;
      saveState();
      render();
    });
    document.querySelector("#newTest").addEventListener("click", () => {
      const selectedTestId = state.selectedTestId;
      state = { ...freshState(), selectedTestId };
      saveState();
      render();
    });
  }

  function renderReview() {
    const question = QUESTIONS[state.reviewIndex] || QUESTIONS[0];
    const correct = isCorrect(question);
    const rawUserAnswer = state.answers[question.id];
    const userAnswer = Array.isArray(rawUserAnswer) ? rawUserAnswer.join(", ") : String(rawUserAnswer ?? "").trim();
    const typeLabel = questionTypeLabel(question);
    let answerReview;

    if (question.type === "choice") {
      answerReview = renderOptions(question, true);
    } else if (question.type === "multiple") {
      answerReview = renderMultipleOptions(question, true);
    } else {
      answerReview = `
        <div class="review-answer-boxes">
          <div class="review-answer ${correct ? "user-correct" : "user-wrong"}">
            <span>Ձեր պատասխանը</span>
            <strong class="${userAnswer ? "" : "empty-answer"}">${escapeHTML(userAnswer || "Պատասխան չկա")}</strong>
          </div>
          <div class="review-answer correct-answer">
            <span>Ճիշտ պատասխանը</span>
            <strong>${escapeHTML(question.correct)}</strong>
          </div>
        </div>
      `;
    }

    app.innerHTML = `
      <section class="review-layout">
        ${renderQuestionNav("review")}
        <article class="question-panel">
          <div class="question-panel-head">
            <div>
              <p class="question-kicker">Պատասխանի ստուգում · ${question.id}/${QUESTIONS.length}</p>
              <h2>${escapeHTML(question.prompt)}</h2>
              <span class="status-label ${correct ? "correct" : "incorrect"}">${correct ? "✓ Ճիշտ պատասխան" : "× Սխալ պատասխան"}</span>
            </div>
            <span class="type-badge">${typeLabel}</span>
          </div>
          <div class="question-content">
            ${renderSource(question)}
            ${question.context ? `<div class="question-context">${escapeHTML(question.context)}</div>` : ""}
            ${renderMedia(question)}
            ${answerReview}
          </div>
          <footer class="question-footer">
            <span class="save-state">${question.acceptAny ? "ԳԹԿ-ի վերջնական բանալով այս առաջադրանքի ցանկացած նշված պատասխան ընդունվում է։" : correct ? "Պատասխանը ճիշտ է" : "Ճիշտ պատասխանը նշված է կանաչով"}</span>
            <div class="footer-group">
              <button class="button button-secondary" id="previousReview" ${state.reviewIndex === 0 ? "disabled" : ""}>Նախորդը</button>
              <button class="button button-primary" id="nextReview">${state.reviewIndex === QUESTIONS.length - 1 ? "Արդյունքներ" : "Հաջորդը"}</button>
            </div>
          </footer>
        </article>
      </section>
    `;
    bindQuestionNavigation("review");
    document.querySelector("#previousReview").addEventListener("click", () => {
      state.reviewIndex = Math.max(0, state.reviewIndex - 1);
      saveState();
      renderReview();
    });
    document.querySelector("#nextReview").addEventListener("click", () => {
      if (state.reviewIndex === QUESTIONS.length - 1) {
        state.mode = "results";
        saveState();
        render();
      } else {
        state.reviewIndex += 1;
        saveState();
        renderReview();
      }
    });
  }

  function render() {
    syncQuestions();
    if (!TESTS.length) {
      app.innerHTML = `<p>Թեստերի տվյալները չեն բեռնվել։</p>`;
      return;
    }
    if (!QUESTIONS.length) return;
    renderHeader();
    if (state.mode === "test") renderTest();
    else if (state.mode === "results") renderResults();
    else if (state.mode === "review") renderReview();
    else renderStart();
    beginClock();
  }

  render();
})();
