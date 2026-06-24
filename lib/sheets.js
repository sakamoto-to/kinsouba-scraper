const { google } = require('googleapis');

// URL でも ID 単体でも受け取れるようにする
// 例: https://docs.google.com/spreadsheets/d/1Hd.../edit → "1Hd..."
function parseSpreadsheetId(value) {
  if (!value) return value;
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : value;
}

const ENV_SPREADSHEET_ID = parseSpreadsheetId(process.env.SPREADSHEET_ID);

// 金属の表示順
const METAL_ORDER = ['gold', 'platinum', 'silver', 'palladium'];
const METAL_LABELS = {
  gold:      '金',
  platinum:  'プラチナ',
  silver:    '銀',
  palladium: 'パラジウム',
};

const SHEET_NAMES = ['現在価格', '履歴'];
const HEADERS     = ['金属', '田中(小売)', '田中(買取)', '徳力(小売)', '徳力(買取)', 'マテリアル(小売)', 'マテリアル(買取)', '取得日時'];
// 各列の幅（ピクセル）
const COLUMN_WIDTHS = [80, 110, 110, 110, 110, 140, 140, 140];

/**
 * Google Sheets APIクライアントを生成
 */
function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // Vercel環境変数では \n がエスケープされているので復元
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * データをスプレッドシート書き込み用の2次元配列に変換
 * @param {object} tanaka - 田中貴金属データ
 * @param {object} tokuriki - 徳力本店データ
 * @param {object} material - 日本マテリアルデータ
 * @param {string} datetime - 取得日時文字列
 * @returns {string[][]} rows
 */
function buildRows(tanaka, tokuriki, material, datetime) {
  return METAL_ORDER.map((key) => {
    const t = tanaka?.[key] ?? {};
    const d = tokuriki?.[key] ?? {};
    const m = material?.[key] ?? {};
    return [
      METAL_LABELS[key],
      t.retail  ?? '',
      t.buying  ?? '',
      d.retail  ?? '',
      d.buying  ?? '',
      m.retail  ?? '',
      m.buying  ?? '',
      datetime,
    ];
  });
}

/**
 * 「現在価格」シートを上書き更新
 * @param {string} [spreadsheetIdOverride] - UIから渡されたID（省略時はenvを使用）
 */
async function updateCurrentSheet(tanaka, tokuriki, material, spreadsheetIdOverride) {
  const sheets = getSheetsClient();
  const spreadsheetId = parseSpreadsheetId(spreadsheetIdOverride) || ENV_SPREADSHEET_ID;
  const datetime = formatDatetime(new Date());
  const rows = buildRows(tanaka, tokuriki, material, datetime);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: '現在価格!A2:H5',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

/**
 * 「履歴」シートの末尾に行追加
 * @param {string} [spreadsheetIdOverride] - UIから渡されたID（省略時はenvを使用）
 */
async function appendHistorySheet(tanaka, tokuriki, material, spreadsheetIdOverride) {
  const sheets = getSheetsClient();
  const spreadsheetId = parseSpreadsheetId(spreadsheetIdOverride) || ENV_SPREADSHEET_ID;
  const datetime = formatDatetime(new Date());
  const rows = buildRows(tanaka, tokuriki, material, datetime);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: '履歴!A:H',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Date → "YYYY/MM/DD HH:mm" 形式の文字列
 */
function formatDatetime(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}/${mo}/${d} ${h}:${mi}`;
}

/**
 * スプレッドシートの初期セットアップ
 * - 初期化済みシート（A1 = "金属"）はスキップ（データを消さない）
 * - 未初期化シートのみ作成・ヘッダー書き込み・書式設定
 * - "シート1" が存在すれば削除
 * @param {string} [spreadsheetIdOverride] - UIから渡されたID（省略時はenvを使用）
 * @returns {{ initialized: string[], skipped: string[], deletedSheet1: boolean }}
 */
async function setupSheets(spreadsheetIdOverride) {
  const sheets = getSheetsClient();
  const spreadsheetId = parseSpreadsheetId(spreadsheetIdOverride) || ENV_SPREADSHEET_ID;

  // 1. 現在のシート一覧を取得
  const { data: spreadsheet } = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = spreadsheet.sheets.map(s => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
  }));
  const existingTitles = new Set(existingSheets.map(s => s.title));

  // 2. 既存の対象シートが初期化済みかチェック（A1 = HEADERS[0] かどうか）
  const initializedSheets = new Set();
  const sheetsToCheck = SHEET_NAMES.filter(name => existingTitles.has(name));
  if (sheetsToCheck.length > 0) {
    const { data: valData } = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: sheetsToCheck.map(name => `${name}!A1`),
    });
    (valData.valueRanges ?? []).forEach((vr, i) => {
      if (vr.values?.[0]?.[0] === HEADERS[0]) {
        initializedSheets.add(sheetsToCheck[i]);
      }
    });
  }

  // 3. 初期化が必要なシートを特定
  const toInitialize = SHEET_NAMES.filter(name => !initializedSheets.has(name));
  const toAdd = toInitialize.filter(name => !existingTitles.has(name));

  // 4. 不足シートを作成
  if (toAdd.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: toAdd.map(title => ({ addSheet: { properties: { title } } })),
      },
    });
  }

  // 5. 未初期化シートにヘッダー書き込み＋書式設定
  if (toInitialize.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: toInitialize.map(name => ({ range: `${name}!A1:H1`, values: [HEADERS] })),
      },
    });

    // シートIDを再取得（新規作成分を含むため）
    const { data: updated } = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetIdMap = {};
    updated.sheets.forEach(s => { sheetIdMap[s.properties.title] = s.properties.sheetId; });

    const formatRequests = toInitialize.flatMap(name => {
      const sheetId = sheetIdMap[name];
      return [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                backgroundColor: { red: 0.173, green: 0.173, blue: 0.173 },
                horizontalAlignment: 'CENTER',
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        ...COLUMN_WIDTHS.map((pixelSize, i) => ({
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
            properties: { pixelSize },
            fields: 'pixelSize',
          },
        })),
      ];
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: formatRequests },
    });
  }

  // 6. "シート1" を削除（存在する場合）
  let deletedSheet1 = false;
  const sheet1 = existingSheets.find(s => s.title === 'シート1');
  if (sheet1) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ deleteSheet: { sheetId: sheet1.sheetId } }] },
    });
    deletedSheet1 = true;
  }

  return { initialized: toInitialize, skipped: [...initializedSheets], deletedSheet1 };
}

module.exports = { updateCurrentSheet, appendHistorySheet, setupSheets, buildRows, formatDatetime, parseSpreadsheetId };
