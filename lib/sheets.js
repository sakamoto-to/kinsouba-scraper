const { google } = require('googleapis');

// スプレッドシートIDと認証情報を環境変数から取得
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// 金属の表示順
const METAL_ORDER = ['gold', 'platinum', 'silver', 'palladium'];
const METAL_LABELS = {
  gold:      '金',
  platinum:  'プラチナ',
  silver:    '銀',
  palladium: 'パラジウム',
};

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
 */
async function updateCurrentSheet(tanaka, tokuriki, material) {
  const sheets = getSheetsClient();
  const datetime = formatDatetime(new Date());
  const rows = buildRows(tanaka, tokuriki, material, datetime);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: '現在価格!A2:H5',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

/**
 * 「履歴」シートの末尾に行追加
 */
async function appendHistorySheet(tanaka, tokuriki, material) {
  const sheets = getSheetsClient();
  const datetime = formatDatetime(new Date());
  const rows = buildRows(tanaka, tokuriki, material, datetime);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
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

module.exports = { updateCurrentSheet, appendHistorySheet };
