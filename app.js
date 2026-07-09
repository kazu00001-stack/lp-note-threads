import { runGenerate } from "./engine.js";

const MODE_LABELS = {
  note: "note記事をつくる",
  threads: "Threads投稿 5本",
  "threads-pin": "Threadsピン止め 3連投",
};

const STORAGE = {
  apiKey: "gemini_api_key",
  persona: "lpnt_persona",
  voice: "lpnt_voice",
  lpUrl: "lpnt_lpurl",
  lpText: "lpnt_lptext",
  timeframe: "lpnt_timeframe",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  apiKey: $("#api-key"),
  lpText: $("#lp-text"),
  lpUrl: $("#lp-url"),
  persona: $("#persona"),
  voice: $("#voice"),
  btnAngles: $("#btn-angles"),
  anglesHint: $("#angles-hint"),
  anglesList: $("#angles-list"),
  genBtns: $$(".btns .btn"),
  genHint: $("#gen-hint"),
  spinner: $("#spinner"),
  errorBox: $("#error-box"),
  warnBox: $("#warn-box"),
  analysisBox: $("#analysis-box"),
  resultBox: $("#result-box"),
};

let state = {
  timeframe: "random",
  analysis: null,
  research: null,
  angles: [],
  chosenAngle: null,
  loading: false,
  loadingAngles: false,
  resultKind: null,
  noteResult: null,
  threadsResult: [],
  lastMode: null,
};

function loadStorage() {
  const get = (k) => localStorage.getItem(k) ?? "";
  const api = get(STORAGE.apiKey);
  if (api) els.apiKey.value = api;
  els.persona.value = get(STORAGE.persona);
  els.voice.value = get(STORAGE.voice);
  els.lpUrl.value = get(STORAGE.lpUrl);
  els.lpText.value = get(STORAGE.lpText);
  const tf = get(STORAGE.timeframe);
  if (tf) setTimeframe(tf);
}

function bindStorage() {
  els.apiKey.addEventListener("input", () => localStorage.setItem(STORAGE.apiKey, els.apiKey.value));
  els.persona.addEventListener("input", () => localStorage.setItem(STORAGE.persona, els.persona.value));
  els.voice.addEventListener("input", () => localStorage.setItem(STORAGE.voice, els.voice.value));
  els.lpUrl.addEventListener("input", () => localStorage.setItem(STORAGE.lpUrl, els.lpUrl.value));
  els.lpText.addEventListener("input", () => {
    localStorage.setItem(STORAGE.lpText, els.lpText.value);
    resetAnalysis();
  });
}

function setTimeframe(key) {
  state.timeframe = key;
  localStorage.setItem(STORAGE.timeframe, key);
  $$("#timeframe-seg button").forEach((btn) => {
    btn.dataset.active = btn.dataset.key === key ? "true" : "false";
  });
}

function resetAnalysis() {
  state.analysis = null;
  state.research = null;
  state.angles = [];
  state.chosenAngle = null;
  els.anglesList.innerHTML = "";
  els.analysisBox.innerHTML = "";
  els.resultBox.innerHTML = "";
}

function canGenerate() {
  return !!els.apiKey.value.trim() && !!els.lpText.value.trim();
}

function updateButtons() {
  const ok = canGenerate();
  els.btnAngles.disabled = state.loadingAngles || !ok;
  els.genBtns.forEach((btn) => {
    btn.disabled = state.loading || !ok;
    const mode = btn.dataset.mode;
    btn.textContent = state.loading && state.lastMode === mode ? "生成中…" : MODE_LABELS[mode];
  });
  els.anglesHint.hidden = ok;
  els.genHint.hidden = ok;
}

function showError(msg) {
  if (!msg) {
    els.errorBox.hidden = true;
    els.errorBox.textContent = "";
    return;
  }
  els.errorBox.hidden = false;
  els.errorBox.textContent = msg;
}

function showWarn(msg) {
  if (!msg) {
    els.warnBox.hidden = true;
    els.warnBox.textContent = "";
    return;
  }
  els.warnBox.hidden = false;
  els.warnBox.textContent = msg;
}

function setSpinner(msg) {
  if (msg) {
    els.spinner.hidden = false;
    els.spinner.textContent = msg;
  } else {
    els.spinner.hidden = true;
    els.spinner.textContent = "";
  }
}

function optionsPayload() {
  return {
    lpUrl: els.lpUrl.value.trim(),
    persona: els.persona.value.trim(),
    voiceSamples: els.voice.value.trim(),
    timeframe: state.timeframe,
    chosenAngle: state.chosenAngle || undefined,
  };
}

async function apiPost(payload) {
  return runGenerate(payload);
}

function renderAnalysis(analysis) {
  if (!analysis) {
    els.analysisBox.innerHTML = "";
    return;
  }
  els.analysisBox.innerHTML = `
    <div class="card">
      <details>
        <summary>AIがLPをどう読んだか見る</summary>
        <div class="analysis" style="margin-top:10px">
          <p><b>ジャンル:</b> ${esc(analysis.genre)}</p>
          <p><b>ターゲット:</b> ${esc(analysis.target)}</p>
          <p><b>悩み:</b> ${esc((analysis.painPoints || []).join(" / "))}</p>
          <p><b>提供価値:</b> ${esc((analysis.benefits || []).join(" / "))}</p>
          <p><b>独自の切り口:</b> ${esc(analysis.uniqueAngle)}</p>
          <p><b>誘導ゴール:</b> ${esc(analysis.goal)}</p>
        </div>
      </details>
    </div>`;
}

function renderAngles() {
  if (!state.angles.length) {
    els.anglesList.innerHTML = "";
    return;
  }
  const items = state.angles
    .map((a) => {
      const sel = state.chosenAngle?.id === a.id;
      return `
        <div class="angle" data-id="${a.id}" data-sel="${sel}">
          <div class="angle-head">
            <b>${a.id}. ${esc(a.theme)}</b>
            <span class="angle-pick">${sel ? "✓ 選択中" : "これにする"}</span>
          </div>
          <p class="angle-body">${esc(a.angle)}</p>
          <p class="angle-meta">👤 ${esc(a.whoFor)} ／ 🎁 ${esc(a.value)}</p>
        </div>`;
    })
    .join("");
  const hint = state.chosenAngle
    ? `選択中: ${esc(state.chosenAngle.theme)}`
    : "未選択（おまかせ）。1つ選ぶとその角度で書きます。";
  els.anglesList.innerHTML = `${items}<p class="hint" style="margin-top:4px">${hint}</p>`;
  els.anglesList.querySelectorAll(".angle").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.id);
      const angle = state.angles.find((x) => x.id === id);
      state.chosenAngle = state.chosenAngle?.id === id ? null : angle;
      renderAngles();
    });
  });
}

function copyBtn(text, label = "コピー") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn ghost sm";
  btn.textContent = label;
  btn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(text);
    btn.textContent = "✓ コピーしました";
    setTimeout(() => {
      btn.textContent = label;
    }, 1400);
  });
  return btn;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderNote(note) {
  const full = `${note.title}\n\n${note.body}`;
  const card = document.createElement("div");
  card.className = "card";
  const head = document.createElement("div");
  head.className = "result-head";
  const title = document.createElement("span");
  title.className = "result-title";
  title.textContent = note.title;
  head.appendChild(title);
  head.appendChild(copyBtn(full, "タイトル＋本文をコピー"));
  const body = document.createElement("div");
  body.className = "result";
  body.textContent = note.body;
  card.appendChild(head);
  card.appendChild(body);
  if (note.tags?.length) {
    const tags = document.createElement("p");
    tags.className = "hint";
    tags.style.marginTop = "10px";
    tags.textContent = `タグ: ${note.tags.map((t) => `#${t}`).join("  ")}`;
    card.appendChild(tags);
  }
  els.resultBox.innerHTML = "";
  els.resultBox.appendChild(card);
}

function renderThreads(posts, mode) {
  const full = posts
    .map(
      (e) =>
        `【投稿${e.no} メイン】\n${e.hook ?? ""}\n\n【投稿${e.no} リプライ】\n${e.body}`
    )
    .join("\n\n――――――\n\n");

  const card = document.createElement("div");
  card.className = "card";
  const head = document.createElement("div");
  head.className = "result-head";
  const title = document.createElement("span");
  title.className = "result-title";
  title.textContent = MODE_LABELS[mode];
  head.appendChild(title);
  head.appendChild(copyBtn(full, "全部まとめてコピー"));
  card.appendChild(head);

  posts.forEach((e) => {
    const wrap = document.createElement("div");
    wrap.className = "thread";
    const meta = document.createElement("div");
    meta.className = "thread-meta";
    const tagClass =
      e.hasCta || e.type === "soft_cta" ? "soft_cta" : e.type === "talk" ? "talk" : "value";
    meta.innerHTML = `<span class="tag ${tagClass}">投稿${e.no}. ${esc(
      e.role || (e.hasCta || e.type === "soft_cta" ? "誘導あり" : e.type === "talk" ? "つぶやき・問いかけ" : "価値提供")
    )}</span>`;
    wrap.appendChild(meta);

    if (e.hook) {
      const step1 = document.createElement("div");
      step1.className = "post-step";
      const label1 = document.createElement("div");
      label1.className = "post-label";
      const span1 = document.createElement("span");
      span1.textContent = "① メイン投稿（これを先に投稿）";
      label1.appendChild(span1);
      label1.appendChild(copyBtn(e.hook));
      const body1 = document.createElement("div");
      body1.className = "thread-body";
      body1.textContent = e.hook;
      step1.appendChild(label1);
      step1.appendChild(body1);
      wrap.appendChild(step1);
    }

    const step2 = document.createElement("div");
    step2.className = "post-step";
    const label2 = document.createElement("div");
    label2.className = "post-label";
    const span2 = document.createElement("span");
    span2.textContent = "② ↳ リプライ（①にぶら下げる）";
    label2.appendChild(span2);
    label2.appendChild(copyBtn(e.body));
    const body2 = document.createElement("div");
    body2.className = "thread-body";
    body2.textContent = e.body;
    step2.appendChild(label2);
    step2.appendChild(body2);
    wrap.appendChild(step2);

    card.appendChild(wrap);
  });

  els.resultBox.innerHTML = "";
  els.resultBox.appendChild(card);
}

async function fetchAngles() {
  showError("");
  state.loadingAngles = true;
  els.btnAngles.textContent = "考え中…";
  updateButtons();
  try {
    const data = await apiPost({
      apiKey: els.apiKey.value.trim(),
      mode: "angles",
      lpText: els.lpText.value.trim(),
      analysis: state.analysis ?? undefined,
      options: optionsPayload(),
    });
    if (data.analysis) {
      state.analysis = data.analysis;
      renderAnalysis(state.analysis);
    }
    state.angles = data.result || [];
    state.chosenAngle = null;
    renderAngles();
    els.btnAngles.textContent = state.angles.length ? "🎲 別の5案を出す" : "🎲 方向性を5案出す";
  } catch (e) {
    showError(e.message);
    els.btnAngles.textContent = "🎲 方向性を5案出す";
  } finally {
    state.loadingAngles = false;
    updateButtons();
  }
}

async function generate(mode) {
  showError("");
  showWarn("");
  state.loading = true;
  state.lastMode = mode;
  updateButtons();

  let analysis = state.analysis;
  let research = state.research;
  let allowNoResearch = false;

  try {
    if (!analysis || !research) {
      setSpinner("🔎 リサーチ中…");
      const prep = await apiPost({
        apiKey: els.apiKey.value.trim(),
        mode: "prep",
        lpText: els.lpText.value.trim(),
        analysis: analysis ?? undefined,
      });
      analysis = prep.analysis;
      state.analysis = analysis;
      renderAnalysis(analysis);

      if (prep.researchFailed) {
        if (
          !window.confirm(
            "リサーチ工程が一時的に失敗しました。今回はリサーチなしで書きますか？（内容は一般論寄りになります）"
          )
        ) {
          throw new Error("中止しました。少し時間をおいて、もう一度お試しください。");
        }
        research = null;
        allowNoResearch = true;
        showWarn(
          "⚠️ 今回はリサーチなしで作成しました。もう一度実行すると、リサーチ付きで書ける場合があります。"
        );
      } else {
        research = prep.research;
        state.research = research;
      }
    }

    setSpinner("✍️ 執筆中…");
    const data = await apiPost({
      apiKey: els.apiKey.value.trim(),
      mode,
      lpText: els.lpText.value.trim(),
      analysis,
      research,
      allowNoResearch,
      options: optionsPayload(),
    });

    if (mode === "note") {
      state.noteResult = data.result;
      state.resultKind = "note";
      renderNote(data.result);
    } else {
      state.threadsResult = data.result;
      state.resultKind = "threads";
      renderThreads(data.result, mode);
    }
  } catch (e) {
    showError(e.message);
  } finally {
    state.loading = false;
    state.lastMode = null;
    setSpinner("");
    updateButtons();
  }
}

function init() {
  loadStorage();
  bindStorage();
  updateButtons();

  els.apiKey.addEventListener("input", updateButtons);
  els.lpText.addEventListener("input", updateButtons);

  $$("#timeframe-seg button").forEach((btn) => {
    btn.addEventListener("click", () => setTimeframe(btn.dataset.key));
  });

  els.btnAngles.addEventListener("click", fetchAngles);

  els.genBtns.forEach((btn) => {
    btn.addEventListener("click", () => generate(btn.dataset.mode));
  });
}

init();
