import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useCartStore } from '@/store/useCartStore';
import { printerText } from '@/lib/desktop';
import { api } from '@/lib/api';
import { useDeviceSession } from '@/hooks/useDeviceSession';
import { socket } from '@/lib/socket';
import { playPosSound, playPosSounds, stopPosSound } from '@/lib/tts';
import { ShoppingCart, Trash2, CheckCircle, CreditCard, Loader2, ScanLine, ShieldCheck, ArrowRight, RotateCcw, ShoppingBasket, Package, XCircle, Landmark, Fingerprint, Wallet } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';

const PAYMENT_STORAGE_KEY = 'pos-active-payment-v1';

const PAYMENT_BANKS = [
    { id: 'bcel', name: 'BCEL One', detail: 'BCEL' },
    { id: 'jdb', name: 'JDB', detail: 'Joint Development Bank' },
    { id: 'ldb', name: 'LDB', detail: 'Lao Development Bank' },
    { id: 'ib', name: 'IB', detail: 'Indochina Bank' },
    { id: 'stb', name: 'STB', detail: 'ST Bank' },
    { id: 'm-money', name: 'M MoneyX', detail: 'Mobile Wallet' },
] as const;
type BankId = typeof PAYMENT_BANKS[number]['id'];
type PaymentStage = 'METHOD' | 'BANK' | 'QR';

type PaymentStatus = 'WAITING' | 'PAID' | 'FAILED' | 'CANCELLED';

interface PhaJayPayment {
    paymentId: string;
    orderNo: string;
    amount: number;
    status: PaymentStatus;
    bank?: string;
    qrCode?: string;
    link?: string;
    redirectURL?: string;
}

export const POSPage = () => {
    const { items, totalPrice, tagIds, deviceId, clearCart, scannerStatus, basketId, basketKey, scannedTagIds, unknownTagIds, unavailableTagIds } = useCartStore();
    const [isProcessing, setIsProcessing] = useState(false);
    const [payment, setPayment] = useState<PhaJayPayment | null>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(PAYMENT_STORAGE_KEY) || 'null');
            return saved?.deviceId === deviceId && /^[a-f0-9]{24}$/i.test(saved.payment?.paymentId) ? saved.payment : null;
        } catch { return null; }
    });
    const [showQR, setShowQR] = useState(Boolean(payment));
    const [paymentStage, setPaymentStage] = useState<PaymentStage>(payment ? 'QR' : 'METHOD');
    const [selectedBank, setSelectedBank] = useState<BankId>('bcel');
    const activePaymentRef = useRef(payment);
    const handledPaymentsRef = useRef(new Set<string>());
    const [printMessage, setPrintMessage] = useState('');
    const [paymentError, setPaymentError] = useState('');
    const lastSpokenScanKeyRef = useRef('');
    const lastWelcomedBasketRef = useRef('');
    const itemCount = items.reduce((acc, item) => acc + item.count, 0);
    const hasItems = items.length > 0;
    const isScanning = scannerStatus === 'SCANNING';
    const rfid = useDeviceSession('CHECKOUT', data => {
        useCartStore.getState().updateCart({ ...data.result, scannedTagIds: data.tagIds || data.result?.scannedTagIds, status: data.status });
    });
    const isReadyToPay = rfid.ready && hasItems && scannerStatus === 'STABLE';
    const scanKey = tagIds.join('|');

    const finishPaidPayment = useCallback(async (paid: PhaJayPayment) => {
        if (activePaymentRef.current?.paymentId !== paid.paymentId || handledPaymentsRef.current.has(paid.paymentId)) return;
        handledPaymentsRef.current.add(paid.paymentId);
        playPosSounds(['/sound/sound_success.mp3', '/sound/success_payment.wav']);
        clearCart();
        setShowQR(false);
        setPaymentError('');
        setPrintMessage(printerText.paid);
        try {
            if (window.posDesktop) {
                const job = await window.posDesktop.printReceipt(paid.paymentId);
                setPrintMessage(`${printerText.paid} — ${printerText.status[job.status]}`);
            }
            localStorage.removeItem(PAYMENT_STORAGE_KEY);
            activePaymentRef.current = null;
            setPayment(null);
        } catch {
            // Keep the active payment on disk so startup can safely enqueue it again.
            handledPaymentsRef.current.delete(paid.paymentId);
            setPrintMessage(`${printerText.paid} — ${printerText.error}`);
        }
    }, [clearCart]);

    const finishFailedPayment = () => {
        localStorage.removeItem(PAYMENT_STORAGE_KEY);
        playPosSound('/sound/unsucces_payment.wav');
        setPaymentError('ການຊຳລະເງິນບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່');
    };

    useEffect(() => () => stopPosSound(), []);

    useEffect(() => {
        const welcomeKey = basketKey || scanKey || basketId;
        if (hasItems && welcomeKey && welcomeKey !== lastWelcomedBasketRef.current) {
            lastWelcomedBasketRef.current = welcomeKey;
            playPosSound('/sound/1.wav');
        }

        if (!basketId && !basketKey && !scanKey) {
            lastSpokenScanKeyRef.current = '';
            lastWelcomedBasketRef.current = '';
        }
    }, [basketId, basketKey, hasItems, scanKey]);

    useEffect(() => {
        if (!isReadyToPay || !scanKey || scanKey === lastSpokenScanKeyRef.current) {
            return;
        }

        lastSpokenScanKeyRef.current = scanKey;

        playPosSound('/sound/2.wav');

    }, [isReadyToPay, scanKey, totalPrice]);

    useEffect(() => {
        const handlePaymentUpdate = (nextPayment: PhaJayPayment & { deviceId?: string }) => {
            if (nextPayment.deviceId && nextPayment.deviceId !== deviceId) {
                return;
            }

            if (activePaymentRef.current?.paymentId !== nextPayment.paymentId) return;
            activePaymentRef.current = { ...activePaymentRef.current, ...nextPayment };
            setPayment((current) => {
                if (!current || current.paymentId !== nextPayment.paymentId) {
                    return current;
                }
                return { ...current, ...nextPayment };
            });

            if (nextPayment.status === 'PAID') {
                void finishPaidPayment(nextPayment);
            }

            if (nextPayment.status === 'FAILED' || nextPayment.status === 'CANCELLED') {
                finishFailedPayment();
            }
        };

        socket.on('paymentUpdate', handlePaymentUpdate);
        return () => {
            socket.off('paymentUpdate', handlePaymentUpdate);
        };
    }, [deviceId, finishPaidPayment]);

    const handleCheckout = () => {
        if (activePaymentRef.current?.status === 'WAITING' || isProcessing) return;
        setPayment(null);
        activePaymentRef.current = null;
        setPaymentError('');
        setPaymentStage('METHOD');
        setShowQR(true);
    };

    const createQrPayment = async () => {
        if (activePaymentRef.current?.status === 'WAITING' || isProcessing) return;
        setIsProcessing(true);
        setPaymentError('');

        try {
            const response = await api.post('/payments/phajay/qr', { deviceId, bank: selectedBank }, { timeout: 20000 });
            const nextPayment = response.data as PhaJayPayment;
            if (!nextPayment.qrCode) throw new Error('PhaJay did not return a QR code');
            activePaymentRef.current = nextPayment;
            localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify({ deviceId, payment: nextPayment }));
            setPayment(nextPayment);
            setPrintMessage('');
            setPaymentStage('QR');
            setShowQR(true);
        } catch (error: unknown) {
            console.error(error);
            setShowQR(true);
            setPaymentError((isAxiosError(error) ? error.response?.data?.message : undefined) || 'ບໍ່ສາມາດສ້າງ QR ຊຳລະເງິນໄດ້');
        } finally {
            setIsProcessing(false);
        }
    };

    const checkPaymentStatus = useCallback(async () => {
        const current = activePaymentRef.current;
        if (!current) return;
        try {
            const response = await api.get(`/payments/phajay/${current.paymentId}/status`);
            const nextPayment = response.data as PhaJayPayment;
            if (activePaymentRef.current?.paymentId !== nextPayment.paymentId) return;
            if (nextPayment.status === 'PAID') {
                await finishPaidPayment(nextPayment);
            } else {
                activePaymentRef.current = { ...current, ...nextPayment };
                setPayment(activePaymentRef.current);
                if (nextPayment.status === 'FAILED' || nextPayment.status === 'CANCELLED') {
                    localStorage.removeItem(PAYMENT_STORAGE_KEY);
                    playPosSound('/sound/unsucces_payment.wav');
                    setPaymentError('ການຊຳລະເງິນບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່');
                }
            }
        } catch (error) { console.error('Payment status unavailable', error); }
    }, [finishPaidPayment]);

    const pollingPaymentId = payment?.paymentId;
    const pollingPaymentStatus = payment?.status;
    useEffect(() => {
        if (!pollingPaymentId || pollingPaymentStatus === 'FAILED' || pollingPaymentStatus === 'CANCELLED') return;
        let running = false;
        const check = async () => {
            if (running) return;
            running = true;
            try { await checkPaymentStatus(); } finally { running = false; }
        };
        void check();
        const interval = window.setInterval(() => void check(), 3000);
        const onFocus = () => void check();
        window.addEventListener('focus', onFocus);
        return () => { window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
    }, [pollingPaymentId, pollingPaymentStatus, checkPaymentStatus]);

    const handleClearCart = async () => {
        try {
            await api.post('/session/clear', { deviceId });
            clearCart();
        } catch (err) {
            console.error(err);
        }
    };

    const currentStep = isReadyToPay ? 2 : hasItems ? 1 : 0;
    const steps = [
        { title: 'ວາງກະຕ່າ', detail: 'ວາງສິນຄ້າໃສ່ຈຸດ RFID' },
        { title: 'ກວດລາຍການ', detail: 'ເບິ່ງຊື່ ແລະ ຈຳນວນສິນຄ້າ' },
        { title: 'ກົດຊຳລະເງິນ', detail: 'ກົດປຸ່ມໃຫຍ່ເພື່ອຈ່າຍ' },
    ];

    const canCheckout = isReadyToPay && !isProcessing && !showQR && payment?.status !== 'WAITING';
    const paymentFailed = payment?.status === 'FAILED' || payment?.status === 'CANCELLED';
    const bankName = PAYMENT_BANKS.find(bank => bank.id === payment?.bank)?.name || 'PhaJay';

    return (
        <div className="pos-screen mx-auto flex h-dvh w-full max-w-[1024px] flex-col overflow-hidden bg-[#f5f4fa] text-slate-950">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <img src="/logo.jpeg" alt="4B For Business" className="h-12 w-12 shrink-0 rounded-xl object-contain ring-1 ring-slate-100" />
                    <div className="min-w-0">
                        <p className="text-xs font-extrabold tracking-wide text-[#7b2db5]">4B-easy-POS · SELF CHECKOUT</p>
                        <h1 className="truncate text-xl font-black">ລະບົບຊຳລະເງິນອັດຕະໂນມັດ</h1>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <button onClick={handleClearCart} aria-label="ລ້າງກະຕ່າ" className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-100 px-3 text-sm font-bold text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" /> ລ້າງ
                    </button>
                    <Link to="/admin" className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Admin</Link>
                </div>
            </header>

            <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                <div className="grid shrink-0 grid-cols-3 gap-3" aria-label="ຂັ້ນຕອນຊຳລະ">
                    {steps.map((step, index) => (
                        <div key={step.title} className={cn("flex items-center gap-3 rounded-xl border px-3 py-3", index === currentStep ? "border-purple-300 bg-purple-50" : index < currentStep ? "border-green-200 bg-green-50" : "border-slate-200 bg-white")}>
                            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black", index < currentStep ? "bg-green-600 text-white" : index === currentStep ? "bg-[#7b2db5] text-white" : "bg-slate-100 text-slate-500")}>
                                {index < currentStep ? <CheckCircle className="h-4 w-4" /> : index + 1}
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-sm font-extrabold">{step.title}</h2>
                                <p className="mt-0.5 truncate text-xs text-slate-500">{step.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {(unknownTagIds.length > 0 || unavailableTagIds.length > 0) && <div role="alert" className="max-h-20 shrink-0 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    {unknownTagIds.length > 0 && <p className="break-all">Tag ຍັງບໍ່ໄດ້ຜູກກັບສິນຄ້າ: {unknownTagIds.join(', ')}</p>}
                    {unavailableTagIds.length > 0 && <p className="break-all">Tag ຂາຍແລ້ວ ຫຼື ບໍ່ພ້ອມຂາຍ: {unavailableTagIds.join(', ')}</p>}
                </div>}
                {printMessage && <p role="status" className="max-h-16 shrink-0 overflow-y-auto rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-bold text-green-800">{printMessage}</p>}

                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-4">
                    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="ລາຍການສິນຄ້າ">
                        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-400">ລາຍການສິນຄ້າ · {items.length} ລາຍການ</p>
                                <h2 className="mt-1 text-xl font-black">ກວດກ່ອນຊຳລະເງິນ</h2>
                            </div>
                            <span className={cn("inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold", isScanning ? "bg-blue-50 text-blue-700" : isReadyToPay ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500")}>
                                {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : isReadyToPay ? <ShieldCheck className="h-4 w-4" /> : <ScanLine className="h-4 w-4" />}
                                {isScanning ? 'ກຳລັງອ່ານ RFID' : isReadyToPay ? 'ພ້ອມຊຳລະເງິນ' : 'ລໍຖ້າສິນຄ້າ'}
                            </span>
                        </div>
                        {hasItems && <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_64px_116px] gap-3 bg-slate-50 px-4 py-2 text-[11px] font-bold text-slate-400">
                            <span>ສິນຄ້າ</span><span className="text-center">ຈຳນວນ</span><span className="text-right">ລວມ</span>
                        </div>}
                        <div data-testid="pos-items-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                            {hasItems ? <div className="divide-y divide-slate-100">
                                {items.map((item, idx) => <div key={`${item.name}-${idx}`} className="grid grid-cols-[minmax(0,1fr)_64px_116px] items-center gap-3 px-4 py-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <POSItemImage imageUrl={item.imageUrl} name={item.name} />
                                        <div className="min-w-0">
                                            <h3 className="line-clamp-2 break-words text-sm font-extrabold leading-5">{item.name}</h3>
                                            <p className="mt-1 text-[11px] font-medium text-slate-400">RFID ອ່ານແລ້ວ</p>
                                        </div>
                                    </div>
                                    <span className="justify-self-center rounded-lg bg-purple-50 px-3 py-1.5 text-base font-black text-[#7b2db5]">{item.count}</span>
                                    <p className="break-words text-right text-sm font-extrabold">{formatCurrency(item.subtotal)}</p>
                                </div>)}
                            </div> : <PlacementGraphic isScanning={isScanning} />}
                        </div>
                    </section>

                    <aside className="flex min-h-0 flex-col gap-3">
                        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 pb-4">
                                <div><p className="text-xs font-semibold text-slate-400">ສະຫຼຸບການຊື້</p><h2 className="mt-1 text-xl font-black">ກະຕ່າຂອງທ່ານ</h2></div>
                                <ShoppingCart className="h-6 w-6 text-[#7b2db5]" />
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto py-4">
                                <dl className="space-y-3 text-sm font-semibold text-slate-500">
                                    <div className="flex justify-between"><dt>ຈຳນວນລາຍການ</dt><dd className="font-extrabold text-slate-900">{items.length}</dd></div>
                                    <div className="flex justify-between"><dt>ຈຳນວນຊິ້ນ</dt><dd className="font-extrabold text-slate-900">{itemCount}</dd></div>
                                    <div className="flex justify-between"><dt>ພາສີ</dt><dd>ລວມແລ້ວ</dd></div>
                                </dl>
                                <div className="mt-5 border-t border-dashed border-slate-200 pt-5">
                                    <p className="text-sm font-bold text-slate-500">ຍອດທີ່ຕ້ອງຈ່າຍ</p>
                                    <p className="mt-2 break-words text-[clamp(1.6rem,3.4vw,2.25rem)] font-black leading-tight text-emerald-600">{formatCurrency(totalPrice)}</p>
                                    <p className="mt-2 text-xs text-slate-400">ຊຳລະຜ່ານ PhaJay</p>
                                </div>
                            </div>
                            <div className="shrink-0 pt-3">
                                <p className="mb-3 min-h-5 text-center text-xs font-bold text-slate-500" aria-live="polite">
                                    {payment?.status === 'WAITING' ? 'ລໍຖ້າການຊຳລະ' : canCheckout ? 'ລາຍການຄົບແລ້ວ ກົດປຸ່ມເພື່ອຈ່າຍ' : hasItems ? 'ກະລຸນາລໍຖ້າກວດ RFID ໃຫ້ຄົບ' : 'ວາງສິນຄ້າເພື່ອເລີ່ມຕົ້ນ'}
                                </p>
                                <button id="checkout-payment-button" onClick={handleCheckout} disabled={!canCheckout} className={cn("flex h-20 w-full items-center justify-center gap-3 rounded-xl px-3 text-xl font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600", canCheckout ? "pos-pay-ready bg-emerald-600 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700" : "cursor-not-allowed bg-slate-100 text-slate-400")}>
                                    {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : <CreditCard className="h-6 w-6" />}
                                    {isProcessing ? 'ກຳລັງເປີດຊຳລະ' : 'ກົດຊຳລະເງິນ'}
                                    {!isProcessing && <ArrowRight className="pos-pay-arrow h-5 w-5" />}
                                </button>
                            </div>
                        </div>
                        <button onClick={handleClearCart} className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50">
                            <RotateCcw className="h-4 w-4" /> ເລີ່ມໃໝ່
                        </button>
                    </aside>
                </div>
            </main>
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold text-slate-400">
                <p role="status" className="min-w-0 truncate" title={rfid.error || undefined}>
                    <span className={cn("mr-2 inline-block h-1.5 w-1.5 rounded-full", rfid.ready ? "bg-green-500" : "bg-amber-500")} />
                    {rfid.error || (!rfid.ready ? 'ກຳລັງຕຽມ RFID session...' : rfid.connected ? 'Server ເຊື່ອມຕໍ່ແລ້ວ' : 'Realtime ຂາດການເຊື່ອມຕໍ່ ກຳລັງດຶງຂໍ້ມູນຈາກ server')}
                </p>
                <span className="shrink-0">{deviceId} · RFID: {scannedTagIds.length} Tag</span>
            </footer>

            {payment?.status === 'WAITING' && !showQR && (
                <button onClick={() => { setPaymentStage('QR'); setShowQR(true); }} className="fixed bottom-12 right-5 z-40 rounded-xl bg-[#7b2db5] px-5 py-3 font-bold text-white shadow-lg">
                    ສະແດງ QR ຊຳລະເງິນ
                </button>
            )}
            {showQR && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
                    <div role="dialog" aria-modal="true" aria-label="PhaJay Payment" className="flex w-full max-w-[860px] max-h-[calc(100dvh-32px)] flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                            <div>
                                <h3 className="text-xl font-black text-[#7b2db5]">{paymentStage === 'METHOD' ? 'ເລືອກວິທີຊຳລະເງິນ' : paymentStage === 'BANK' ? 'ເລືອກທະນາຄານ' : 'ສະແກນ QR ເພື່ອຊຳລະເງິນ'}</h3>
                                <p className="mt-1 text-sm font-semibold text-slate-500">PhaJay · {paymentStage === 'QR' ? bankName : 'Online Payment'}</p>
                            </div>
                            <button autoFocus disabled={isProcessing} onClick={() => paymentStage === 'BANK' ? setPaymentStage('METHOD') : setShowQR(false)} className="min-h-11 rounded-lg border border-slate-200 px-4 font-bold text-slate-600 hover:bg-slate-50">ກັບຄືນ</button>
                        </header>
                        {paymentStage === 'METHOD' ? (
                            <div className="space-y-5 p-6">
                                <div className="text-center"><p className="text-sm font-bold text-slate-500">ຍອດຊຳລະທັງໝົດ</p><p className="mt-2 text-3xl font-black text-[#7b2db5]">{formatCurrency(totalPrice)}</p></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => setPaymentStage('BANK')} className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-purple-200 bg-purple-50 p-5 text-[#7b2db5] hover:border-purple-500 focus-visible:outline-2 focus-visible:outline-purple-600">
                                        <Wallet className="h-12 w-12" /><span className="text-xl font-black">Online Payment</span><span className="text-sm font-semibold">ເລືອກທະນາຄານ ແລະ ສະແກນ QR</span>
                                    </button>
                                    <button disabled className="flex min-h-48 cursor-not-allowed flex-col items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50 p-5 text-slate-400">
                                        <Fingerprint className="h-12 w-12" /><span className="text-xl font-black">PhaJay BIO Payment</span><span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold">Coming soon · ເປີດໃຊ້ພາຍຫຼັງ</span>
                                    </button>
                                </div>
                            </div>
                        ) : paymentStage === 'BANK' ? (
                            <div className="space-y-4 p-6">
                                <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-500">Online Payment</p><p className="text-2xl font-black text-[#7b2db5]">{formatCurrency(totalPrice)}</p></div>
                                <div className="grid grid-cols-3 gap-3" role="group" aria-label="Payment bank">
                                    {PAYMENT_BANKS.map(bank => <button key={bank.id} aria-pressed={selectedBank === bank.id} disabled={isProcessing} onClick={() => setSelectedBank(bank.id)} className={cn("flex min-h-28 items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-50", selectedBank === bank.id ? 'border-purple-600 bg-purple-50 text-[#7b2db5]' : 'border-slate-200 text-slate-600 hover:border-purple-300')}>
                                        <Landmark className="h-7 w-7 shrink-0" /><span className="min-w-0"><span className="block text-lg font-black">{bank.name}</span><span className="block text-xs font-semibold">{bank.detail}</span></span>
                                    </button>)}
                                </div>
                                <p className="text-sm font-semibold text-slate-500">{selectedBank === 'bcel' ? 'BCEL QR ໃຊ້ໄດ້ກັບແອັບ BCEL One ເທົ່ານັ້ນ' : `ສະແກນ QR ຜ່ານແອັບ ${PAYMENT_BANKS.find(bank => bank.id === selectedBank)?.name}`}</p>
                                {paymentError && <p role="alert" className="max-h-20 overflow-y-auto rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{paymentError}</p>}
                                <button onClick={() => void createQrPayment()} disabled={isProcessing || !isReadyToPay} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-emerald-600 px-5 font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}{isProcessing ? 'ກຳລັງສ້າງ QR...' : 'Generate QR'}</button>
                            </div>
                        ) : (
                        <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-6 p-6">
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                {payment?.qrCode && payment.status === 'WAITING' ? (
                                    <div data-testid="payment-qr" className="rounded-xl border border-slate-200 bg-white p-3">
                                        <QRCodeSVG value={payment.qrCode} size={256} level="M" marginSize={4} title="PhaJay payment QR" />
                                    </div>
                                ) : paymentFailed ? <XCircle className="h-20 w-20 text-red-500" /> : <CreditCard className="h-20 w-20 text-purple-300" />}
                                <p className="mt-4 text-center text-sm font-bold text-slate-600">{payment?.bank === 'bcel' ? 'ສະແກນດ້ວຍແອັບ BCEL One' : `ສະແກນດ້ວຍແອັບ ${bankName}`}</p>
                            </div>
                            <div className="flex min-w-0 flex-col justify-center gap-5">
                                <div>
                                    <p className="text-sm font-bold text-slate-500">ຍອດຊຳລະທັງໝົດ</p>
                                    <p className="mt-2 break-words text-3xl font-black text-[#7b2db5]">{formatCurrency(payment?.amount ?? totalPrice)}</p>
                                    {payment?.orderNo && <p className="mt-3 break-all text-xs font-semibold text-slate-400">Order: {payment.orderNo}</p>}
                                </div>
                                <ol className="space-y-3 text-sm font-semibold leading-6 text-slate-600">
                                    <li>1. ເປີດແອັບທະນາຄານ ແລະ ເລືອກສະແກນ QR</li>
                                    <li>2. ກວດຍອດເງິນ ແລະ ຢືນຢັນໃນແອັບ</li>
                                    <li>3. ລໍຖ້າລະບົບຢືນຢັນການຊຳລະ</li>
                                </ol>
                                <div role="status" className={cn("flex items-center gap-3 rounded-xl p-4 text-sm font-bold", paymentFailed ? 'bg-red-50 text-red-600' : 'bg-purple-50 text-[#7b2db5]')}>
                                    {paymentFailed ? <XCircle className="h-5 w-5 shrink-0" /> : <Loader2 className="h-5 w-5 shrink-0 motion-safe:animate-spin" />}
                                    {paymentFailed ? 'ການຊຳລະບໍ່ສຳເລັດ' : payment?.status === 'WAITING' ? 'ລໍຖ້າການຊຳລະ · ກວດອັດຕະໂນມັດ' : 'ຍັງບໍ່ມີ QR ຊຳລະເງິນ'}
                                </div>
                                {paymentError && <p role="alert" className="max-h-24 overflow-y-auto rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{paymentError}</p>}
                                {payment && <button onClick={() => void checkPaymentStatus()} className="min-h-12 rounded-xl border border-slate-300 px-4 font-bold text-slate-700 hover:bg-slate-50">ກວດສະຖານະ</button>}
                            </div>
                        </div>
                        )}
                        <p className="border-t border-slate-100 px-6 py-3 text-center text-xs font-semibold text-slate-500">{paymentStage === 'QR' ? 'ລະບົບຈະປິດໜ້າ QR ຫຼັງຢືນຢັນການຊຳລະສຳເລັດ' : 'ຊຳລະເງິນຜ່ານ PhaJay'}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

function PlacementGraphic({ isScanning }: { isScanning: boolean }) {
    return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-6 py-5 text-center">
            <div id="rfid-placement-zone" className={cn("relative flex h-40 w-40 shrink-0 items-center justify-center rounded-full border border-dashed border-purple-300 bg-purple-50/50", isScanning && "motion-safe:animate-pulse")}>
                <div className="flex h-28 w-28 items-center justify-center rounded-3xl border-2 border-[#7b2db5] bg-white shadow-lg shadow-purple-100">
                    <ShoppingBasket className="h-16 w-16 text-[#7b2db5]" strokeWidth={1.7} />
                </div>
                <span className="absolute -right-1 top-6 rounded-full bg-[#7b2db5] p-2 text-white"><ScanLine className="h-4 w-4" /></span>
            </div>
            <div><h2 className="text-xl font-black">{isScanning ? 'ກຳລັງອ່ານກະຕ່າ...' : 'ວາງສິນຄ້າໃສ່ຈຸດ RFID'}</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{isScanning ? 'ກະລຸນາຢ່າຍົກກະຕ່າອອກ ລະບົບກຳລັງກວດ RFID' : 'ລາຍການສິນຄ້າຈະຂຶ້ນອັດຕະໂນມັດ ຫຼັງກວດແທັກຄົບ'}</p>
            </div>
        </div>
    );
}

function POSItemImage({ imageUrl, name }: { imageUrl?: string; name: string }) {
    const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
    const showImage = Boolean(imageUrl && failedImageUrl !== imageUrl);

    return (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            {showImage ? (
                <img
                    src={imageUrl}
                    alt={`ຮູບສິນຄ້າ ${name}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() => setFailedImageUrl(imageUrl || null)}
                />
            ) : (
                <Package className="h-6 w-6 text-slate-300" />
            )}
        </div>
    );
}
