(() => {
  const COLS = 5;
  let ROWS = 6;
  const boardEl = document.getElementById("board");
  const kbEl = document.getElementById("keyboard");
  const defEl = document.getElementById("definition");
  const msgEl = document.getElementById("message");
  const panel = document.getElementById("sentence-panel");
  const sentenceEl = document.getElementById("sentence");
  const feedbackEl = document.getElementById("sentence-feedback");
  const newGameBtn = document.getElementById("new-game");
  const historyPanel = document.getElementById("history");
  const historyList = document.getElementById("history-list");

  const DICT = new Set(DICT_LIST);
  const VALID = new Set([...WORDS.map(w => w.word), ...VALID_GUESSES]);
  const pointsEl = document.getElementById("points");
  const roundEl = document.getElementById("round");
  const hintEl = document.getElementById("hint");
  const hintBtn = document.getElementById("hint-btn");
  const nextBtn = document.getElementById("next-btn");
  const HINT_COST = 15, HINT_ORDER = [0, 4, 2];
  let MAX_HINTS = 3;

  // ---- Difficulty ----
  const DIFF = {
    easy:   { rows: 8, hints: 3, mult: 1,   tiers: [1], info: "8 tries · 3 hints · everyday words · ×1 points" },
    medium: { rows: 6, hints: 3, mult: 1.5, tiers: [2], info: "6 tries · 3 hints · tougher words · ×1.5 points" },
    hard:   { rows: 5, hints: 1, mult: 2,   tiers: [3], info: "5 tries · 1 hint · deeper words · ×2 points" }
  };
  let difficulty = "medium", lastWord = "";
  try { const d = localStorage.getItem("wd-diff"); if (DIFF[d]) difficulty = d; } catch {}
  const diffInfoEl = document.getElementById("diff-info");

  function applyDifficulty() {
    const d = DIFF[difficulty];
    ROWS = d.rows; MAX_HINTS = d.hints;
    boardEl.style.width = ROWS > 6 ? "min(250px,78%)" : "min(320px,90%)";
    diffInfoEl.textContent = d.info;
    document.querySelectorAll("#diff button").forEach(b => b.classList.toggle("active", b.dataset.d === difficulty));
  }
  document.querySelectorAll("#diff button").forEach(b => {
    b.onclick = () => {
      b.blur();
      if (b.dataset.d === difficulty || busy) return;
      difficulty = b.dataset.d;
      try { localStorage.setItem("wd-diff", difficulty); } catch {}
      init();
      msgEl.textContent = `Difficulty: ${difficulty[0].toUpperCase() + difficulty.slice(1)}. New word!`;
    };
  });

  // ---- Levels / XP ----
  const TITLES = ["Word Seed 🌱", "Sprout 🌿", "Reader 📖", "Explorer 🧭", "Word Wizard 🧙", "Star Speller ⭐", "Brainiac 🧠", "Champion 🏆", "Word Hero 🦸", "Legend 👑"];
  const xpFor = L => 50 * L * (L - 1);            // total XP needed to reach level L
  const levelFor = xp => { let L = 1; while (xp >= xpFor(L + 1)) L++; return L; };
  const titleFor = L => TITLES[Math.min(L - 1, TITLES.length - 1)];
  let xp = 0, level = 1, pendingLevel = 0;
  try {
    const sx = localStorage.getItem("wd-xp");
    xp = sx !== null ? parseInt(sx, 10) || 0 : (parseInt(localStorage.getItem("wd-points") || "0", 10) || 0);
  } catch {}
  level = levelFor(xp);
  function renderLevel() {
    const cur = xp - xpFor(level), need = xpFor(level + 1) - xpFor(level);
    document.getElementById("level-label").textContent = `Lv ${level} · ${titleFor(level)}`;
    document.getElementById("xp-text").textContent = `${cur} / ${need} XP`;
    document.getElementById("xp-fill").style.width = Math.min(100, (cur / need) * 100) + "%";
  }
  function gainPoints(n) {
    xp += n; setPoints(points + n);
    try { localStorage.setItem("wd-xp", String(xp)); } catch {}
    const L = levelFor(xp);
    if (L > level) { level = L; pendingLevel = L; }
    renderLevel();
  }
  function flushLevelUp() {
    if (!pendingLevel) return;
    const L = pendingLevel; pendingLevel = 0;
    showPopup(`⬆️ Level ${L}!`, titleFor(L), "level", () => playNotes([659.25, 783.99, 987.77, 1318.5], 0.09));
  }
  let target, row, col, guesses, over, busy, keyState, hintsUsed, roundNo = 0;
  try { roundNo = parseInt(localStorage.getItem("wd-round") || "0", 10) || 0; } catch {}
  let points = 0;
  try { points = parseInt(localStorage.getItem("wd-points") || "0", 10) || 0; } catch {}

  // ---- Sound + popup ----
  const soundBtn = document.getElementById("sound-btn");
  const popupEl = document.getElementById("popup");
  let soundOn = true, audioCtx = null, popupTimer = null;
  try { soundOn = localStorage.getItem("wd-sound") !== "off"; } catch {}
  soundBtn.textContent = soundOn ? "🔊" : "🔇";
  soundBtn.onclick = () => {
    soundBtn.blur();
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
    try { localStorage.setItem("wd-sound", soundOn ? "on" : "off"); } catch {}
    if (soundOn) playWin();
  };

  function playWin() { playNotes([523.25, 659.25, 783.99, 1046.5], 0.11); }

  function playNotes(freqs, step) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t0 = audioCtx.currentTime + 0.02;
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "triangle"; o.frequency.value = f;
        const s = t0 + i * step;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.25, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, s + (i === freqs.length - 1 ? 0.6 : 0.25));
        o.connect(g).connect(audioCtx.destination);
        o.start(s); o.stop(s + 0.7);
      });
    } catch (err) { console.warn("Sound unavailable:", err); }
  }

  const popupQueue = [];
  let popupBusy = false;
  function showPopup(title, sub, kind, onShow) {
    popupQueue.push({ title, sub, kind, onShow });
    if (!popupBusy) nextPopup();
  }
  function nextPopup() {
    const p = popupQueue.shift();
    if (!p) { popupBusy = false; return; }
    popupBusy = true;
    popupEl.querySelector(".popup-title").textContent = p.title;
    popupEl.querySelector(".popup-sub").textContent = p.sub;
    popupEl.classList.toggle("levelup", p.kind === "level");
    popupEl.classList.add("show");
    if (p.onShow) p.onShow();
    popupTimer = setTimeout(() => {
      popupEl.classList.remove("show");
      popupTimer = setTimeout(nextPopup, 400);
    }, 2600);
  }
  function clearPopups() {
    popupQueue.length = 0; clearTimeout(popupTimer); popupBusy = false; popupEl.classList.remove("show");
  }

  function setPoints(n) {
    points = Math.max(0, n);
    pointsEl.textContent = points;
    try { localStorage.setItem("wd-points", String(points)); } catch {}
  }

  function renderHint() {
    const letters = [...target.word].map((ch, i) => (HINT_ORDER.slice(0, hintsUsed).includes(i) ? ch : "_"));
    hintEl.textContent = hintsUsed ? "Hint: " + letters.join(" ") : "";
    hintBtn.disabled = over || hintsUsed >= MAX_HINTS;
  }

  function init() {
    applyDifficulty();
    const pool = WORDS.filter(w => DIFF[difficulty].tiers.includes(w.tier || 2));
    do { target = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && target.word === lastWord);
    lastWord = target.word;
    row = 0; col = 0; over = false; busy = false; keyState = {}; hintsUsed = 0;
    roundNo++; roundEl.textContent = roundNo;
    try { localStorage.setItem("wd-round", String(roundNo)); } catch {}
    clearPopups(); pendingLevel = 0;
    guesses = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
    defEl.textContent = `(${target.pos}) ${target.definition}`;
    msgEl.textContent = "";
    panel.classList.add("hidden");
    newGameBtn.classList.add("hidden");
    document.getElementById("submit-sentence").disabled = false;
    document.getElementById("submit-anyway").classList.add("hidden");
    sentenceEl.value = ""; sentenceEl.disabled = false; feedbackEl.textContent = "";
    buildBoard(); buildKeyboard(); renderHistory(); setPoints(points); renderLevel(); renderHint();
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < ROWS; r++) {
      const rowEl = document.createElement("div"); rowEl.className = "row";
      for (let c = 0; c < COLS; c++) {
        const t = document.createElement("div"); t.className = "tile"; t.id = `t-${r}-${c}`;
        rowEl.appendChild(t);
      }
      boardEl.appendChild(rowEl);
    }
  }

  function buildKeyboard() {
    kbEl.innerHTML = "";
    ["qwertyuiop", "asdfghjkl", "zxcvbnm-"].forEach(layout => {
      const r = document.createElement("div"); r.className = "krow";
      [...layout].forEach(ch => {
        const b = document.createElement("button"); b.className = "key";
        if (ch === "+") { b.textContent = "Enter"; b.classList.add("wide"); b.onclick = () => press("Enter"); }
        else if (ch === "-") { b.textContent = "⌫"; b.classList.add("wide"); b.onclick = () => press("Backspace"); }
        else { b.textContent = ch; b.dataset.k = ch; b.onclick = () => press(ch); }
        r.appendChild(b);
      });
      kbEl.appendChild(r);
    });
  }

  function press(key) {
    if (over || busy) return;
    if (key === "Enter") return submitGuess();
    if (key === "Backspace") {
      if (col > 0) { col--; guesses[row][col] = ""; paintTile(row, col); msgEl.textContent = ""; }
      return;
    }
    if (/^[a-z]$/i.test(key) && col < COLS) {
      guesses[row][col] = key.toLowerCase(); paintTile(row, col); col++;
      if (col === COLS) submitGuess(); // auto-check when the 5th letter is entered
    }
  }

  function paintTile(r, c) {
    const t = document.getElementById(`t-${r}-${c}`);
    t.textContent = guesses[r][c];
    t.classList.toggle("filled", !!guesses[r][c]);
  }

  function isValidWord(w) { return VALID.has(w); } // offline check, instant

  function submitGuess() {
    if (col < COLS) { msgEl.textContent = "Not enough letters"; return; }
    const guess = guesses[row].join("");
    if (!isValidWord(guess)) {
      // Invalid word: do NOT check it against the answer. Shake the row, let the player edit.
      msgEl.textContent = `"${guess.toUpperCase()}" isn't a valid word. Change a letter.`;
      const rowEl = boardEl.children[row];
      rowEl.classList.remove("shake"); void rowEl.offsetWidth; rowEl.classList.add("shake");
      return;
    }
    msgEl.textContent = "";
    const result = score(guess, target.word);
    result.forEach((s, i) => {
      document.getElementById(`t-${row}-${i}`).classList.add(s);
      const ch = guess[i];
      const rank = { absent: 1, present: 2, correct: 3 };
      if (!keyState[ch] || rank[s] > rank[keyState[ch]]) keyState[ch] = s;
    });
    updateKeys();
    if (guess === target.word) return finish(true);
    row++; col = 0;
    if (row === ROWS) finish(false);
  }

  // Standard Wordle scoring, handling repeated letters correctly
  function score(guess, answer) {
    const res = Array(COLS).fill("absent");
    const left = {};
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === answer[i]) res[i] = "correct";
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < COLS; i++) {
      if (res[i] === "correct") continue;
      if (left[guess[i]] > 0) { res[i] = "present"; left[guess[i]]--; }
    }
    return res;
  }

  function updateKeys() {
    kbEl.querySelectorAll(".key[data-k]").forEach(b => {
      b.classList.remove("correct", "present", "absent");
      if (keyState[b.dataset.k]) b.classList.add(keyState[b.dataset.k]);
    });
  }

  function finish(won) {
    over = true;
    let gain = 0;
    if (won) gain = Math.round((100 + (ROWS - (row + 1)) * 20) * DIFF[difficulty].mult); // faster + harder = more points
    gainPoints(gain);
    document.getElementById("result-title").textContent = won ? `🎉 You got it! +${gain} points` : "Good try! +0 points";
    hintBtn.disabled = true;
    if (won) {
      playWin();
      showPopup("🎉 Correct!", `${target.word.toUpperCase()} — +${gain} points`);
      flushLevelUp();
    }
    document.getElementById("answer").textContent = target.word.toUpperCase();
    panel.classList.remove("hidden");
    sentenceEl.focus();
  }

  // ---- Sentence checking -------------------------------------------------
  // 1) Hard requirements (word used, min length)
  function basicCheck(text) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length < 4) return "Please write a sentence of at least 4 words.";
    const re = new RegExp(`\\b${target.word}\\w*\\b`, "i");
    if (!re.test(text)) return `Your sentence should include the word "${target.word}".`;
    const bad = spellingIssues(text);
    if (bad.length) {
      return ["Check your spelling. These aren't valid words:",
        ...bad.map(b => `• "${b.word}"` + (b.suggestion ? ` — did you mean "${b.suggestion}"?` : ""))];
    }
    return null;
  }

  // ---- Spell check (offline, uses dict.js) ----
  function wordKnown(tok) {
    if (DICT.has(tok)) return true;
    const i = tok.indexOf("'");
    if (i > 0) {
      const base = tok.slice(0, i), suf = tok.slice(i + 1);
      if (["s", "t", "re", "ve", "ll", "d", "m"].includes(suf)) {
        if (DICT.has(base)) return true;
        if (suf === "t" && base.endsWith("n") && DICT.has(base.slice(0, -1))) return true;
      }
    }
    return false;
  }

  function editDistanceWithin(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return false;
      prev = cur;
    }
    return prev[b.length] <= max;
  }

  function suggestWord(tok) {
    if (tok.length < 3) return "";
    for (let i = 0; i < tok.length - 1; i++) { // swapped neighbours, e.g. teh -> the
      const sw = tok.slice(0, i) + tok[i + 1] + tok[i] + tok.slice(i + 2);
      if (sw !== tok && DICT.has(sw)) return sw;
    }
    for (const w of DICT_LIST) { // most frequent words first
      if (w[0] === tok[0] && editDistanceWithin(tok, w, tok.length > 5 ? 2 : 1)) return w;
    }
    return "";
  }

  function spellingIssues(text) {
    const out = [], seen = new Set();
    for (const m of text.replace(/\u2019/g, "'").matchAll(/[A-Za-z]+(?:'[A-Za-z]+)*/g)) {
      const tok = m[0], low = tok.toLowerCase();
      if (seen.has(low)) continue;
      // capitalized mid-sentence = probably a name; don't flag
      if (/^[A-Z]/.test(tok) && m.index > 0 && !/[.!?]["')]*\s*$/.test(text.slice(0, m.index))) continue;
      if (!wordKnown(low)) { seen.add(low); out.push({ word: tok, suggestion: suggestWord(low) }); }
    }
    return out;
  }

  // 2) Offline rule-based grammar/mechanics check (fallback)
  function localGrammarIssues(text) {
    const issues = [];
    const t = text.trim();
    if (!/^[A-Z"'(]/.test(t)) issues.push("Start the sentence with a capital letter.");
    if (!/[.!?]["')]*$/.test(t)) issues.push("End the sentence with . ! or ?");
    if (/(^|[\s(])i([\s',.!?]|$)/.test(t)) issues.push('Write the pronoun "I" as a capital letter.');
    const rep = t.match(/\b(\w+)\s+\1\b/i);
    if (rep) issues.push(`Repeated word: "${rep[1]} ${rep[1]}".`);
    if (/ {2,}/.test(t)) issues.push("Remove the extra spaces between words.");
    if (/\s+[,.!?;:]/.test(t)) issues.push("Remove the space before punctuation.");
    if (/\b(a)\s+[aeiou]\w*/i.test(t)) issues.push('Check "a" vs "an" before a vowel sound.');
    if (/\b(an)\s+[bcdfgjklmnpqrstvwxyz]\w*/i.test(t)) issues.push('Check "a" vs "an" before a consonant sound.');
    return issues;
  }

  // 3) Online grammar check via LanguageTool; throws on network/timeout/HTTP errors
  async function languageToolIssues(text) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch("https://api.languagetool.org/v2/check", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ text, language: "en-US" }),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error("LanguageTool HTTP " + res.status);
      const data = await res.json();
      return data.matches.map(m => {
        const bad = text.substr(m.offset, m.length);
        const fix = m.replacements && m.replacements[0] ? ` → try "${m.replacements[0].value}"` : "";
        return `${m.message} ("${bad}")${fix}`;
      });
    } finally { clearTimeout(timer); }
  }

  // Returns { issues: string[], mode: "online" | "offline" }
  async function checkGrammar(text) {
    try {
      return { issues: await languageToolIssues(text), mode: "online" };
    } catch (err) {
      console.warn("Online grammar check unavailable, using offline rules:", err);
      return { issues: localGrammarIssues(text), mode: "offline" };
    }
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem("wd-sentences") || "[]"); } catch { return []; }
  }
  function saveSentence(entry) {
    const h = getHistory(); h.unshift(entry);
    try { localStorage.setItem("wd-sentences", JSON.stringify(h.slice(0, 50))); } catch {}
  }
  function renderHistory() {
    const h = getHistory();
    historyList.innerHTML = "";
    historyPanel.classList.toggle("hidden", h.length === 0);
    h.forEach(e => {
      const li = document.createElement("li");
      li.innerHTML = `<strong></strong>: <span></span>`;
      li.querySelector("strong").textContent = e.word;
      li.querySelector("span").textContent = e.sentence;
      historyList.appendChild(li);
    });
  }

  const submitBtn = document.getElementById("submit-sentence");
  const anywayBtn = document.getElementById("submit-anyway");

  function showFeedback(lines, ok) {
    feedbackEl.innerHTML = "";
    feedbackEl.className = "message " + (ok ? "ok" : "err");
    lines.forEach(l => {
      const d = document.createElement("div"); d.textContent = l; feedbackEl.appendChild(d);
    });
  }

  function acceptSentence(text, bonus) {
    gainPoints(bonus); flushLevelUp();
    saveSentence({ word: target.word, sentence: text.trim() });
    sentenceEl.disabled = true;
    submitBtn.disabled = true;
    anywayBtn.classList.add("hidden");
    newGameBtn.classList.remove("hidden");
    renderHistory();
  }

  submitBtn.onclick = async () => {
    const text = sentenceEl.value;
    anywayBtn.classList.add("hidden");
    const err = basicCheck(text);
    if (err) { showFeedback([].concat(err), false); return; }
    submitBtn.disabled = true;
    showFeedback(["Checking your sentence..."], true);
    let result;
    try { result = await checkGrammar(text); }
    catch (e) { result = { issues: [], mode: "offline" }; }
    submitBtn.disabled = false;
    const note = result.mode === "offline" ? " (basic offline check)" : "";
    if (result.issues.length === 0) {
      acceptSentence(text, 30);
      showFeedback(["✅ Looks correct! Saved. +30 bonus points." + note], true);
    } else {
      showFeedback(["Possible issues" + note + ":", ...result.issues.map(i => "• " + i), "Fix it and resubmit, or submit anyway."], false);
      anywayBtn.classList.remove("hidden");
    }
  };

  anywayBtn.onclick = () => {
    acceptSentence(sentenceEl.value, 10);
    showFeedback(["Saved (with possible issues). +10 bonus points."], true);
  };
  newGameBtn.onclick = init;

  hintBtn.onclick = () => {
    hintBtn.blur();
    if (over || hintsUsed >= MAX_HINTS) return;
    hintsUsed++;
    setPoints(points - HINT_COST);
    renderHint();
    msgEl.textContent = `Hint used (−${HINT_COST} points). ${MAX_HINTS - hintsUsed} left.`;
  };

  nextBtn.onclick = () => {
    nextBtn.blur();
    if (busy) return;
    const skipped = target.word;
    const wasOver = over;
    init();
    if (!wasOver) msgEl.textContent = `Skipped. The word was ${skipped.toUpperCase()}.`;
  };

  document.addEventListener("keydown", e => {
    if (e.target === sentenceEl || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter" || e.key === "Backspace" || /^[a-z]$/i.test(e.key)) press(e.key);
  });

  init();
})();
