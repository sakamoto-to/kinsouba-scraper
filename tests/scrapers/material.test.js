const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const path = require('path');
const fs = require('fs');
const { scrapeMaterial } = require('../../lib/scrapers/material');

const mock = new MockAdapter(axios);
const URL = 'https://www.material.co.jp/cgi-bin/market/data.cgi';
const fixtureHtml = fs.readFileSync(path.join(__dirname, '../fixtures/material.html'), 'utf-8');

afterEach(() => mock.reset());

describe('scrapeMaterial', () => {
  describe('正常系', () => {
    test('4金属すべての価格を返す', async () => {
      mock.onGet(URL).reply(200, fixtureHtml);
      const result = await scrapeMaterial();

      expect(result.gold).toEqual({ retail: 14800, buying: 14600 });
      expect(result.platinum).toEqual({ retail: 4800, buying: 4600 });
      expect(result.silver).toEqual({ retail: 105, buying: 95 });
      expect(result.palladium).toEqual({ retail: 4300, buying: 4100 });
    });

    test('カンマ区切り数値を正しく数値変換する', async () => {
      const html = '<table><tr><td>金</td><td>14,800</td><td>14,600</td></tr></table>';
      mock.onGet(URL).reply(200, html);
      const result = await scrapeMaterial();

      expect(result.gold.retail).toBe(14800);
      expect(result.gold.buying).toBe(14600);
    });

    test('td 列数が 3 未満の行はスキップする', async () => {
      const html = `<table>
        <tr><td>金</td><td>14800</td></tr>
        <tr><td>プラチナ</td><td>4800</td><td>4600</td></tr>
      </table>`;
      mock.onGet(URL).reply(200, html);
      const result = await scrapeMaterial();

      expect(result.gold).toBeUndefined();
      expect(result.platinum).toEqual({ retail: 4800, buying: 4600 });
    });

    test('認識できない金属名の行はスキップする', async () => {
      const html = `<table>
        <tr><td>ロジウム</td><td>50000</td><td>49000</td></tr>
        <tr><td>金</td><td>14800</td><td>14600</td></tr>
      </table>`;
      mock.onGet(URL).reply(200, html);
      const result = await scrapeMaterial();

      expect(Object.keys(result)).toEqual(['gold']);
    });

    test('価格が数値に変換できない場合は null を返す', async () => {
      const html = '<table><tr><td>金</td><td>－</td><td>－</td></tr></table>';
      mock.onGet(URL).reply(200, html);
      const result = await scrapeMaterial();

      expect(result.gold.retail).toBeNull();
      expect(result.gold.buying).toBeNull();
    });
  });

  describe('異常系', () => {
    test('ネットワークエラーは例外をスローする', async () => {
      mock.onGet(URL).networkError();
      await expect(scrapeMaterial()).rejects.toThrow();
    });

    test('タイムアウトは例外をスローする', async () => {
      mock.onGet(URL).timeout();
      await expect(scrapeMaterial()).rejects.toThrow();
    });

    test('404 レスポンスは例外をスローする', async () => {
      mock.onGet(URL).reply(404);
      await expect(scrapeMaterial()).rejects.toThrow();
    });
  });
});
