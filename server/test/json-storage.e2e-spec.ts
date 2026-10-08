import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { SessionsGateway } from '../src/sessions/sessions.gateway';
import { Test } from '@nestjs/testing';
import { INestApplication, Type } from '@nestjs/common';
import request from 'supertest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConnectionToken } from '@nestjs/mongoose';

const file = join(mkdtempSync(join(tmpdir(), 'pos-json-api-')), 'db.json');
const env = { ...process.env };
process.env.STORAGE_DRIVER = 'json';
process.env.JSON_DB_PATH = file;
process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD = 'test-password';
process.env.PHAJAY_SECRET_KEY = 'fake-test-key';
process.env.PHAJAY_TEST_KEY = 'fake-test-key';
process.env.PHAJAY_PAYMENT_MODE = 'sandbox';
process.env.MONGO_URI = 'mongodb://127.0.0.1:1/unreachable';
// Load storage configuration after setting the isolated test environment.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppModule } = require('../src/app.module') as {
  AppModule: Type<unknown>;
};

function body<T>(response: { body: unknown }): T {
  return response.body as T;
}

describe('JSON server API (no MongoDB, no real payment)', () => {
  let app: INestApplication<HttpServer>;
  let token: string;
  let productId: string;
  let paymentId: string;
  let orderNo: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  async function boot() {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  }
  beforeAll(boot);
  afterAll(async () => {
    await app.close();
    process.env = env;
  });
  it('starts without creating a MongoDB connection', () => {
    expect(() => app.get<unknown>(getConnectionToken())).toThrow();
  });
  it('authenticates and preserves product CRUD and RFID inventory', async () => {
    await request(app.getHttpServer())
      .post('/auth/admin/login')
      .send({ username: 'test-admin', password: 'wrong' })
      .expect(401);
    const login = await request(app.getHttpServer())
      .post('/auth/admin/login')
      .send({ username: 'test-admin', password: 'test-password' })
      .expect(201);
    token = body<{ accessToken: string }>(login).accessToken;
    const created = await request(app.getHttpServer())
      .post('/products')
      .set(auth())
      .send({
        name: 'Water',
        sku: 'DEMO-WATER',
        category: 'drink',
        basePrice: 1000,
      })
      .expect(201);
    productId = body<{ _id: string }>(created)._id;
    await request(app.getHttpServer())
      .put(`/products/${productId}`)
      .set(auth())
      .send({ basePrice: 1500 })
      .expect(200);
    await request(app.getHttpServer())
      .post('/tags/sync')
      .set(auth())
      .send({
        deviceId: 'TEST',
        productId,
        mode: 'add',
        tagIds: ['TAG1', 'TAG2', 'TAG1'],
      })
      .expect(201);
    const inventory = await request(app.getHttpServer())
      .get('/inventory/summary')
      .set(auth())
      .expect(200);
    expect(inventory.body).toEqual([
      { productId, name: 'Water', sku: 'DEMO-WATER', availableCount: 2 },
    ]);
  });
  it('accepts captures from the actual Go sender and emits the POS cart', async () => {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    await request(app.getHttpServer())
      .post('/session/set-mode')
      .send({ deviceId: 'RPi-POS-01', mode: 'CHECKOUT' })
      .expect(201);
    const gateway = app.get(SessionsGateway);
    const emit = jest.spyOn(gateway.server, 'emit');
    try {
      const result = await promisify(execFile)(
        'go',
        [
          'test',
          './cmd/cart_scanner',
          '-run',
          '^TestCaptureAgainstJSONServer$',
          '-count=1',
          '-v',
        ],
        {
          cwd: join(__dirname, '../../hub_scanner'),
          env: {
            ...process.env,
            RFID_TEST_SERVER_URL: `http://127.0.0.1:${address.port}`,
          },
          timeout: 30000,
        },
      );
      expect(result.stdout).toContain('PASS');
      expect(emit).toHaveBeenCalledWith(
        'scanUpdate',
        expect.objectContaining({
          deviceId: 'RPi-POS-01',
          mode: 'CHECKOUT',
          status: 'STABLE',
          result: expect.objectContaining({ totalPrice: 3000 }) as unknown,
        }),
      );
      expect(emit).toHaveBeenCalledWith(
        'scanUpdate',
        expect.objectContaining({
          deviceId: 'RPi-POS-01',
          status: 'IDLE',
          result: expect.objectContaining({
            items: [],
            totalPrice: 0,
          }) as unknown,
        }),
      );
    } finally {
      emit.mockRestore();
    }
  }, 35000);

  it('fails QR creation cleanly when the provider rejects or returns only a link', async () => {
    await request(app.getHttpServer())
      .post('/session/set-mode')
      .send({ deviceId: 'QR-FAIL', mode: 'CHECKOUT' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/tags/capture')
      .send({ deviceId: 'QR-FAIL', tagIds: ['TAG1', 'TAG2'], status: 'STABLE' })
      .expect(201);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Unavailable' }), {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactionId: 'invalid',
            link: 'onepay://qr/test',
          }),
          { status: 200 },
        ),
      );
    try {
      await request(app.getHttpServer())
        .post('/payments/phajay/qr')
        .send({ deviceId: 'QR-FAIL' })
        .expect(503);
      await request(app.getHttpServer())
        .post('/payments/phajay/qr')
        .send({ deviceId: 'QR-FAIL' })
        .expect(500);
      const database = JSON.parse(readFileSync(file, 'utf8')) as {
        collections: { payments: { deviceId: string; status: string }[] };
      };
      expect(
        database.collections.payments
          .filter((payment) => payment.deviceId === 'QR-FAIL')
          .map((payment) => payment.status),
      ).toEqual(['FAILED', 'FAILED']);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('does not confirm a QR payment or sell tags without an exact paid amount', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ transactionId: 'amount-test', qrCode: 'TEST-QR' }),
          { status: 200 },
        ),
      );
    try {
      const payment = await request(app.getHttpServer())
        .post('/payments/phajay/qr')
        .send({ deviceId: 'QR-FAIL' })
        .expect(201);
      const id = body<{ paymentId: string }>(payment).paymentId;
      const callback = await request(app.getHttpServer())
        .post('/payments/phajay/webhook')
        .send({ transactionId: 'amount-test', status: 'PAYMENT_COMPLETED' })
        .expect(201);
      expect(callback.body).toEqual({ message: 'AMOUNT_MISMATCH' });
      const status = await request(app.getHttpServer())
        .get(`/payments/phajay/${id}/status`)
        .expect(200);
      expect(body<{ status: string }>(status).status).toBe('FAILED');
      const snapshot = await request(app.getHttpServer())
        .get('/session/QR-FAIL/snapshot')
        .expect(200);
      expect(
        body<{ result: { totalPrice: number } }>(snapshot).result.totalPrice,
      ).toBe(3000);
      await request(app.getHttpServer())
        .get(`/payments/phajay/${id}/receipt`)
        .expect(400);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('cancels a waiting QR payment so the POS can start a fresh checkout', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ transactionId: 'cancel-test', qrCode: 'CANCEL-QR' }),
          { status: 200 },
        ),
      );
    try {
      const payment = await request(app.getHttpServer())
        .post('/payments/phajay/qr')
        .send({ deviceId: 'QR-FAIL', bank: 'bcel' })
        .expect(201);
      const id = body<{ paymentId: string }>(payment).paymentId;
      const cancelled = await request(app.getHttpServer())
        .post(`/payments/phajay/${id}/cancel`)
        .send({ deviceId: 'QR-FAIL' })
        .expect(201);
      expect(cancelled.body).toEqual(
        expect.objectContaining({ paymentId: id, status: 'CANCELLED' }),
      );
      const status = await request(app.getHttpServer())
        .get(`/payments/phajay/${id}/status`)
        .expect(200);
      expect(body<{ status: string }>(status).status).toBe('CANCELLED');
      await request(app.getHttpServer())
        .post(`/payments/phajay/${id}/cancel`)
        .send({ deviceId: 'QR-FAIL' })
        .expect(201);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each(['bcel', 'jdb', 'ldb', 'ib', 'stb', 'm-money'])(
    'uses the selected sandbox bank %s and sandbox endpoint',
    async (bank) => {
      const previousPath = process.env.PHAJAY_QR_PATH;
      const previousBase = process.env.PHAJAY_BASE_URL;
      process.env.PHAJAY_QR_PATH = '/v1/api/test/payment/generate-{bank}-qr';
      process.env.PHAJAY_BASE_URL = 'https://sandbox.invalid';
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            transactionId: `bank-${bank}`,
            qrCode: `QR-${bank}`,
          }),
          { status: 200 },
        ),
      );
      try {
        const payment = await request(app.getHttpServer())
          .post('/payments/phajay/qr')
          .send({ deviceId: 'QR-FAIL', bank })
          .expect(201);
        expect(body<{ bank: string }>(payment).bank).toBe(bank);
        expect(fetchSpy).toHaveBeenCalledWith(
          `https://sandbox.invalid/v1/api/test/payment/generate-${bank}-qr`,
          expect.objectContaining({
            headers: expect.objectContaining({
              secretKey: 'fake-test-key',
            }) as unknown,
          }) as unknown,
        );
      } finally {
        fetchSpy.mockRestore();
        if (previousPath === undefined) delete process.env.PHAJAY_QR_PATH;
        else process.env.PHAJAY_QR_PATH = previousPath;
        if (previousBase === undefined) delete process.env.PHAJAY_BASE_URL;
        else process.env.PHAJAY_BASE_URL = previousBase;
      }
    },
  );

  it('rejects invalid bank choices and never falls back to a test key for production QR', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const secretKey = process.env.PHAJAY_SECRET_KEY;
    try {
      for (const bank of ['unsupported', '../test', {}, 123]) {
        await request(app.getHttpServer())
          .post('/payments/phajay/qr')
          .send({ deviceId: 'QR-FAIL', bank })
          .expect(400);
      }
      delete process.env.PHAJAY_SECRET_KEY;
      process.env.PHAJAY_TEST_KEY = 'fake-test-key';
      await request(app.getHttpServer())
        .post('/payments/phajay/qr')
        .send({ deviceId: 'QR-FAIL', bank: 'bcel' })
        .expect(503);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      process.env.PHAJAY_SECRET_KEY = secretKey;
    }
  });

  it('calculates checkout, snapshots payment and handles duplicate callbacks', async () => {
    await request(app.getHttpServer())
      .post('/session/set-mode')
      .send({ deviceId: 'TEST', mode: 'CHECKOUT' })
      .expect(201);
    const scan = await request(app.getHttpServer())
      .post('/tags/capture')
      .send({
        deviceId: 'TEST',
        tagIds: ['TAG1', 'TAG2', 'TAG1', 'UNKNOWN'],
        status: 'STABLE',
      })
      .expect(201);
    expect(body<{ totalPrice: number }>(scan).totalPrice).toBe(3000);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          transactionId: 'qr-test-transaction',
          qrCode: '0002010102115303418540430005802LA6304ABCD',
          link: 'onepay://qr/test',
        }),
        { status: 200 },
      ),
    );
    process.env.PHAJAY_TEST_KEY = 'fake-test-key';
    try {
      const payment = await request(app.getHttpServer())
        .post('/payments/phajay/qr')
        .send({ deviceId: 'TEST' })
        .expect(201);
      paymentId = body<{ paymentId: string }>(payment).paymentId;
      orderNo = body<{ orderNo: string }>(payment).orderNo;
      expect(payment.body).toEqual(
        expect.objectContaining({
          amount: 3000,
          bank: 'bcel',
          qrCode: expect.any(String) as unknown,
        }),
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://payment-gateway.phajay.co/v1/api/payment/generate-bcel-qr',
        expect.objectContaining({
          headers: expect.objectContaining({
            secretKey: 'fake-test-key',
          }) as unknown,
          body: expect.any(String) as unknown,
        }) as unknown,
      );
      const requestBody = fetchSpy.mock.calls[0][1]?.body;
      if (typeof requestBody !== 'string')
        throw new Error('QR request body must be JSON');
      const sent = JSON.parse(requestBody) as {
        orderNo: string;
        amount: number;
      };
      expect(sent).toEqual(expect.objectContaining({ orderNo, amount: 3000 }));
    } finally {
      fetchSpy.mockRestore();
    }
    await request(app.getHttpServer())
      .get(`/payments/phajay/${paymentId}/receipt`)
      .expect(400);
    const callback = {
      transactionId: 'qr-test-transaction',
      status: 'PAYMENT_COMPLETED',
      txnAmount: 3000,
    };
    await request(app.getHttpServer())
      .post('/payments/phajay/webhook')
      .send(callback)
      .expect(201);
    await request(app.getHttpServer())
      .post('/payments/phajay/webhook')
      .send(callback)
      .expect(201);
    const receipt = await request(app.getHttpServer())
      .get(`/payments/phajay/${paymentId}/receipt`)
      .expect(200);
    expect(body<{ items: unknown[] }>(receipt).items).toEqual([
      { name: 'Water', count: 2, subtotal: 3000 },
    ]);
    const snapshot = await request(app.getHttpServer())
      .get('/session/TEST/snapshot')
      .expect(200);
    expect(
      body<{ result: { items: unknown[] } }>(snapshot).result.items,
    ).toEqual([]);
    const inventory = await request(app.getHttpServer())
      .get('/inventory/summary')
      .set(auth())
      .expect(200);
    expect(inventory.body).toEqual([]);
  });
  it('recovers raw CHECK scans, preserves scanning status and explains unavailable checkout tags', async () => {
    await request(app.getHttpServer())
      .post('/tags/sync')
      .set(auth())
      .send({ deviceId: 'REG', mode: 'add', productId, tagIds: ['SOLD-TAG'] })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/tags/confirm-sale')
      .set(auth())
      .send({ transactionId: 'TEST-SALE', tagIds: ['SOLD-TAG'] })
      .expect(200);
    await request(app.getHttpServer())
      .post('/session/set-mode')
      .send({ deviceId: 'REG', mode: 'CHECK' })
      .expect(201);
    const ids = ['TAG1', 'SOLD-TAG', 'UNREGISTERED-TAG'];
    await request(app.getHttpServer())
      .post('/tags/capture')
      .send({ deviceId: 'REG', tagIds: ids, status: 'SCANNING' })
      .expect(201);
    const checked = await request(app.getHttpServer())
      .get('/session/REG/snapshot')
      .expect(200);
    expect(checked.body).toMatchObject({
      mode: 'CHECK',
      status: 'SCANNING',
      tagIds: [...ids].sort(),
      result: { tagIds: [...ids].sort(), unknownTagIds: ['UNREGISTERED-TAG'] },
    });
    await request(app.getHttpServer())
      .post('/session/set-mode')
      .send({ deviceId: 'REG', mode: 'CHECKOUT' })
      .expect(201);
    const checkout = await request(app.getHttpServer())
      .get('/session/REG/snapshot')
      .expect(200);
    expect(checkout.body).toMatchObject({
      mode: 'CHECKOUT',
      status: 'SCANNING',
      result: {
        items: [],
        unknownTagIds: ['UNREGISTERED-TAG'],
        unavailableTagIds: expect.arrayContaining([
          'SOLD-TAG',
          'TAG1',
        ]) as unknown,
      },
    });
    // TAG1 was sold by the preceding payment test. Editing retained tags must
    // preserve that status, rather than silently reintroducing sold stock.
    await request(app.getHttpServer())
      .post('/tags/sync')
      .set(auth())
      .send({
        deviceId: 'REG',
        mode: 'replace',
        productId,
        tagIds: ['TAG1', 'TAG2', 'SOLD-TAG'],
      })
      .expect(201);
    const tags = await request(app.getHttpServer())
      .get(`/tags/product/${productId}`)
      .set(auth())
      .expect(200);
    expect(
      body<{ status: string }[]>(tags).every((tag) => tag.status === 'sold'),
    ).toBe(true);
  });
  it('recovers the same admin, prices, sold tags and receipt after restart', async () => {
    await app.close();
    await boot();
    await request(app.getHttpServer())
      .get('/auth/admin/me')
      .set(auth())
      .expect(200);
    const product = await request(app.getHttpServer())
      .get(`/products/${productId}`)
      .expect(200);
    expect(body<{ basePrice: number }>(product).basePrice).toBe(1500);
    const receipt = await request(app.getHttpServer())
      .get(`/payments/phajay/${paymentId}/receipt`)
      .expect(200);
    expect(body<{ amount: number }>(receipt).amount).toBe(3000);
    const tags = await request(app.getHttpServer())
      .get(`/tags/product/${productId}`)
      .set(auth())
      .expect(200);
    expect(
      body<{ status: string }[]>(tags).every(
        (tag: { status: string }) => tag.status === 'sold',
      ),
    ).toBe(true);
  });
});
