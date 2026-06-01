const { scrapeTanaka }   = require('../lib/scrapers/tanaka');
const { scrapeTokuriki } = require('../lib/scrapers/tokuriki');
const { scrapeMaterial } = require('../lib/scrapers/material');
const { updateCurrentSheet, appendHistorySheet } = require('../lib/sheets');

module.exports = async function handler(req, res) {
  // CORSヘッダー（ローカル開発用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 3サイトを並列スクレイピング（1サイト失敗でも他は続行）
  const [tanakaResult, tokurikiResult, materialResult] = await Promise.allSettled([
    scrapeTanaka(),
    scrapeTokuriki(),
    scrapeMaterial(),
  ]);

  const tanaka   = tanakaResult.status   === 'fulfilled' ? tanakaResult.value   : null;
  const tokuriki = tokurikiResult.status === 'fulfilled' ? tokurikiResult.value : null;
  const material = materialResult.status === 'fulfilled' ? materialResult.value : null;

  // 失敗サイトのエラー情報を収集
  const errors = {};
  if (tanakaResult.status   === 'rejected') errors.tanaka   = tanakaResult.reason?.message;
  if (tokurikiResult.status === 'rejected') errors.tokuriki = tokurikiResult.reason?.message;
  if (materialResult.status === 'rejected') errors.material = materialResult.reason?.message;

  // Google Sheetsへの書き込み（現在価格上書き + 履歴追加）
  let sheetsError = null;
  try {
    await Promise.all([
      updateCurrentSheet(tanaka, tokuriki, material),
      appendHistorySheet(tanaka, tokuriki, material),
    ]);
  } catch (err) {
    sheetsError = err.message;
    console.error('Sheets書き込みエラー:', err);
  }

  return res.status(200).json({
    success: true,
    data: { tanaka, tokuriki, material },
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    sheetsError: sheetsError ?? undefined,
  });
};
