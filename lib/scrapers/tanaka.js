const axios = require('axios');
const cheerio = require('cheerio');

const URL = 'https://gold.tanaka.co.jp/commodity/souba/index.php';

// 金属名とHTMLのid/クラスのマッピング
const METAL_KEYS = {
  gold:      '金',
  platinum:  'プラチナ',
  silver:    '銀',
  palladium: 'パラジウム',
};

/**
 * 田中貴金属の価格ページをスクレイピングして4金属の価格を返す
 * @returns {{ gold, platinum, silver, palladium }} 各 { retail, buying }
 */
async function scrapeTanaka() {
  const { data: html } = await axios.get(URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 8000,
  });

  const $ = cheerio.load(html);
  const result = {};

  // テーブル行を走査して金属名と価格を取得
  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 3) return;

    const metalText = $(cells[0]).text().trim();

    let metalKey = null;
    for (const [key, name] of Object.entries(METAL_KEYS)) {
      if (metalText.includes(name)) {
        metalKey = key;
        break;
      }
    }
    if (!metalKey) return;

    // 価格文字列から数値を抽出（カンマ除去）
    const parsePrice = (cell) => {
      const text = $(cell).text().replace(/,/g, '').trim();
      const num = parseFloat(text);
      return isNaN(num) ? null : num;
    };

    result[metalKey] = {
      retail: parsePrice(cells[1]),
      buying: parsePrice(cells[2]),
    };
  });

  return result;
}

module.exports = { scrapeTanaka };
