const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const path = require('path');
const fs = require('fs');
const { scrapeTokuriki } = require('../../lib/scrapers/tokuriki');

const mock = new MockAdapter(axios);
const URL = 'https://www.tokuriki-kanda.co.jp/goldetc/market/';
const fixtureHtml = fs.readFileSync(path.join(__dirname, '../fixtures/tokuriki.html'), 'utf-8');

afterEach(() => mock.reset());

describe('scrapeTokuriki', () => {
  describe('正常系', () => {
    test('4金属すべての価格を返す', async () => {
      mock.onGet(URL).reply(200, fixtureHtml);
      const result = await scrapeTokuriki();

      expect(result.gold).toEqual({ retail: 14900, buying: 14700 });
      expect(result.platinum).toEqual({ retail: 4900, buying: 4700 });
      expect(result.silver).toEqual({ retail: 108, buying: 98 });
      expect(result.palladium).toEqual({ retail: 4400, buying: 4200 });
    });

    test('カンマ区切り数値を正しく数値変換する', async () => {
      // 「金」のみ（"地金" は "金" を含むため他の金属と誤マッチする）
      const html = '<table><tr><td>金</td><td>14,900</td><td>14,700</td></tr></table>';
      mock.onGet(URL).reply(200, html);
      const result = await scrapeTokuriki();

      expect(result.gold.retail).toBe(14900);
      expect(result.gold.buying).toBe(14700);
    });

    test('td 列数が 3 未満の行はスキップする', async () => {
      const html = `<table>
        <tr><td>金</td><td>14900</td></tr>
        <tr><td>プラチナ</td><td>4900</td><td>4700</td></tr>
      </table>`;
      mock.onGet(URL).reply(200, html);
      const result = await scrapeTokuriki();

      expect(result.gold).toBeUndefined();
      expect(result.platinum).toEqual({ retail: 4900, buying: 4700 });
    });

    test('認識できない金属名の行はスキップする', async () => {
      const html = `<table>
        <tr><td>ロジウム</td><td>50000</td><td>49000</td></tr>
        <tr><td>金</td><td>14900</td><td>14700</td></tr>
      </table>`;
      mock.onGet(URL).reply(200, html);
      const result = await scrapeTokuriki();

      expect(Object.keys(result)).toEqual(['gold']);
    });

    test('価格が数値に変換できない場合は null を返す', async () => {
      const html = '<table><tr><td>金</td><td>－</td><td>－</td></tr></table>';
      mock.onGet(URL).reply(200, html);
      const result = await scrapeTokuriki();

      expect(result.gold.retail).toBeNull();
      expect(result.gold.buying).toBeNull();
    });
  });

  describe('異常系', () => {
    test('ネットワークエラーは例外をスローする', async () => {
      mock.onGet(URL).networkError();
      await expect(scrapeTokuriki()).rejects.toThrow();
    });

    test('タイムアウトは例外をスローする', async () => {
      mock.onGet(URL).timeout();
      await expect(scrapeTokuriki()).rejects.toThrow();
    });

    test('404 レスポンスは例外をスローする', async () => {
      mock.onGet(URL).reply(404);
      await expect(scrapeTokuriki()).rejects.toThrow();
    });
  });
});
