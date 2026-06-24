const { setupSheets } = require('../lib/sheets');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const spreadsheetId = req.body?.spreadsheetId;
    const result = await setupSheets(spreadsheetId);

    const parts = [];
    if (result.initialized.length > 0) {
      parts.push(`「${result.initialized.join('」「')}」を初期化しました`);
    }
    if (result.skipped.length > 0) {
      parts.push(`「${result.skipped.join('」「')}」は初期化済みのためスキップ`);
    }
    if (result.deletedSheet1) {
      parts.push('「シート1」を削除しました');
    }
    const message = parts.length > 0 ? parts.join('。') : 'すべてのシートは初期化済みです';

    return res.status(200).json({ success: true, message });
  } catch (err) {
    console.error('シート初期化エラー:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
