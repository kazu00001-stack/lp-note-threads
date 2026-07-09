# LP→note・Threads生成ツール

アフィリエイトLPの全文を貼るだけで、**毎回ちがう切り口**の note 記事と Threads 投稿を生成する無料Webツール。

## 公開URL

（デプロイ後に更新）

## 機能

- LP全文 → AI分析 → リサーチ → 執筆（Gemini 2.5 Flash）
- 方向性5案から切り口を選択（未選択でも生成可）
- note記事 / Threads 5本 / ピン止め3連投
- APIキー・入力内容はブラウザ localStorage のみ（サーバー非保存）
- 投稿の自動化はしない（コピペ用）

## ローカル開発

```bash
cd 1000.ツール/LP_note_Threads生成
npx vercel dev
```

## デプロイ（Vercel）

1. GitHub `kazu00001-stack/lp-note-threads` に push
2. Vercel で Import → Framework Preset: Other
3. デプロイ完了後 `https://lp-note-threads.vercel.app/` 等で公開

## 構成

| ファイル | 役割 |
|---------|------|
| `index.html` | UI |
| `app.js` | フロント（localStorage・API呼び出し） |
| `style.css` | スタイル |
| `api/generate.js` | Vercel Serverless（Gemini プロキシ） |

## 注意

- 生成文は必ず手直ししてから投稿すること
- note では ASP 直リンク不可（Amazon 以外）。ツールは誘導URL欄がある場合のみ案内文に含める
- Gemini APIキーは利用者自身が Google AI Studio で無料取得
