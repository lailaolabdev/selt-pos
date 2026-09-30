import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, parseDatabase } from './json-store';
import { createJsonModels } from './json-model';
import { MODEL_DEFINITIONS } from './model-definitions';

const productData = {
  name: 'Water',
  sku: 'WATER',
  category: 'drink',
  basePrice: 1000,
};
describe('JSON persistence without MongoDB', () => {
  let store: JsonStore;
  let models: ReturnType<typeof createJsonModels>;
  beforeEach(() => {
    store = new JsonStore(
      join(mkdtempSync(join(tmpdir(), 'pos-json-')), 'db.json'),
    );
    models = createJsonModels(store, MODEL_DEFINITIONS);
  });
  afterEach(async () => {
    await store.onModuleDestroy();
  });

  it('preserves ObjectIds, defaults, populated references and dates after restart', async () => {
    const Product = models.get('Product')!,
      Tag = models.get('RFIDTag')!;
    const product = await new Product(productData).save();
    await new Tag({ tagId: 'TAG1', productId: product._id }).save();
    const tag = await Tag.findOne({ tagId: 'TAG1' })
      .populate('productId')
      .exec();
    expect(tag?.get('productId').name).toBe('Water');
    expect(tag?.get('lastSeenAt')).toBeInstanceOf(Date);
    expect(tag?.get('status')).toBe('available');
    const file = store.file;
    await store.onModuleDestroy();
    store = new JsonStore(file);
    models = createJsonModels(store, MODEL_DEFINITIONS);
    const restored = await models
      .get('RFIDTag')!
      .findOne({ tagId: 'TAG1' })
      .populate('productId');
    expect(String(restored?.get('productId')._id)).toBe(String(product._id));
    expect(restored?.get('lastSeenAt')).toBeInstanceOf(Date);
  });

  it('serializes parallel writes and enforces uniqueness and schema validation', async () => {
    const Product = models.get('Product')!;
    const results = await Promise.allSettled([
      new Product(productData).save(),
      new Product(productData).save(),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await Product.find()).toHaveLength(1);
    await expect(
      new Product({ name: 'Missing required fields' }).save(),
    ).rejects.toThrow();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        new Product({ ...productData, sku: `SKU${i}` }).save(),
      ),
    );
    expect(await Product.find()).toHaveLength(13);
    expect(
      parseDatabase(readFileSync(store.file, 'utf8')).collections.products,
    ).toHaveLength(13);
  });

  it('updates only dirty fields and persists explicit removal', async () => {
    const Session = models.get('DeviceSession')!;
    const session = await new Session({
      deviceId: 'POS',
      currentBasketId: 'basket',
    }).save();
    const first = await Session.findById(session._id),
      second = await Session.findById(session._id);
    first!.set('currentMode', 'CHECKOUT');
    second!.set('lastScanData', ['TAG']);
    await Promise.all([first!.save(), second!.save()]);
    const next = await Session.findById(session._id);
    expect(next?.get('currentMode')).toBe('CHECKOUT');
    expect(next?.get('lastScanData')).toEqual(['TAG']);
    next!.set('currentBasketId', undefined);
    await next!.save();
    expect(
      (await Session.findById(session._id))?.get('currentBasketId'),
    ).toBeUndefined();
  });

  it('supports idempotent bulk sale updates, lean and $or lookups', async () => {
    const Product = models.get('Product')!,
      Tag = models.get('RFIDTag')!;
    const product = await new Product(productData).save();
    await new Tag({ tagId: 'TAG1', productId: product._id }).save();
    const filter = { tagId: { $in: ['TAG1'] }, status: 'available' };
    expect(
      (await Tag.updateMany(filter, { $set: { status: 'sold' } }))
        .modifiedCount,
    ).toBe(1);
    expect(
      (await Tag.updateMany(filter, { $set: { status: 'sold' } }))
        .modifiedCount,
    ).toBe(0);
    expect(
      (
        await Tag.findOne({
          $or: [{ tagId: 'other' }, { tagId: 'TAG1' }],
        }).lean()
      )?.status,
    ).toBe('sold');
  });

  it('supports payment failure audit append without changing other fields', async () => {
    const Payment = models.get('PaymentTransaction')!;
    const payment = await new Payment({
      orderNo: 'ORDER',
      deviceId: 'POS',
      amount: 1000,
      description: 'Demo',
    }).save();
    await Payment.findByIdAndUpdate(payment._id, {
      status: 'FAILED',
      $push: { webhookPayloads: { type: 'create-link-error' } },
    });
    const restored = await Payment.findById(payment._id).lean();
    expect(restored?.status).toBe('FAILED');
    expect(restored?.webhookPayloads).toEqual([{ type: 'create-link-error' }]);
    expect(restored?.amount).toBe(1000);
  });

  it('rolls back an invalid mutation before replacing the file', async () => {
    const Product = models.get('Product')!;
    await new Product(productData).save();
    const original = readFileSync(store.file, 'utf8');
    await expect(
      store.mutate((db) => {
        db.collections.products.push({ _id: 'invalid' });
      }),
    ).rejects.toThrow();
    expect(readFileSync(store.file, 'utf8')).toBe(original);
    expect(await Product.find()).toHaveLength(1);
  });

  it('refuses a second writer and does not overwrite a corrupt database', async () => {
    expect(() => new JsonStore(store.file)).toThrow('already in use');
    const file = store.file;
    await store.onModuleDestroy();
    writeFileSync(file, '{broken');
    expect(() => new JsonStore(file)).toThrow();
    expect(readFileSync(file, 'utf8')).toBe('{broken');
  });
});
