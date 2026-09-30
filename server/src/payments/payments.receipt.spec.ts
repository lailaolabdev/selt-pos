import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentTransaction } from './schemas/payment-transaction.schema';
import { SessionsService } from '../sessions/sessions.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { TagsService } from '../tags/tags.service';

describe('Paid receipt snapshot', () => {
  const lean = jest.fn();
  let service: PaymentsService;
  beforeEach(async () => {
    const module = await Test.createTestingModule({ providers: [PaymentsService,
      { provide: getModelToken(PaymentTransaction.name), useValue: { findById: () => ({ lean }) } },
      { provide: SessionsService, useValue: {} }, { provide: SessionsGateway, useValue: {} }, { provide: TagsService, useValue: {} },
    ] }).compile();
    service = module.get(PaymentsService);
  });
  it('returns stored sale items after the cart has been cleared', async () => {
    lean.mockResolvedValue({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', status: 'PAID', amount: 12000, orderNo: 'ORDER', items: [{ name: 'Water', count: 2, subtotal: 12000 }], deviceId: 'RPi-POS-01' });
    const receipt = await service.getReceipt('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(receipt.items).toEqual([{ name: 'Water', count: 2, subtotal: 12000 }]);
    expect(receipt.currency).toBe('LAK');
  });
  it('rejects unpaid or missing transactions', async () => {
    for (const payment of [null, { status: 'WAITING' }, { status: 'FAILED' }]) {
      lean.mockResolvedValue(payment);
      await expect(service.getReceipt('aaaaaaaaaaaaaaaaaaaaaaaa')).rejects.toThrow('paid transactions');
    }
  });
  it('rejects invalid IDs before querying MongoDB', async () => {
    await expect(service.getReceipt('invalid')).rejects.toThrow('Invalid payment id');
  });
});
