// googleapis をモック（jest.mock はファイル先頭にホイスト）
jest.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({})),
    },
    sheets: jest.fn().mockReturnValue({
      spreadsheets: {
        values: {
          update: jest.fn().mockResolvedValue({ data: {} }),
          append: jest.fn().mockResolvedValue({ data: {} }),
        },
      },
    }),
  },
}));

// SPREADSHEET_ID はモジュールロード時に読まれるため、require より前に設定する
process.env.SPREADSHEET_ID                = 'test-spreadsheet-id';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL  = 'test@test.iam.gserviceaccount.com';
process.env.GOOGLE_PRIVATE_KEY            = '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n';

const { google } = require('googleapis');
const { buildRows, formatDatetime, updateCurrentSheet, appendHistorySheet, parseSpreadsheetId } = require('../lib/sheets');

// sheets クライアントのモックインスタンスを取得するヘルパー
const getMockValues = () => google.sheets().spreadsheets.values;

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── parseSpreadsheetId ────────────────────────────────────────

describe('parseSpreadsheetId', () => {
  test('フルURLからIDを抽出する', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1HdcdREGJH_8CGsX9hiUk5KueM1uw1PYMnVb-YcVAO74/edit?gid=0#gid=0';
    expect(parseSpreadsheetId(url)).toBe('1HdcdREGJH_8CGsX9hiUk5KueM1uw1PYMnVb-YcVAO74');
  });

  test('ID単体はそのまま返す', () => {
    expect(parseSpreadsheetId('1HdcdREGJH_8CGsX9hiUk5KueM1uw1PYMnVb-YcVAO74')).toBe('1HdcdREGJH_8CGsX9hiUk5KueM1uw1PYMnVb-YcVAO74');
  });

  test('/edit なしのURLも正しく抽出する', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1HdcdREGJH_8CGsX9hiUk5KueM1uw1PYMnVb-YcVAO74';
    expect(parseSpreadsheetId(url)).toBe('1HdcdREGJH_8CGsX9hiUk5KueM1uw1PYMnVb-YcVAO74');
  });

  test('undefined はそのまま返す', () => {
    expect(parseSpreadsheetId(undefined)).toBeUndefined();
  });
});

// ─── buildRows ────────────────────────────────────────────────

describe('buildRows', () => {
  const tanaka = {
    gold:      { retail: 15000, buying: 14800 },
    platinum:  { retail: 5000,  buying: 4800  },
    silver:    { retail: 110,   buying: 100   },
    palladium: { retail: 4500,  buying: 4300  },
  };
  const tokuriki = {
    gold:      { retail: 14900, buying: 14700 },
    platinum:  { retail: 4900,  buying: 4700  },
    silver:    { retail: 108,   buying: 98    },
    palladium: { retail: 4400,  buying: 4200  },
  };
  const material = {
    gold:      { retail: 14800, buying: 14600 },
    platinum:  { retail: 4800,  buying: 4600  },
    silver:    { retail: 105,   buying: 95    },
    palladium: { retail: 4300,  buying: 4100  },
  };

  test('4行×8列の2次元配列を返す', () => {
    const rows = buildRows(tanaka, tokuriki, material, '2026/06/01 12:00');
    expect(rows).toHaveLength(4);
    rows.forEach((row) => expect(row).toHaveLength(8));
  });

  test('金属名・各社価格・日時が正しい順序で並ぶ', () => {
    const rows = buildRows(tanaka, tokuriki, material, '2026/06/01 12:00');
    const [gold, platinum, silver, palladium] = rows;

    expect(gold[0]).toBe('金');
    expect(gold[1]).toBe(15000);  // 田中小売
    expect(gold[2]).toBe(14800);  // 田中買取
    expect(gold[3]).toBe(14900);  // 徳力小売
    expect(gold[4]).toBe(14700);  // 徳力買取
    expect(gold[5]).toBe(14800);  // マテリアル小売
    expect(gold[6]).toBe(14600);  // マテリアル買取
    expect(gold[7]).toBe('2026/06/01 12:00');

    expect(platinum[0]).toBe('プラチナ');
    expect(silver[0]).toBe('銀');
    expect(palladium[0]).toBe('パラジウム');
  });

  test('1社が null の場合、該当列は空文字になる', () => {
    const rows = buildRows(tanaka, null, material, '2026/06/01 12:00');
    const [gold] = rows;

    expect(gold[3]).toBe('');  // 徳力小売（null）
    expect(gold[4]).toBe('');  // 徳力買取（null）
    expect(gold[1]).toBe(15000);  // 田中は正常
  });

  test('全社 null でも4行返す', () => {
    const rows = buildRows(null, null, null, '2026/06/01 12:00');
    expect(rows).toHaveLength(4);
    rows.forEach((row) => {
      expect(row[1]).toBe('');
      expect(row[3]).toBe('');
      expect(row[5]).toBe('');
    });
  });
});

// ─── formatDatetime ────────────────────────────────────────────

describe('formatDatetime', () => {
  test('YYYY/MM/DD HH:mm 形式で返す', () => {
    const date = new Date(2026, 5, 1, 9, 5);  // 2026-06-01 09:05
    expect(formatDatetime(date)).toBe('2026/06/01 09:05');
  });

  test('月・日・時・分をゼロ埋めする', () => {
    const date = new Date(2026, 0, 3, 8, 7);  // 2026-01-03 08:07
    expect(formatDatetime(date)).toBe('2026/01/03 08:07');
  });

  test('12月31日 23:59 も正しくフォーマットする', () => {
    const date = new Date(2026, 11, 31, 23, 59);
    expect(formatDatetime(date)).toBe('2026/12/31 23:59');
  });
});

// ─── updateCurrentSheet ────────────────────────────────────────

describe('updateCurrentSheet', () => {
  test('values.update を正しい range と値で呼ぶ', async () => {
    const tanaka = { gold: { retail: 15000, buying: 14800 }, platinum: { retail: 5000, buying: 4800 }, silver: { retail: 110, buying: 100 }, palladium: { retail: 4500, buying: 4300 } };

    await updateCurrentSheet(tanaka, null, null);

    const { update } = getMockValues();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'test-spreadsheet-id',
        range: '現在価格!A2:H5',
        valueInputOption: 'USER_ENTERED',
      })
    );
  });

  test('values.update のリクエストボディに4行のデータが含まれる', async () => {
    await updateCurrentSheet(null, null, null);

    const { update } = getMockValues();
    const call = update.mock.calls[0][0];
    expect(call.requestBody.values).toHaveLength(4);
  });

  test('Sheets API がエラーを返した場合は例外をスローする', async () => {
    getMockValues().update.mockRejectedValueOnce(new Error('API Error'));

    await expect(updateCurrentSheet(null, null, null)).rejects.toThrow('API Error');
  });
});

// ─── appendHistorySheet ────────────────────────────────────────

describe('appendHistorySheet', () => {
  test('values.append を正しい range と InsertDataOption で呼ぶ', async () => {
    await appendHistorySheet(null, null, null);

    const { append } = getMockValues();
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'test-spreadsheet-id',
        range: '履歴!A:H',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
      })
    );
  });

  test('values.append のリクエストボディに4行のデータが含まれる', async () => {
    await appendHistorySheet(null, null, null);

    const { append } = getMockValues();
    const call = append.mock.calls[0][0];
    expect(call.requestBody.values).toHaveLength(4);
  });

  test('Sheets API がエラーを返した場合は例外をスローする', async () => {
    getMockValues().append.mockRejectedValueOnce(new Error('Append Error'));

    await expect(appendHistorySheet(null, null, null)).rejects.toThrow('Append Error');
  });
});
