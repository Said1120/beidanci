(function () {
  const STORAGE_KEY = "zhongkao-vocab-app-v1";
  const STATUS_LABELS = {
    new: "未学习",
    known: "会",
    unknown: "不会",
    fuzzy: "模糊"
  };
  const SESSION_LABELS = {
    recite: "背诵",
    test: "测试"
  };
  const SCOPE_LABELS = {
    today: "今日单词",
    review: "今日建议复习",
    wrong: "错词/生词",
    fuzzy: "模糊词",
    all: "全部单词"
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const today = getToday();

  let state = loadState();
  let currentView = "dashboard";
  let importPreview = null;
  let selectedTestMode = "enToZh";
  let reciteSession = null;
  let testSession = null;

  init();

  function init() {
    migrateState();
    $("#todayText").textContent = today;
    $("#importDate").value = today;
    bindEvents();
    renderAll();
  }

  function bindEvents() {
    $$("[data-nav]").forEach((button) => {
      button.addEventListener("click", () => showView(button.dataset.nav));
    });

    document.body.addEventListener("click", (event) => {
      const goto = event.target.closest("[data-goto]");
      if (goto) {
        showView(goto.dataset.goto);
        return;
      }

      const reciteStarter = event.target.closest("[data-start-reciting]");
      if (reciteStarter) {
        const scope = reciteStarter.dataset.startReciting;
        showView("recite");
        $("#reciteScope").value = scope;
        startRecite(scope);
        return;
      }

      const testStarter = event.target.closest("[data-start-testing]");
      if (testStarter) {
        const scope = testStarter.dataset.startTesting;
        showView("test");
        $("#testScope").value = scope;
        startTest(scope);
        return;
      }

      const editButton = event.target.closest("[data-edit-id]");
      if (editButton) {
        openWordDialog(editButton.dataset.editId);
        return;
      }

      const deleteButton = event.target.closest("[data-delete-id]");
      if (deleteButton) {
        deleteWord(deleteButton.dataset.deleteId);
        return;
      }

      const masterButton = event.target.closest("[data-master-id]");
      if (masterButton) {
        markMastered(masterButton.dataset.masterId);
        return;
      }

      const deleteBatchButton = event.target.closest("[data-delete-batch-id]");
      if (deleteBatchButton) {
        deleteImportBatch(deleteBatchButton.dataset.deleteBatchId);
      }
    });

    document.body.addEventListener("change", (event) => {
      if (event.target.matches("[data-inline-status]")) {
        updateWordStatus(event.target.dataset.inlineStatus, event.target.value);
      }
    });

    $("#parseImportBtn").addEventListener("click", parseImport);
    $("#clearImportBtn").addEventListener("click", clearImport);
    $("#confirmImportBtn").addEventListener("click", confirmImport);
    $("#startReciteBtn").addEventListener("click", () => startRecite($("#reciteScope").value));
    $("#revealMeaningBtn").addEventListener("click", revealReciteMeaning);
    $("#prevReciteBtn").addEventListener("click", () => moveRecite(-1));
    $("#nextReciteBtn").addEventListener("click", () => moveRecite(1));

    $$("[data-recitetag]").forEach((button) => {
      button.addEventListener("click", () => chooseReciteStatus(button.dataset.recitetag));
    });

    $$(".mode-button").forEach((button) => {
      button.addEventListener("click", () => {
        selectedTestMode = button.dataset.testMode;
        $$(".mode-button").forEach((item) => item.classList.toggle("active", item === button));
        if (testSession) {
          startTest($("#testScope").value);
        }
      });
    });

    $("#startTestBtn").addEventListener("click", () => startTest($("#testScope").value));
    $("#showTestAnswerBtn").addEventListener("click", showTestAnswer);
    $$("[data-testtag]").forEach((button) => {
      button.addEventListener("click", () => judgeEnToZh(button.dataset.testtag));
    });
    $("#submitAnswerBtn").addEventListener("click", submitTypedAnswer);
    $("#markFuzzyBtn").addEventListener("click", markTypedFuzzy);
    $("#nextTestBtn").addEventListener("click", moveToNextTestQuestion);
    $("#answerInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitTypedAnswer();
      }
    });

    $("#searchInput").addEventListener("input", renderWordbook);
    $("#filterDate").addEventListener("change", renderWordbook);
    $("#filterStatus").addEventListener("change", renderWordbook);
    $("#addWordBtn").addEventListener("click", () => openWordDialog());
    $("#wordForm").addEventListener("submit", saveDialogWord);
    $("#closeDialogBtn").addEventListener("click", closeWordDialog);
    $("#cancelEditBtn").addEventListener("click", closeWordDialog);

    $("#exportJsonBtn").addEventListener("click", exportJson);
    $("#importJsonInput").addEventListener("change", importJsonBackup);
    $("#exportWrongTextBtn").addEventListener("click", exportWrongText);
    $("#exportTodayUnknownBtn").addEventListener("click", exportTodayUnknownText);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { version: 2, words: [], sessions: [], importBatches: [] };
      }
      const parsed = JSON.parse(raw);
      return {
        version: 2,
        words: Array.isArray(parsed.words) ? parsed.words.map(normalizeWordRecord) : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        importBatches: Array.isArray(parsed.importBatches) ? parsed.importBatches.map(normalizeImportBatch) : []
      };
    } catch (error) {
      console.warn("Failed to load local data", error);
      return { version: 2, words: [], sessions: [], importBatches: [] };
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const saveState = $("#saveState");
    saveState.textContent = "已保存";
    window.setTimeout(() => {
      saveState.textContent = "本地保存";
    }, 900);
  }

  function normalizeWordRecord(word) {
    return {
      id: word.id || createId(),
      english: cleanEnglishValue(word.english),
      meaning: String(word.meaning || "").trim(),
      date: word.date || today,
      status: STATUS_LABELS[word.status] ? word.status : "new",
      wrongCount: Number(word.wrongCount || 0),
      correctCount: Number(word.correctCount || 0),
      lastReviewed: word.lastReviewed || null,
      note: String(word.note || ""),
      importBatchId: word.importBatchId || "",
      createdAt: word.createdAt || new Date().toISOString(),
      updatedAt: word.updatedAt || new Date().toISOString()
    };
  }

  function normalizeImportBatch(batch) {
    return {
      id: batch.id || createId(),
      date: batch.date || today,
      name: String(batch.name || ""),
      createdAt: batch.createdAt || new Date().toISOString()
    };
  }

  function migrateState() {
    let changed = false;
    if (!Array.isArray(state.importBatches)) {
      state.importBatches = [];
      changed = true;
    }

    const batchMap = new Map(state.importBatches.map((batch) => [batch.id, batch]));
    const legacyDates = new Set();

    state.words.forEach((word) => {
      if (!word.importBatchId) {
        word.importBatchId = `legacy-${word.date}`;
        legacyDates.add(word.date);
        changed = true;
      }
    });

    legacyDates.forEach((date) => {
      const id = `legacy-${date}`;
      if (!batchMap.has(id)) {
        const words = state.words.filter((word) => word.importBatchId === id);
        state.importBatches.push({
          id,
          date,
          name: `旧导入 ${date}`,
          createdAt: words.map((word) => word.createdAt).sort()[0] || new Date().toISOString()
        });
        batchMap.set(id, state.importBatches[state.importBatches.length - 1]);
        changed = true;
      }
    });

    state.words.forEach((word) => {
      if (word.importBatchId && !batchMap.has(word.importBatchId)) {
        state.importBatches.push({
          id: word.importBatchId,
          date: word.date,
          name: `导入 ${word.date}`,
          createdAt: word.createdAt || new Date().toISOString()
        });
        batchMap.set(word.importBatchId, state.importBatches[state.importBatches.length - 1]);
        changed = true;
      }
    });

    state.version = 2;
    if (changed) {
      persist();
    }
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `word_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function getToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function showView(viewName) {
    currentView = viewName;
    $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
    $$("[data-nav]").forEach((button) => button.classList.toggle("active", button.dataset.nav === viewName));
    if (viewName === "wordbook") renderWordbook();
    if (viewName === "wrongbook") renderWrongbook();
    if (viewName === "review") renderReview();
    if (viewName === "records") renderRecords();
    if (viewName === "backup") renderBackupStats();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderAll() {
    renderDashboard();
    renderImportBatches();
    renderDateFilters();
    renderWordbook();
    renderWrongbook();
    renderReview();
    renderRecords();
    renderBackupStats();
  }

  function renderDashboard() {
    const todayWords = state.words.filter((word) => word.date === today);
    const unknown = state.words.filter((word) => word.status === "unknown");
    const fuzzy = state.words.filter((word) => word.status === "fuzzy");
    const known = state.words.filter((word) => word.status === "known");

    $("#dashTodayCount").textContent = todayWords.length;
    $("#dashTotalCount").textContent = state.words.length;
    $("#dashUnknownCount").textContent = unknown.length;
    $("#dashFuzzyCount").textContent = fuzzy.length;
    $("#dashKnownCount").textContent = known.length;

    const reviewWords = getReviewWords(5);
    $("#dashboardReviewList").innerHTML = reviewWords.length
      ? reviewWords.map((word) => miniWordItem(word)).join("")
      : `<div class="empty-inline">今天还没有建议复习的单词。</div>`;

    const total = Math.max(state.words.length, 1);
    const counts = {
      known: known.length,
      unknown: unknown.length,
      fuzzy: fuzzy.length,
      new: state.words.filter((word) => word.status === "new").length
    };
    $("#masteryBars").innerHTML = Object.entries(counts).map(([status, count]) => {
      const percent = Math.round((count / total) * 100);
      return `
        <div class="bar-row">
          <span>${STATUS_LABELS[status]}</span>
          <div class="bar"><span class="bar-${status}" style="width:${percent}%"></span></div>
          <strong>${count}</strong>
        </div>
      `;
    }).join("");
  }

  function renderImportBatches() {
    const batches = [...state.importBatches]
      .map((batch) => {
        const words = state.words.filter((word) => word.importBatchId === batch.id);
        return {
          ...batch,
          wordCount: words.length,
          problemCount: words.filter((word) => word.status === "unknown" || word.status === "fuzzy" || word.wrongCount > 0).length
        };
      })
      .filter((batch) => batch.wordCount > 0)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    $("#importBatchBody").innerHTML = batches.map((batch, index) => `
      <tr>
        <td class="word-main">${escapeHtml(batch.name || `第 ${index + 1} 批`)}</td>
        <td>${batch.date}</td>
        <td>${batch.wordCount}</td>
        <td>${batch.problemCount}</td>
        <td>${formatDateTime(batch.createdAt)}</td>
        <td>
          <button class="link-button danger" data-delete-batch-id="${batch.id}">删除这一批</button>
        </td>
      </tr>
    `).join("");
    $("#importBatchEmpty").classList.toggle("hidden", batches.length !== 0);
  }

  function deleteImportBatch(batchId) {
    const batch = state.importBatches.find((item) => item.id === batchId);
    const words = state.words.filter((word) => word.importBatchId === batchId);
    if (!words.length) return;

    const problemCount = words.filter((word) => word.status === "unknown" || word.status === "fuzzy" || word.wrongCount > 0).length;
    const label = batch ? batch.name : "这一批";
    const ok = window.confirm(`确定删除“${label}”吗？\n会删除 ${words.length} 个单词，并清理其中 ${problemCount} 个不会/模糊/错词记录。`);
    if (!ok) return;

    const deleteIds = new Set(words.map((word) => word.id));
    state.words = state.words.filter((word) => !deleteIds.has(word.id));
    state.importBatches = state.importBatches.filter((item) => item.id !== batchId);
    state.sessions = state.sessions.map((session) => ({
      ...session,
      wrongWordIds: Array.isArray(session.wrongWordIds)
        ? session.wrongWordIds.filter((id) => !deleteIds.has(id))
        : []
    }));

    if (reciteSession && reciteSession.queue.some((word) => deleteIds.has(word.id))) {
      reciteSession = null;
      $("#recitePanel").classList.add("hidden");
      $("#reciteEmpty").classList.remove("hidden");
      $("#reciteEmpty").textContent = "当前背诵批次已删除。";
    }
    if (testSession && testSession.queue.some((word) => deleteIds.has(word.id))) {
      testSession = null;
      $("#testPanel").classList.add("hidden");
      $("#testEmpty").classList.remove("hidden");
      $("#testEmpty").textContent = "当前测试批次已删除。";
    }

    persist();
    renderAll();
  }

  function parseImport() {
    const date = $("#importDate").value || today;
    const text = $("#importText").value;
    importPreview = parseWordsFromText(text, date);
    renderImportPreview();
  }

  function clearImport() {
    $("#importText").value = "";
    importPreview = null;
    $("#importPreviewPanel").classList.add("hidden");
  }

  function parseWordsFromText(text, date) {
    const lines = text.split(/\r?\n/);
    const existingKeys = new Set(
      state.words
        .filter((word) => word.date === date)
        .map((word) => normalizeEnglish(word.english))
    );
    const seen = new Set();
    const items = [];
    const invalid = [];

    lines.forEach((rawLine, index) => {
      const cleaned = cleanImportLine(rawLine);
      if (!cleaned) return;

      const chineseIndex = cleaned.search(/[\u3400-\u9fff]/);
      if (chineseIndex < 0) {
        invalid.push({ line: index + 1, text: rawLine });
        return;
      }

      let english = cleanEnglishValue(cleaned.slice(0, chineseIndex));
      let meaning = cleaned.slice(chineseIndex).replace(/^[：:，,、\-–—\s]+/g, "").trim();
      meaning = meaning.replace(/\s+/g, " ");

      if (!/[A-Za-z]/.test(english) || !meaning) {
        invalid.push({ line: index + 1, text: rawLine });
        return;
      }

      const key = normalizeEnglish(english);
      const duplicateInImport = seen.has(key);
      const exists = existingKeys.has(key);
      seen.add(key);
      items.push({
        english,
        meaning,
        date,
        duplicateInImport,
        exists,
        canImport: !duplicateInImport && !exists
      });
    });

    return { items, invalid };
  }

  function cleanImportLine(line) {
    return String(line || "")
      .replace(/^\s*(?:\d+[\.\)、)]|[（(]?\d+[)）]|[-*•])\s*/, "")
      .trim();
  }

  function normalizeEnglish(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function cleanEnglishValue(value) {
    return String(value || "")
      .trim()
      .replace(/[：:，,、\-–—\s]+$/g, "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function renderImportPreview() {
    const panel = $("#importPreviewPanel");
    panel.classList.remove("hidden");
    const items = importPreview ? importPreview.items : [];
    const validCount = items.filter((item) => item.canImport).length;
    const skippedCount = items.length - validCount;

    $("#importSummary").textContent = `识别到 ${items.length} 条，可导入 ${validCount} 条，跳过 ${skippedCount} 条。`;
    $("#confirmImportBtn").disabled = validCount === 0;
    $("#importPreviewBody").innerHTML = items.length ? items.map((item) => {
      const status = item.canImport ? "可导入" : item.exists ? "同日已存在" : "本次重复";
      return `
        <tr>
          <td class="word-main">${escapeHtml(item.english)}</td>
          <td>${escapeHtml(item.meaning)}</td>
          <td>${item.date}</td>
          <td><span class="tag ${item.canImport ? "tag-known" : "tag-fuzzy"}">${status}</span></td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="4">没有识别到可显示的单词。</td></tr>`;

    const invalid = importPreview ? importPreview.invalid : [];
    $("#invalidLines").innerHTML = invalid.length
      ? `<strong>未识别行：</strong>${invalid.map((item) => `<div>第 ${item.line} 行：${escapeHtml(item.text)}</div>`).join("")}`
      : "";
  }

  function confirmImport() {
    if (!importPreview) parseImport();
    const now = new Date().toISOString();
    const items = importPreview.items.filter((item) => item.canImport);
    const batchId = createId();
    const batchDate = items[0] ? items[0].date : ($("#importDate").value || today);
    const words = items.map((item) => ({
      id: createId(),
      english: item.english,
      meaning: item.meaning,
      date: item.date,
      status: "new",
      wrongCount: 0,
      correctCount: 0,
      lastReviewed: null,
      note: "",
      importBatchId: batchId,
      createdAt: now,
      updatedAt: now
    }));
    state.importBatches.unshift({
      id: batchId,
      date: batchDate,
      name: `导入 ${batchDate}`,
      createdAt: now
    });
    state.words.push(...words);
    persist();
    renderAll();
    $("#importSummary").textContent = `已导入 ${words.length} 个单词。`;
    $("#confirmImportBtn").disabled = true;
    showView("dashboard");
  }

  function getWordsByScope(scope) {
    const words = [...state.words];
    if (scope === "today") return words.filter((word) => word.date === today);
    if (scope === "review") return getReviewWords(40);
    if (scope === "wrong") return words.filter(isProblemWord).sort(sortProblemWords);
    if (scope === "fuzzy") return words.filter((word) => word.status === "fuzzy").sort(sortProblemWords);
    return words.sort((a, b) => a.english.localeCompare(b.english));
  }

  function startRecite(scope) {
    const queue = getWordsByScope(scope);
    reciteSession = null;
    $("#reciteSummary").classList.add("hidden");

    if (!queue.length) {
      $("#recitePanel").classList.add("hidden");
      $("#reciteEmpty").classList.remove("hidden");
      $("#reciteEmpty").textContent = "这个范围里还没有单词。";
      return;
    }

    reciteSession = {
      type: "recite",
      scope,
      queue,
      index: 0,
      revealed: false,
      results: {},
      startedAt: new Date().toISOString()
    };
    $("#reciteEmpty").classList.add("hidden");
    $("#recitePanel").classList.remove("hidden");
    renderReciteCard();
  }

  function renderReciteCard() {
    if (!reciteSession) return;
    const word = reciteSession.queue[reciteSession.index];
    $("#reciteProgress").textContent = `第 ${reciteSession.index + 1} / ${reciteSession.queue.length} 个`;
    $("#reciteWord").textContent = word.english;
    $("#reciteMeaning").textContent = reciteSession.revealed ? word.meaning : "点击显示中文释义";
    $("#reciteMeaning").classList.toggle("hidden-text", !reciteSession.revealed);
    $("#reciteStatusPill").textContent = STATUS_LABELS[word.status];
    $("#reciteStatusPill").className = `status-pill status-${word.status}`;
    $("#reciteCard").classList.toggle("status-unknown", word.status === "unknown");
    $("#reciteCard").classList.toggle("status-fuzzy", word.status === "fuzzy");
    $("#prevReciteBtn").disabled = reciteSession.index === 0;
    $("#nextReciteBtn").disabled = reciteSession.index === reciteSession.queue.length - 1;
  }

  function revealReciteMeaning() {
    if (!reciteSession) return;
    reciteSession.revealed = true;
    renderReciteCard();
  }

  function moveRecite(step) {
    if (!reciteSession) return;
    const nextIndex = reciteSession.index + step;
    if (nextIndex < 0 || nextIndex >= reciteSession.queue.length) return;
    reciteSession.index = nextIndex;
    reciteSession.revealed = false;
    renderReciteCard();
  }

  function chooseReciteStatus(status) {
    if (!reciteSession) return;
    const word = reciteSession.queue[reciteSession.index];
    applyStudyResult(word.id, status, status === "known" ? "correct" : status === "unknown" ? "wrong" : "fuzzy");
    reciteSession.results[word.id] = status;
    persist();
    renderAll();

    if (reciteSession.index < reciteSession.queue.length - 1) {
      reciteSession.index += 1;
      reciteSession.revealed = false;
      renderReciteCard();
      return;
    }

    finishRecite();
  }

  function finishRecite() {
    if (!reciteSession) return;
    const values = Object.values(reciteSession.results);
    const summary = {
      total: values.length,
      known: values.filter((status) => status === "known").length,
      unknown: values.filter((status) => status === "unknown").length,
      fuzzy: values.filter((status) => status === "fuzzy").length
    };
    const problemIds = Object.entries(reciteSession.results)
      .filter(([, status]) => status !== "known")
      .map(([id]) => id);

    addSession({
      type: "recite",
      mode: "card",
      scope: reciteSession.scope,
      startedAt: reciteSession.startedAt,
      endedAt: new Date().toISOString(),
      total: summary.total,
      known: summary.known,
      unknown: summary.unknown,
      fuzzy: summary.fuzzy,
      correct: summary.known,
      wrong: summary.unknown,
      wrongWordIds: problemIds
    });

    $("#recitePanel").classList.add("hidden");
    $("#reciteSummary").classList.remove("hidden");
    $("#reciteSummary").innerHTML = `
      <h3>本次背诵总结</h3>
      <div class="summary-grid">
        ${summaryCell("本次背诵", summary.total)}
        ${summaryCell("会", summary.known)}
        ${summaryCell("不会", summary.unknown)}
        ${summaryCell("模糊", summary.fuzzy)}
      </div>
      <div class="toolbar">
        <button class="primary-button" data-start-reciting="${reciteSession.scope}">再背一遍</button>
        <button class="secondary-button" data-goto="wrongbook">查看错词本</button>
      </div>
    `;
    reciteSession = null;
    renderAll();
  }

  function startTest(scope) {
    const queue = getWordsByScope(scope);
    testSession = null;
    $("#testSummary").classList.add("hidden");

    if (!queue.length) {
      $("#testPanel").classList.add("hidden");
      $("#testEmpty").classList.remove("hidden");
      $("#testEmpty").textContent = "这个范围里还没有单词。";
      return;
    }

    testSession = {
      type: "test",
      mode: selectedTestMode,
      scope,
      queue,
      index: 0,
      correct: 0,
      wrong: 0,
      fuzzy: 0,
      wrongWordIds: [],
      answeredIds: new Set(),
      showingAnswer: false,
      typedChecked: false,
      startedAt: new Date().toISOString()
    };
    $("#testEmpty").classList.add("hidden");
    $("#testPanel").classList.remove("hidden");
    renderTestQuestion();
  }

  function renderTestQuestion() {
    if (!testSession) return;
    const word = testSession.queue[testSession.index];
    $("#testProgress").textContent = `第 ${testSession.index + 1} / ${testSession.queue.length} 题`;
    $("#testLiveScore").textContent = `正确 ${testSession.correct} · 错误 ${testSession.wrong + testSession.fuzzy}`;
    $("#testStatusPill").textContent = selectedTestMode === "enToZh" ? "英文 → 中文" : "中文 → 英文";
    $("#testStatusPill").className = "status-pill status-new";
    $("#testPrompt").textContent = selectedTestMode === "enToZh" ? word.english : word.meaning;
    $("#testAnswer").textContent = selectedTestMode === "enToZh" ? "先自己想中文，再显示答案" : "";
    $("#testAnswer").classList.add("hidden-text");

    $("#enToZhControls").classList.toggle("hidden", selectedTestMode !== "enToZh");
    $("#zhToEnControls").classList.toggle("hidden", selectedTestMode !== "zhToEn");
    $("#testJudgeRow").classList.add("hidden");
    $("#showTestAnswerBtn").classList.remove("hidden");
    $("#answerInput").value = "";
    $("#answerInput").disabled = false;
    $("#submitAnswerBtn").classList.remove("hidden");
    $("#markFuzzyBtn").classList.remove("hidden");
    $("#nextTestBtn").classList.add("hidden");
    testSession.showingAnswer = false;
    testSession.typedChecked = false;

    if (selectedTestMode === "zhToEn") {
      window.setTimeout(() => $("#answerInput").focus(), 50);
    }
  }

  function showTestAnswer() {
    if (!testSession || selectedTestMode !== "enToZh") return;
    const word = testSession.queue[testSession.index];
    testSession.showingAnswer = true;
    $("#testAnswer").textContent = word.meaning;
    $("#testAnswer").classList.remove("hidden-text");
    $("#testJudgeRow").classList.remove("hidden");
    $("#showTestAnswerBtn").classList.add("hidden");
  }

  function judgeEnToZh(result) {
    if (!testSession || selectedTestMode !== "enToZh") return;
    const word = testSession.queue[testSession.index];
    if (result === "correct") {
      testSession.correct += 1;
      applyStudyResult(word.id, "known", "correct");
    } else if (result === "wrong") {
      testSession.wrong += 1;
      testSession.wrongWordIds.push(word.id);
      applyStudyResult(word.id, "unknown", "wrong");
    } else {
      testSession.fuzzy += 1;
      testSession.wrongWordIds.push(word.id);
      applyStudyResult(word.id, "fuzzy", "fuzzy");
    }
    persist();
    renderAll();
    moveToNextTestQuestion();
  }

  function submitTypedAnswer() {
    if (!testSession || selectedTestMode !== "zhToEn" || testSession.typedChecked) return;
    const word = testSession.queue[testSession.index];
    const answer = normalizeEnglish($("#answerInput").value);
    const correctAnswer = normalizeEnglish(word.english);
    const isCorrect = answer === correctAnswer;
    testSession.typedChecked = true;
    $("#answerInput").disabled = true;
    $("#submitAnswerBtn").classList.add("hidden");
    $("#markFuzzyBtn").classList.add("hidden");
    $("#nextTestBtn").classList.remove("hidden");

    if (isCorrect) {
      testSession.correct += 1;
      $("#testAnswer").textContent = "回答正确";
      $("#testAnswer").classList.remove("hidden-text");
      applyStudyResult(word.id, "known", "correct");
    } else {
      testSession.wrong += 1;
      testSession.wrongWordIds.push(word.id);
      $("#testAnswer").textContent = `正确答案：${word.english}`;
      $("#testAnswer").classList.remove("hidden-text");
      applyStudyResult(word.id, "unknown", "wrong");
    }
    persist();
    renderAll();
    $("#testLiveScore").textContent = `正确 ${testSession.correct} · 错误 ${testSession.wrong + testSession.fuzzy}`;
  }

  function markTypedFuzzy() {
    if (!testSession || selectedTestMode !== "zhToEn" || testSession.typedChecked) return;
    const word = testSession.queue[testSession.index];
    testSession.fuzzy += 1;
    testSession.wrongWordIds.push(word.id);
    testSession.typedChecked = true;
    $("#answerInput").disabled = true;
    $("#submitAnswerBtn").classList.add("hidden");
    $("#markFuzzyBtn").classList.add("hidden");
    $("#nextTestBtn").classList.remove("hidden");
    $("#testAnswer").textContent = `正确答案：${word.english}`;
    $("#testAnswer").classList.remove("hidden-text");
    applyStudyResult(word.id, "fuzzy", "fuzzy");
    persist();
    renderAll();
    $("#testLiveScore").textContent = `正确 ${testSession.correct} · 错误 ${testSession.wrong + testSession.fuzzy}`;
  }

  function moveToNextTestQuestion() {
    if (!testSession) return;
    if (testSession.index < testSession.queue.length - 1) {
      testSession.index += 1;
      renderTestQuestion();
      return;
    }
    finishTest();
  }

  function finishTest() {
    if (!testSession) return;
    const total = testSession.queue.length;
    const wrongTotal = testSession.wrong + testSession.fuzzy;
    const rate = total ? Math.round((testSession.correct / total) * 100) : 0;
    const wrongWords = uniqueIds(testSession.wrongWordIds).map(findWordById).filter(Boolean);

    addSession({
      type: "test",
      mode: selectedTestMode,
      scope: testSession.scope,
      startedAt: testSession.startedAt,
      endedAt: new Date().toISOString(),
      total,
      correct: testSession.correct,
      wrong: testSession.wrong,
      fuzzy: testSession.fuzzy,
      known: testSession.correct,
      unknown: testSession.wrong,
      wrongWordIds: wrongWords.map((word) => word.id)
    });

    $("#testPanel").classList.add("hidden");
    $("#testSummary").classList.remove("hidden");
    $("#testSummary").innerHTML = `
      <h3>本次测试总结</h3>
      <div class="summary-grid">
        ${summaryCell("总题数", total)}
        ${summaryCell("正确数", testSession.correct)}
        ${summaryCell("错误数", wrongTotal)}
        ${summaryCell("正确率", `${rate}%`)}
      </div>
      <h3>本次错词列表</h3>
      ${wrongWords.length ? `<div class="rank-list">${wrongWords.map((word) => miniWordItem(word)).join("")}</div>` : `<div class="empty-inline">这次没有错词。</div>`}
      <div class="toolbar">
        <button class="primary-button" data-start-testing="${testSession.scope}">再测一遍</button>
        <button class="secondary-button" data-goto="wrongbook">查看错词本</button>
      </div>
    `;
    testSession = null;
    renderAll();
  }

  function applyStudyResult(wordId, status, outcome) {
    const word = findWordById(wordId);
    if (!word) return;
    word.status = status;
    if (outcome === "correct") word.correctCount += 1;
    if (outcome === "wrong") word.wrongCount += 1;
    word.lastReviewed = new Date().toISOString();
    word.updatedAt = new Date().toISOString();
  }

  function addSession(session) {
    state.sessions.unshift({
      id: createId(),
      ...session
    });
    state.sessions = state.sessions.slice(0, 300);
    persist();
  }

  function renderDateFilters() {
    const select = $("#filterDate");
    const selected = select.value || "all";
    const dates = [...new Set(state.words.map((word) => word.date))].sort().reverse();
    select.innerHTML = `<option value="all">全部日期</option>${dates.map((date) => `<option value="${date}">${date}</option>`).join("")}`;
    select.value = dates.includes(selected) ? selected : "all";
  }

  function renderWordbook() {
    const search = normalizeSearch($("#searchInput").value);
    const filterDate = $("#filterDate").value;
    const filterStatus = $("#filterStatus").value;
    const words = state.words
      .filter((word) => filterDate === "all" || word.date === filterDate)
      .filter((word) => filterStatus === "all" || word.status === filterStatus)
      .filter((word) => {
        if (!search) return true;
        return normalizeSearch(word.english).includes(search) || normalizeSearch(word.meaning).includes(search);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.english.localeCompare(b.english));

    $("#wordTableBody").innerHTML = words.map((word) => `
      <tr>
        <td class="word-main">${escapeHtml(word.english)}</td>
        <td>${escapeHtml(word.meaning)}</td>
        <td>${word.date}</td>
        <td>${statusSelect(word)}</td>
        <td>${word.correctCount} / ${word.wrongCount}</td>
        <td>${formatDateTime(word.lastReviewed)}</td>
        <td>${word.note ? escapeHtml(word.note) : "<span class=\"muted\">无</span>"}</td>
        <td>
          <div class="row-actions">
            <button class="link-button" data-edit-id="${word.id}">编辑</button>
            <button class="link-button danger" data-delete-id="${word.id}">删除</button>
          </div>
        </td>
      </tr>
    `).join("");
    $("#wordbookEmpty").classList.toggle("hidden", words.length !== 0);
  }

  function renderWrongbook() {
    const words = state.words.filter(isProblemWord).sort(sortProblemWords);
    $("#wrongTableBody").innerHTML = words.map((word) => `
      <tr>
        <td class="word-main">${escapeHtml(word.english)}</td>
        <td>${escapeHtml(word.meaning)}</td>
        <td><span class="tag tag-${word.status}">${STATUS_LABELS[word.status]}</span></td>
        <td>${word.wrongCount}</td>
        <td>${formatDateTime(word.lastReviewed)}</td>
        <td>${word.note ? escapeHtml(word.note) : "<span class=\"muted\">无</span>"}</td>
        <td>
          <div class="row-actions">
            <button class="link-button" data-master-id="${word.id}">标记已掌握</button>
            <button class="link-button" data-edit-id="${word.id}">编辑</button>
          </div>
        </td>
      </tr>
    `).join("");
    $("#wrongbookEmpty").classList.toggle("hidden", words.length !== 0);
  }

  function renderReview() {
    const suggest = getReviewWords(12);
    const wrong = state.words.filter((word) => word.status === "unknown" || word.wrongCount > 0).sort(sortProblemWords).slice(0, 12);
    const fuzzy = state.words.filter((word) => word.status === "fuzzy").sort(sortProblemWords).slice(0, 12);

    $("#reviewSuggestList").innerHTML = suggest.length
      ? suggest.map((word) => rankItem(word)).join("")
      : `<div class="empty-inline">暂无建议复习。</div>`;
    $("#reviewWrongList").innerHTML = wrong.length
      ? wrong.map((word) => rankItem(word)).join("")
      : `<div class="empty-inline">暂无错词。</div>`;
    $("#reviewFuzzyList").innerHTML = fuzzy.length
      ? fuzzy.map((word) => rankItem(word)).join("")
      : `<div class="empty-inline">暂无模糊词。</div>`;
  }

  function renderRecords() {
    const rows = state.sessions.map((session) => {
      const wrongWords = (session.wrongWordIds || []).map(findWordById).filter(Boolean);
      const result = session.type === "recite"
        ? `会 ${session.known || 0} · 不会 ${session.unknown || 0} · 模糊 ${session.fuzzy || 0}`
        : `正确 ${session.correct || 0} · 错误 ${(session.wrong || 0) + (session.fuzzy || 0)}`;
      return `
        <tr>
          <td>${formatDateTime(session.endedAt || session.startedAt)}</td>
          <td>${SESSION_LABELS[session.type] || session.type}</td>
          <td>${SCOPE_LABELS[session.scope] || session.scope}</td>
          <td>${session.total || 0}</td>
          <td>${result}</td>
          <td>${wrongWords.length ? wrongWords.map((word) => escapeHtml(word.english)).join("、") : "<span class=\"muted\">无</span>"}</td>
        </tr>
      `;
    }).join("");
    $("#recordTableBody").innerHTML = rows;
    $("#recordsEmpty").classList.toggle("hidden", state.sessions.length !== 0);
  }

  function renderBackupStats() {
    $("#backupStats").innerHTML = `
      <span>单词 ${state.words.length}</span>
      <span>记录 ${state.sessions.length}</span>
      <span>导入批次 ${state.importBatches.length}</span>
      <span>不会 ${state.words.filter((word) => word.status === "unknown").length}</span>
      <span>模糊 ${state.words.filter((word) => word.status === "fuzzy").length}</span>
      <span>已掌握 ${state.words.filter((word) => word.status === "known").length}</span>
    `;
  }

  function statusSelect(word) {
    return `
      <select data-inline-status="${word.id}" aria-label="修改状态">
        ${Object.entries(STATUS_LABELS).map(([value, label]) => `
          <option value="${value}" ${word.status === value ? "selected" : ""}>${label}</option>
        `).join("")}
      </select>
    `;
  }

  function updateWordStatus(wordId, status) {
    const word = findWordById(wordId);
    if (!word || !STATUS_LABELS[status]) return;
    word.status = status;
    word.updatedAt = new Date().toISOString();
    persist();
    renderAll();
  }

  function openWordDialog(wordId) {
    const dialog = $("#wordDialog");
    const word = wordId ? findWordById(wordId) : null;
    $("#dialogTitle").textContent = word ? "编辑单词" : "添加单词";
    $("#editWordId").value = word ? word.id : "";
    $("#editEnglish").value = word ? word.english : "";
    $("#editMeaning").value = word ? word.meaning : "";
    $("#editDate").value = word ? word.date : today;
    $("#editStatus").value = word ? word.status : "new";
    $("#editNote").value = word ? word.note : "";
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "open");
    }
  }

  function closeWordDialog() {
    const dialog = $("#wordDialog");
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function saveDialogWord(event) {
    event.preventDefault();
    const id = $("#editWordId").value;
    const now = new Date().toISOString();
    const payload = {
      english: cleanEnglishValue($("#editEnglish").value),
      meaning: $("#editMeaning").value.trim(),
      date: $("#editDate").value || today,
      status: $("#editStatus").value,
      note: $("#editNote").value.trim()
    };
    if (!payload.english || !payload.meaning) return;

    if (id) {
      const word = findWordById(id);
      if (word) {
        Object.assign(word, payload, { updatedAt: now });
      }
    } else {
      state.words.push({
        id: createId(),
        ...payload,
        wrongCount: 0,
        correctCount: 0,
        lastReviewed: null,
        importBatchId: getOrCreateManualBatch(payload.date),
        createdAt: now,
        updatedAt: now
      });
    }
    persist();
    closeWordDialog();
    renderAll();
  }

  function deleteWord(wordId) {
    const word = findWordById(wordId);
    if (!word) return;
    if (!window.confirm(`确定删除 “${word.english}” 吗？`)) return;
    state.words = state.words.filter((item) => item.id !== wordId);
    persist();
    renderAll();
  }

  function markMastered(wordId) {
    const word = findWordById(wordId);
    if (!word) return;
    word.status = "known";
    word.updatedAt = new Date().toISOString();
    persist();
    renderAll();
  }

  function getOrCreateManualBatch(date) {
    const id = `manual-${date}`;
    if (!state.importBatches.some((batch) => batch.id === id)) {
      state.importBatches.push({
        id,
        date,
        name: `手动添加 ${date}`,
        createdAt: new Date().toISOString()
      });
    }
    return id;
  }

  function isProblemWord(word) {
    return word.status === "unknown" || word.status === "fuzzy" || word.wrongCount > 0;
  }

  function sortProblemWords(a, b) {
    return priorityScore(b) - priorityScore(a) || b.date.localeCompare(a.date) || a.english.localeCompare(b.english);
  }

  function getReviewWords(limit) {
    return state.words
      .map((word) => ({ word, score: priorityScore(word) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.word.date.localeCompare(a.word.date))
      .slice(0, limit)
      .map((item) => item.word);
  }

  function priorityScore(word) {
    let score = 0;
    if (word.date === today) score += 4;
    if (word.status === "new") score += 3;
    if (word.status === "unknown") score += 9;
    if (word.status === "fuzzy") score += 6;
    if (word.status === "known") score -= 3;
    score += word.wrongCount * 3;
    score -= Math.min(word.correctCount, 6);

    if (!word.lastReviewed) {
      score += 2;
    } else {
      const days = daysSince(word.lastReviewed);
      if (days >= 1) score += Math.min(days, 5);
      if (days === 0 && word.status === "known") score -= 2;
    }
    return score;
  }

  function daysSince(iso) {
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return 0;
    const diff = Date.now() - then.getTime();
    return Math.floor(diff / 86400000);
  }

  function findWordById(id) {
    return state.words.find((word) => word.id === id);
  }

  function miniWordItem(word) {
    return `
      <div class="mini-item">
        <div>
          <strong>${escapeHtml(word.english)}</strong>
          <span>${escapeHtml(word.meaning)}</span>
        </div>
        <span class="tag tag-${word.status}">${STATUS_LABELS[word.status]}</span>
      </div>
    `;
  }

  function rankItem(word) {
    return `
      <div class="rank-item">
        <div>
          <strong>${escapeHtml(word.english)}</strong>
          <span>${escapeHtml(word.meaning)} · 错 ${word.wrongCount} · ${formatDateTime(word.lastReviewed)}</span>
        </div>
        <span class="priority-score">${priorityScore(word)}</span>
      </div>
    `;
  }

  function summaryCell(label, value) {
    return `
      <div class="summary-cell">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  function exportJson() {
    downloadFile(`中考背单词-完整备份-${today}.json`, JSON.stringify(state, null, 2), "application/json");
  }

  function importJsonBackup(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const incomingWords = Array.isArray(parsed.words) ? parsed.words.map(normalizeWordRecord) : [];
        const incomingSessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
        const incomingBatches = Array.isArray(parsed.importBatches) ? parsed.importBatches.map(normalizeImportBatch) : [];
        if (!incomingWords.length && !incomingSessions.length) {
          window.alert("没有识别到可导入的数据。");
          return;
        }
        if (!window.confirm("导入后会与当前数据合并，同 ID 的单词会被备份数据覆盖。继续吗？")) return;

        const wordMap = new Map(state.words.map((word) => [word.id, word]));
        incomingWords.forEach((word) => wordMap.set(word.id, word));
        const sessionMap = new Map(state.sessions.map((session) => [session.id, session]));
        incomingSessions.forEach((session) => {
          const normalizedSession = { ...session, id: session.id || createId() };
          sessionMap.set(normalizedSession.id, normalizedSession);
        });
        const batchMap = new Map(state.importBatches.map((batch) => [batch.id, batch]));
        incomingBatches.forEach((batch) => batchMap.set(batch.id, batch));
        state.words = Array.from(wordMap.values());
        state.sessions = Array.from(sessionMap.values()).sort((a, b) => String(b.endedAt || b.startedAt).localeCompare(String(a.endedAt || a.startedAt)));
        state.importBatches = Array.from(batchMap.values());
        migrateState();
        persist();
        renderAll();
        window.alert("导入完成。");
      } catch (error) {
        window.alert("JSON 文件格式不正确。");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function exportWrongText() {
    const words = state.words.filter(isProblemWord).sort(sortProblemWords);
    const text = words.map((word) => `${word.english} ${word.meaning}（状态：${STATUS_LABELS[word.status]}，错误次数：${word.wrongCount}）`).join("\n");
    downloadFile(`中考背单词-错词本-${today}.txt`, text || "暂无错词", "text/plain");
  }

  function exportTodayUnknownText() {
    const words = state.words
      .filter((word) => word.date === today && word.status === "unknown")
      .sort((a, b) => b.wrongCount - a.wrongCount || a.english.localeCompare(b.english));
    const text = words.map((word) => `${word.english} ${word.meaning}`).join("\n");
    downloadFile(`中考背单词-今日不会词-${today}.txt`, text || "今日暂无不会词", "text/plain");
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function formatDateTime(value) {
    if (!value) return "未复习";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未复习";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLowerCase();
  }

  function uniqueIds(ids) {
    return [...new Set(ids)];
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
