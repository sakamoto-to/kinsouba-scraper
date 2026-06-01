# 貴金属価格スクレイピングツール

国内主要3社の貴金属（金・プラチナ・銀・パラジウム）の相場価格を自動収集し、Google スプレッドシートに記録するツールです。Vercel 上にデプロイして使用します。

## 機能

- 3社（田中貴金属・徳力本店・日本マテリアル）の価格を並列スクレイピング
- 金・プラチナ・銀・パラジウムの小売価格・買取価格を取得
- Google スプレッドシートの「現在価格」シートに最新価格を上書き保存
- Google スプレッドシートの「履歴」シートに取得履歴を追記
- ブラウザから手動実行できるシンプルな管理画面付き

## 対象スクレイピングサイト

| 変数名 | 会社名 |
|--------|--------|
| `tanaka` | [田中貴金属工業](https://gold.tanaka.co.jp/commodity/souba/index.php) |
| `tokuriki` | [徳力本店](https://www.tokuriki-kanda.co.jp/goldetc/market/) |
| `material` | [日本マテリアル](https://www.material.co.jp/cgi-bin/market/data.cgi) |

## ディレクトリ構成

```
├── api/
│   └── scrape.js          # Vercel サーバーレス関数（エントリーポイント）
├── lib/
│   ├── scrapers/
│   │   ├── tanaka.js      # 田中貴金属スクレイパー
│   │   ├── tokuriki.js    # 徳力本店スクレイパー
│   │   └── material.js    # 日本マテリアルスクレイパー
│   └── sheets.js          # Google Sheets 書き込み処理
├── public/
│   └── index.html         # 管理画面UI
├── .env.local.example     # 環境変数テンプレート
└── vercel.json            # Vercel ルーティング設定
```

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. Google Cloud の設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. **Google Sheets API** を有効化
3. サービスアカウントを作成し、JSON キーをダウンロード
4. 対象スプレッドシートをサービスアカウントのメールアドレスに **編集者** として共有

### 3. スプレッドシートの準備

スプレッドシートに以下の2シートを作成し、1行目にヘッダーを設定してください。

**「現在価格」シート（A1:H1）**

| 金属 | 田中（小売） | 田中（買取） | 徳力（小売） | 徳力（買取） | マテリアル（小売） | マテリアル（買取） | 取得日時 |
|------|------------|------------|------------|------------|------------------|------------------|--------|

**「履歴」シート（A1:H1）**

同じヘッダー構成で作成（データは2行目以降に追記されます）

### 4. 環境変数の設定

`.env.local.example` をコピーして `.env.local` を作成し、値を埋めます。

```bash
cp .env.local.example .env.local
```

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
SPREADSHEET_ID=1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **注意:** `GOOGLE_PRIVATE_KEY` の改行は `\n` でエスケープして1行に収めてください。

### 5. ローカル開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開き、「価格を取得」ボタンをクリックして動作を確認します。

## Vercel へのデプロイ

```bash
vercel --prod
```

Vercel のプロジェクト設定（Environment Variables）に、`.env.local` と同じ3つの環境変数を登録してください。

## API 仕様

### `POST /api/scrape`

スクレイピングを実行し、Google Sheets に書き込みます。

**レスポンス例（成功時）**

```json
{
  "success": true,
  "data": {
    "tanaka": {
      "gold":      { "retail": 15000, "buying": 14800 },
      "platinum":  { "retail": 5000,  "buying": 4800  },
      "silver":    { "retail": 110,   "buying": 100   },
      "palladium": { "retail": 4500,  "buying": 4300  }
    },
    "tokuriki": { ... },
    "material":  { ... }
  }
}
```

**レスポンス例（一部失敗時）**

```json
{
  "success": true,
  "data": { "tanaka": { ... }, "tokuriki": null, "material": { ... } },
  "errors": { "tokuriki": "connect ETIMEDOUT" }
}
```

1サイトのスクレイピングが失敗しても、残りのサイトの結果は返却されます。

## 使用技術

| 技術 | 用途 |
|------|------|
| [Vercel](https://vercel.com/) | サーバーレスホスティング |
| [axios](https://axios-http.com/) | HTTPリクエスト |
| [cheerio](https://cheerio.js.org/) | HTMLパース |
| [googleapis](https://github.com/googleapis/google-api-nodejs-client) | Google Sheets API |
