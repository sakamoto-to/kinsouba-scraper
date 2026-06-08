const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const path = require('path');
const fs = require('fs');
const { scrapeTanaka } = require('../../lib/scrapers/tanaka');

const mock = new MockAdapter(axios);
const URL = 'https://gold.tanaka.co.jp/commodity/souba/index.php';
const fixtureHtml = fs.readFileSync(path.join(__dirname, '../fixtures/tanaka.html'), 'utf-8');

afterEach(() => mock.reset());

describe('scrapeTanaka', () => {
  describe('正常系', () => {
    test('4金属すべての価格を返す', async () => {
      mock.onGet(URL).reply(200, fixtureHtml);
      const result = await scrapeTanaka();

      expect(result.gold).toEqual({ retail: 15000, buying: 14800 });
      expect(result.platinum).toEqual({ retail: 5000, buying: 4800 });
      expect(result.silver).toEqual({ retail: 110, buying: 100 });
      expect(result.palladium).toEqual({ retail: 4500, buying: 4300 });
    });

    test('カンマ区切り数値を正しく数値変換する', async () => {
      const html = '<table><tr><td>金</td><td>15,000</td><td>14,800</td></tr></table>';
      mock.onGet(URL).reply(200, html);
      const result = await scrapeTanaka();

      expect(result.gold.retail).toBe(15000);
      expect(result.gold.buying).toBe(14800);
    });

    test('td 列数が 3 未満の行はスキップする', async () => {
      const html = `<table>
        <tr><td>金</td><td>15000</td></tr>
        <tr><td>プラチナ</td><td>5000</td><td>4800</td></tr>
      </table>`;
      mock.onGet(URL).reply(200, html);
      const result = await scrapeTanaka();

      expect(result.gold).toBeUndefined();
      expect(result.platinum).toEqual({ retail: 5000, buying: 4800 });
    });

    test('認識できない金属名の行はスキップする', async () => {
      const html = `<table>
        <tr><td>ロジウム</td><td>50000</td><td>49000</td></tr>
        <tr><td>金</td><td>15000</td><td>14800</td></tr>
      </table>`;
      mock.onGet(URL).reply(200, html);
      const result = await scrapeTanaka();

      expect(Object.keys(result)).toEqual(['gold']);
      expect(result.gold).toEqual({ retail: 15000, buying: 14800 });
    });

    test('価格が数値に変換できない場合は null を返す', async () => {
      const html = '<table><tr><td>金</td><td>－</td><td>－</td></tr></table>';
      mock.onGet(URL).reply(200, html);
      const result = await scrapeTanaka();

      expect(result.gold.retail).toBeNull();
      expect(result.gold.buying).toBeNull();
    });
  });

  describe('異常系', () => {
    test('ネットワークエラーは例外をスローする', async () => {
      mock.onGet(URL).networkError();
      await expect(scrapeTanaka()).rejects.toThrow();
    });

    test('タイムアウトは例外をスローする', async () => {
      mock.onGet(URL).timeout();
      await expect(scrapeTanaka()).rejects.toThrow();
    });

    test('404 レスポンスは例外をスローする', async () => {
      mock.onGet(URL).reply(404);
      await expect(scrapeTanaka()).rejects.toThrow();
    });
  });
});
