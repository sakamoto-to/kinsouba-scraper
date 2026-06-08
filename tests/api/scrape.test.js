const httpMocks = require('node-mocks-http');

// スクレイパーと Sheets をモック
jest.mock('../../lib/scrapers/tanaka',   () => ({ scrapeTanaka:   jest.fn() }));
jest.mock('../../lib/scrapers/tokuriki', () => ({ scrapeTokuriki: jest.fn() }));
jest.mock('../../lib/scrapers/material', () => ({ scrapeMaterial: jest.fn() }));
jest.mock('../../lib/sheets', () => ({
  updateCurrentSheet: jest.fn().mockResolvedValue({}),
  appendHistorySheet: jest.fn().mockResolvedValue({}),
}));

const { scrapeTanaka }   = require('../../lib/scrapers/tanaka');
const { scrapeTokuriki } = require('../../lib/scrapers/tokuriki');
const { scrapeMaterial } = require('../../lib/scrapers/material');
const { updateCurrentSheet, appendHistorySheet } = require('../../lib/sheets');
const handler = require('../../api/scrape');

// テスト用ダミーデータ
const dummyTanaka   = { gold: { retail: 15000, buying: 14800 } };
const dummyTokuriki = { gold: { retail: 14900, buying: 14700 } };
const dummyMaterial = { gold: { retail: 14800, buying: 14600 } };

beforeEach(() => {
  jest.clearAllMocks();
  scrapeTanaka.mockResolvedValue(dummyTanaka);
  scrapeTokuriki.mockResolvedValue(dummyTokuriki);
  scrapeMaterial.mockResolvedValue(dummyMaterial);
});

// ─── CORS / メソッド制御 ────────────────────────────────────────

describe('HTTPメソッド', () => {
  test('OPTIONS リクエストは 200 で即終了する（CORS preflight）', async () => {
    const req = httpMocks.createRequest({ method: 'OPTIONS' });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    // スクレイピングは実行されない
    expect(scrapeTanaka).not.toHaveBeenCalled();
  });

  test('GET リクエストは 405 を返す', async () => {
    const req = httpMocks.createRequest({ method: 'GET' });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res._getJSONData()).toEqual({ error: 'Method Not Allowed' });
  });

  test('PUT リクエストは 405 を返す', async () => {
    const req = httpMocks.createRequest({ method: 'PUT' });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
  });

  test('CORS ヘッダーが設定される', async () => {
    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.getHeader('Access-Control-Allow-Origin')).toBe('*');
    expect(res.getHeader('Access-Control-Allow-Methods')).toContain('POST');
  });
});

// ─── POST 正常系 ────────────────────────────────────────────────

describe('POST 正常系', () => {
  test('success:true と3社データを返す', async () => {
    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res._getJSONData();
    expect(body.success).toBe(true);
    expect(body.data.tanaka).toEqual(dummyTanaka);
    expect(body.data.tokuriki).toEqual(dummyTokuriki);
    expect(body.data.material).toEqual(dummyMaterial);
  });

  test('errors キーが存在しない（全サイト成功時）', async () => {
    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();

    await handler(req, res);

    const body = res._getJSONData();
    expect(body.errors).toBeUndefined();
  });

  test('sheetsError キーが存在しない（Sheets 成功時）', async () => {
    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();

    await handler(req, res);

    const body = res._getJSONData();
    expect(body.sheetsError).toBeUndefined();
  });

  test('Sheets の update と append が両方呼ばれる', async () => {
    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(updateCurrentSheet).toHaveBeenCalledTimes(1);
    expect(appendHistorySheet).toHaveBeenCalledTimes(1);
  });
});

// ─── POST 一部失敗 ────────────────────────────────────────────────

describe('POST 一部失敗', () => {
  test('1サイト失敗時でもステータス 200 を返す', async () => {
    scrapeTokuriki.mockRejectedValue(new Error('connect ETIMEDOUT'));

    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
  });

  test('失敗したサイト名が errors に含まれる', async () => {
    scrapeTokuriki.mockRejectedValue(new Error('connect ETIMEDOUT'));

    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();
    await handler(req, res);

    const body = res._getJSONData();
    expect(body.errors).toBeDefined();
    expect(body.errors.tokuriki).toBe('connect ETIMEDOUT');
  });

  test('失敗サイトのデータは null になる', async () => {
    scrapeTokuriki.mockRejectedValue(new Error('timeout'));

    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();
    await handler(req, res);

    const body = res._getJSONData();
    expect(body.data.tokuriki).toBeNull();
    expect(body.data.tanaka).toEqual(dummyTanaka);
    expect(body.data.material).toEqual(dummyMaterial);
  });

  test('全サイト失敗してもステータス 200 を返す', async () => {
    scrapeTanaka.mockRejectedValue(new Error('err'));
    scrapeTokuriki.mockRejectedValue(new Error('err'));
    scrapeMaterial.mockRejectedValue(new Error('err'));

    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res._getJSONData();
    expect(body.errors.tanaka).toBeDefined();
    expect(body.errors.tokuriki).toBeDefined();
    expect(body.errors.material).toBeDefined();
  });
});

// ─── Sheets エラー ────────────────────────────────────────────────

describe('Sheets 書き込みエラー', () => {
  test('Sheets 失敗時でもステータス 200 を返す', async () => {
    updateCurrentSheet.mockRejectedValue(new Error('Sheets quota exceeded'));

    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
  });

  test('sheetsError にエラーメッセージが含まれる', async () => {
    updateCurrentSheet.mockRejectedValue(new Error('Sheets quota exceeded'));

    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();
    await handler(req, res);

    const body = res._getJSONData();
    expect(body.sheetsError).toBe('Sheets quota exceeded');
  });

  test('Sheets エラー時もスクレイピングデータは返る', async () => {
    updateCurrentSheet.mockRejectedValue(new Error('Sheets quota exceeded'));

    const req = httpMocks.createRequest({ method: 'POST' });
    const res = httpMocks.createResponse();
    await handler(req, res);

    const body = res._getJSONData();
    expect(body.data.tanaka).toEqual(dummyTanaka);
  });
});
