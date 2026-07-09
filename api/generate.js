/**
 * Vercel Serverless — LP→note・Threads 生成（Gemini API プロキシ）
 * APIキーはリクエスト body のみ。サーバーに保存しない。
 */

const MODEL = "gemini-2.5-flash";

const ANGLE_SEEDS = [
  "最近ふと気づいた小さなこと",
  "多くの人がやりがちな勘違い・失敗",
  "読者への問いかけから入る",
  "自分が見聞きした体験・しくじり談",
  "意外な事実／常識の逆を突く",
  "ビフォーアフターの比較",
  "あるあるネタ",
  "数字・データから入る",
  "たとえ話・比喩で説明する",
  "今の季節や時期の話題にからめる",
  "一番伝えたい本音をズバッと言う",
  "初心者がつまずくポイントを先回り",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickTwoDistinct(arr) {
  const a = pick(arr);
  let b = pick(arr);
  if (b === a) b = pick(arr);
  return a === b ? a : `${a} / ${b}`;
}

function buildMeta(options = {}) {
  const now = new Date();
  const today = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  const tfMap = {
    past: "過去を振り返る視点で（これまでの経験・失敗・変化を語る）",
    now: "今この瞬間・最近の出来事の視点で",
    trend: "これから・未来予測・最新トレンドの視点で",
  };
  let tf = options.timeframe || "random";
  if (tf === "random") tf = pick(["past", "now", "trend"]);
  return {
    today,
    timeframe: tfMap[tf] || tfMap.now,
    angleSeed: pickTwoDistinct(ANGLE_SEEDS),
  };
}

async function callGemini(apiKey, { systemPrompt, userPrompt, useSearch, jsonMode, maxOutputTokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = [];
  if (systemPrompt) {
    contents.push({ role: "user", parts: [{ text: `[システム指示]\n${systemPrompt}` }] });
    contents.push({ role: "model", parts: [{ text: "了解しました。指示に従います。" }] });
  }
  contents.push({ role: "user", parts: [{ text: userPrompt }] });

  const body = {
    contents,
    generationConfig: {
      temperature: 0.88,
      maxOutputTokens: maxOutputTokens || 8192,
    },
  };
  if (jsonMode) {
    body.generationConfig.responseMimeType = "application/json";
  }
  if (useSearch) {
    body.tools = [{ google_search: {} }];
  }

  let lastError = "Gemini API error";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      lastError =
        data?.error?.message ||
        data?.error?.status ||
        `Gemini API error (${res.status})`;
      const retryable =
        [429, 500, 502, 503].includes(res.status) ||
        /internal error|overloaded|try again/i.test(lastError);
      if (retryable && attempt < 2) continue;
      throw new Error(lastError);
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join("\n").trim();
    if (!text) {
      lastError = "生成結果が空でした。もう一度お試しください。";
      if (attempt < 2) continue;
      throw new Error(lastError);
    }
    return text;
  }
  throw new Error(lastError);
}

function parseJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) return JSON.parse(m[1].trim());
    throw new Error("JSONの解析に失敗しました。もう一度お試しください。");
  }
}

function lpSnippet(lpText, max = 12000) {
  const t = (lpText || "").trim();
  return t.length > max ? `${t.slice(0, max)}\n…（以下省略）` : t;
}

async function analyzeLp(apiKey, lpText) {
  const system = `あなたはマーケティング分析の専門家です。LP（ランディングページ）の本文を読み、紹介記事を書くための分析をJSONだけで返してください。`;
  const user = `以下のLP本文を分析し、次のJSON形式のみで返してください（説明文不要）。

{
  "genre": "ジャンル（例: 副業・美容・投資 等）",
  "target": "想定ターゲット（年齢・属性・状況）",
  "painPoints": ["悩み1", "悩み2", "悩み3"],
  "benefits": ["提供価値1", "提供価値2", "提供価値3"],
  "uniqueAngle": "このLPの独自の切り口・強み",
  "goal": "読者に取ってほしい行動（登録・購入・申込 等）"
}

【LP本文】
${lpSnippet(lpText)}`;

  const text = await callGemini(apiKey, { systemPrompt: system, userPrompt: user, jsonMode: true });
  return parseJson(text);
}

async function researchLp(apiKey, lpText, analysis) {
  const system = `あなたはリサーチャーです。LP紹介記事のため、関連トピックの最新動向・よくある疑問・比較ポイントを整理します。`;
  const user = `次のLPについて、紹介記事に使えるリサーチメモを400〜700字で書いてください。
箇条書き可。推測は「〜と考えられる」と明示。断定しすぎない。

ジャンル: ${analysis?.genre || "不明"}
ターゲット: ${analysis?.target || "不明"}
独自の切り口: ${analysis?.uniqueAngle || ""}

【LP本文（抜粋）】
${lpSnippet(lpText, 6000)}`;

  return callGemini(apiKey, { systemPrompt: system, userPrompt: user, useSearch: true, maxOutputTokens: 2048 });
}

function personaBlock(options) {
  const lines = [];
  if (options.persona) lines.push(`【紹介者プロフィール】\n${options.persona}`);
  if (options.voiceSamples) lines.push(`【文体サンプル（雰囲気だけ真似。表現は毎回変える）】\n${options.voiceSamples}`);
  if (options.lpUrl) lines.push(`【誘導URL（記事内で自然に案内）】\n${options.lpUrl}`);
  if (options.chosenAngle) {
    lines.push(
      `【今回の方向性】\nテーマ: ${options.chosenAngle.theme}\n切り口: ${options.chosenAngle.angle}\n想定読者: ${options.chosenAngle.whoFor}\n伝える価値: ${options.chosenAngle.value}`
    );
  }
  if (options.today) lines.push(`【執筆時期の目安】${options.today}`);
  if (options.timeframe) lines.push(`【時間軸の視点】${options.timeframe}`);
  if (options.angleSeed) lines.push(`【入り口のヒント（そのまま使わず参考に）】${options.angleSeed}`);
  return lines.join("\n\n");
}

async function generateAngles(apiKey, lpText, analysis, meta) {
  const system = `あなたはコンテンツプランナーです。同じLPでも毎回被らない紹介の方向性を5案出します。`;
  const user = `LP紹介の「方向性」を5案、JSON配列のみで返してください。

各要素:
{
  "id": 1,
  "theme": "15字以内のテーマ名",
  "angle": "どんな切り口で書くか（2〜3文）",
  "whoFor": "誰向けか（1文）",
  "value": "読者が得る価値（1文）"
}

idは1〜5。テーマは互いに被らないこと。
${personaBlock(meta)}

【LP分析】
${JSON.stringify(analysis, null, 2)}

【LP本文（抜粋）】
${lpSnippet(lpText, 5000)}`;

  const text = await callGemini(apiKey, { systemPrompt: system, userPrompt: user, jsonMode: true });
  const result = parseJson(text);
  return Array.isArray(result) ? result : result.result || result.angles || [];
}

async function generateNote(apiKey, lpText, analysis, research, options) {
  const system = `あなたはnote向けの紹介記事ライターです。
- 体験談ベースの語り口（紹介者プロフィールに沿う）
- 読者は「あなた」と呼ぶ
- 煽りすぎず、正直なトーン
- noteの規約: ASPリンクは原則不可。Amazon以外の直接アフィリンクは書かない。誘導URL欄がある場合のみ案内ボックスでURLを記載
- 2000〜3500字程度
- 見出しは ## で付ける
- 最後に必ず「※ 紹介・PRを含みます」等の開示を1行入れる
- JSONのみ返す`;

  const user = `次のLPを紹介するnote記事を書いてください。

{
  "title": "記事タイトル（32字前後、検索されやすい具体性）",
  "body": "本文（Markdown。##見出し使用。改行多め）",
  "tags": ["タグ1", "タグ2", "タグ3"]
}

${personaBlock(options)}

【LP分析】
${JSON.stringify(analysis, null, 2)}

${research ? `【リサーチメモ】\n${research}` : "【リサーチ】なし（LPと分析のみ参考）"}

【LP本文】
${lpSnippet(lpText)}`;

  const text = await callGemini(apiKey, {
    systemPrompt: system,
    userPrompt: user,
    jsonMode: true,
    maxOutputTokens: 8192,
  });
  return parseJson(text);
}

async function generateThreads(apiKey, lpText, analysis, research, options, count, pinMode) {
  const system = `あなたはThreads向けの短文ライターです。
- 1投稿は短め（メイン200字前後、リプライ300字前後）
- 毎回切り口を変える
- 硬い宣伝文にしない。つぶやき感も混ぜる
- 誘導URLがある投稿は控えめ（5本中1〜2本まで）
- JSON配列のみ返す`;

  const pinHint = pinMode
    ? "プロフィールにピン留めする3連投。①自己紹介+共感 ②価値提供 ③ソフトCTA の流れ。"
    : "独立した5本。各投稿はメイン+リプライの2段構成。";

  const user = `${pinHint}

${count}件分、次のJSON配列形式のみで返してください。

[
  {
    "no": 1,
    "type": "talk|value|soft_cta",
    "role": "役割の短い説明",
    "hasCta": false,
    "hook": "①メイン投稿（先に投稿する短文）",
    "body": "②リプライ（メインにぶら下げる）"
  }
]

noは1から連番。typeは talk=つぶやき, value=価値提供, soft_cta=控えめ誘導。
${personaBlock(options)}

【LP分析】
${JSON.stringify(analysis, null, 2)}

${research ? `【リサーチメモ】\n${research}` : ""}

【LP本文（抜粋）】
${lpSnippet(lpText, 5000)}`;

  const text = await callGemini(apiKey, {
    systemPrompt: system,
    userPrompt: user,
    jsonMode: true,
    maxOutputTokens: 6144,
  });
  const result = parseJson(text);
  return Array.isArray(result) ? result : result.posts || [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const { apiKey, mode, lpText, analysis, research, allowNoResearch, options = {} } = body;

  if (!apiKey || typeof apiKey !== "string") {
    return res.status(400).json({ error: "Gemini APIキーを入力してください。" });
  }
  if (!lpText || typeof lpText !== "string" || !lpText.trim()) {
    return res.status(400).json({ error: "LPの全文を貼り付けてください。" });
  }

  const meta = { ...buildMeta(options), ...options };

  try {
    if (mode === "prep") {
      let parsedAnalysis = analysis;
      if (!parsedAnalysis) {
        parsedAnalysis = await analyzeLp(apiKey, lpText);
      }
      let researchText = null;
      let researchFailed = false;
      try {
        researchText = await researchLp(apiKey, lpText, parsedAnalysis);
      } catch {
        researchFailed = true;
      }
      return res.status(200).json({
        analysis: parsedAnalysis,
        research: researchText,
        researchFailed,
      });
    }

    if (mode === "angles") {
      let parsedAnalysis = analysis;
      if (!parsedAnalysis) {
        parsedAnalysis = await analyzeLp(apiKey, lpText);
      }
      const angles = await generateAngles(apiKey, lpText, parsedAnalysis, meta);
      return res.status(200).json({ analysis: parsedAnalysis, result: angles });
    }

    let parsedAnalysis = analysis;
    if (!parsedAnalysis) {
      parsedAnalysis = await analyzeLp(apiKey, lpText);
    }

    let researchText = research;
    if (!researchText && !allowNoResearch) {
      try {
        researchText = await researchLp(apiKey, lpText, parsedAnalysis);
      } catch {
        // 執筆は続行
      }
    }

    const opts = { ...meta, ...options };

    if (mode === "note") {
      const result = await generateNote(apiKey, lpText, parsedAnalysis, researchText, opts);
      return res.status(200).json({ result });
    }

    if (mode === "threads") {
      const result = await generateThreads(apiKey, lpText, parsedAnalysis, researchText, opts, 5, false);
      return res.status(200).json({ result });
    }

    if (mode === "threads-pin") {
      const result = await generateThreads(apiKey, lpText, parsedAnalysis, researchText, opts, 3, true);
      return res.status(200).json({ result });
    }

    return res.status(400).json({ error: `不明なmode: ${mode}` });
  } catch (err) {
    console.error(err);
    const msg = err.message || "エラーが発生しました。";
    const status = /429|quota|rate/i.test(msg) ? 429 : 500;
    return res.status(status).json({ error: msg });
  }
}
