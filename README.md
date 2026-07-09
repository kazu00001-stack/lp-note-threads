# LP→note・Threads生成ツール

アフィリエイトLPの全文を貼るだけで、**毎回ちがう切り口**の note 記事と Threads 投稿を生成する無料Webツール。

## 公開URL

**https://kazu00001-stack.github.io/lp-note-threads/**

GitHub: https://github.com/kazu00001-stack/lp-note-threads

## 機能

- LP全文 → AI分析 → リサーチ → 執筆（Gemini 2.5 Flash）
- 方向性5案から切り口を選択（未選択でも生成可）
- note記事 / Threads 5本 / ピン止め3連投
- **ブラウザ完結** — APIキー・入力は localStorage のみ。Gemini へ直接送信
- 投稿の自動化はしない（コピペ用）

## ローカル確認

```bash
cd 1000.ツール/LP_note_Threads生成
python3 -m http.server 8080
# http://localhost:8080 を開く
```

## デプロイ（GitHub Pages）

リポジトリ root を GitHub Pages で公開（main / root）。

## 構成

| ファイル | 役割 |
|---------|------|
| `index.html` | UI |
| `app.js` | フロント（localStorage・生成フロー） |
| `engine.js` | Gemini API 呼び出し・プロンプト |
| `style.css` | スタイル |
| `api/generate.js` | Vercel 用（任意・未使用） |

## 注意

- 生成文は必ず手直ししてから投稿すること
- note では ASP 直リンク不可（Amazon 以外）。ツールは誘導URL欄がある場合のみ案内文に含める
- Gemini APIキーは利用者自身が Google AI Studio で無料取得
