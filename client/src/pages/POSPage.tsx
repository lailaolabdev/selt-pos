import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useCartStore } from '@/store/useCartStore';
import { printerText } from '@/lib/desktop';
import { api } from '@/lib/api';
import { useDeviceSession } from '@/hooks/useDeviceSession';
import { socket } from '@/lib/socket';
import { playPosClick, playPosSound, playPosSounds, stopPosSound } from '@/lib/tts';
import { ShoppingCart, Trash2, CheckCircle, CreditCard, Loader2, ScanLine, ShieldCheck, ArrowRight, RotateCcw, ShoppingBasket, Package, XCircle, Landmark, Fingerprint, Wallet, Plus, Hand } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';

const PAYMENT_STORAGE_KEY = 'pos-active-payment-v1';
const DEV_MODE = import.meta.env.VITE_ENV === 'dev';

const PAYMENT_BANKS = [
    { id: 'jdb', name: 'JDB', detail: 'Joint Development Bank', logo: 'https://payment-doc.phajay.co/images/JDB.png' },
    { id: 'bcel', name: 'BCEL One', detail: 'BCEL', logo: 'https://payment-doc.phajay.co/images/BCEL.png' },
    { id: 'ldb', name: 'LDB', detail: 'Lao Development Bank', logo: 'https://payment-doc.phajay.co/images/LDB.png' },
    { id: 'ib', name: 'IB', detail: 'Indochina Bank', logo: 'https://payment-doc.phajay.co/images/indochina.png' },
    { id: 'stb', name: 'STB', detail: 'ST Bank', logo: 'https://payment-doc.phajay.co/images/st-bank.png' },
    { id: 'm-money', name: 'M MoneyX', detail: 'Mobile Wallet', logo: 'https://payment-doc.phajay.co/images/m-money-x-logo.png' },
] as const;
type BankId = typeof PAYMENT_BANKS[number]['id'];
type PaymentStage = 'METHOD' | 'BANK' | 'BIO' | 'QR';

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
    provider?: 'phajay' | 'bio';
    intentId?: string;
    expiresInSeconds?: number;
}

export const POSPage = () => {
    const { items, totalPrice, deviceId, clearCart, scannerStatus, scannedTagIds, unknownTagIds, unavailableTagIds } = useCartStore();
    const [isProcessing, setIsProcessing] = useState(false);
    const [payment, setPayment] = useState<PhaJayPayment | null>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(PAYMENT_STORAGE_KEY) || 'null');
            const savedPayment = saved?.payment;
            const resumable = savedPayment?.status === 'WAITING' || savedPayment?.status === 'PAID';
            return saved?.deviceId === deviceId && resumable && /^[a-f0-9]{24}$/i.test(savedPayment?.paymentId) ? savedPayment : null;
        } catch { return null; }
    });
    const [showQR, setShowQR] = useState(Boolean(payment));
    const [paymentStage, setPaymentStage] = useState<PaymentStage>(payment?.provider === 'bio' ? 'BIO' : payment ? 'QR' : 'METHOD');
    const [selectedBank, setSelectedBank] = useState<BankId>('jdb');
    const activePaymentRef = useRef(payment);
    const handledPaymentsRef = useRef(new Set<string>());
    const [printMessage, setPrintMessage] = useState('');
    const [paymentError, setPaymentError] = useState('');
    const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
    const [devProducts, setDevProducts] = useState<{ _id: string; name: string; basePrice: number }[]>([]);
    const [devProductLoading, setDevProductLoading] = useState(false);
    const lastObservedTagsRef = useRef<string[]>([]);
    const readySoundPlayedRef = useRef(false);
    const itemCount = items.reduce((acc, item) => acc + item.count, 0);
    const hasItems = items.length > 0;
    const isScanning = scannerStatus === 'SCANNING';
    const rfid = useDeviceSession('CHECKOUT', data => {
        useCartStore.getState().updateCart({ ...data.result, scannedTagIds: data.tagIds || data.result?.scannedTagIds, status: data.status });
    });
    const isReadyToPay = rfid.ready && hasItems && scannerStatus === 'STABLE';
    const scannedKey = scannedTagIds.join('|');

    useEffect(() => {
        if (!DEV_MODE) return;
        void api.get('/products').then(response => setDevProducts(response.data)).catch(error => console.error('Could not load dev products', error));
    }, []);

    const simulateDevProduct = async (productId: string) => {
        if (devProductLoading || !rfid.ready) return;
        setDevProductLoading(true);
        try {
            await api.post('/tags/dev/capture-product', { deviceId, productId });
        } catch (error) {
            setPaymentError((isAxiosError(error) ? error.response?.data?.message : undefined) || 'ບໍ່ສາມາດເພີ່ມສິນຄ້າຈຳລອງໄດ້');
        } finally {
            setDevProductLoading(false);
        }
    };

    const finishPaidPayment = useCallback(async (paid: PhaJayPayment) => {
        if (activePaymentRef.current?.paymentId !== paid.paymentId || handledPaymentsRef.current.has(paid.paymentId)) return;
        handledPaymentsRef.current.add(paid.paymentId);
        playPosSounds(['/sound/sound_success.mp3', '/sound/success_payment.wav']);
        setShowPaymentSuccess(true);
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

    useEffect(() => {
        if (!showPaymentSuccess) return;
        const timer = window.setTimeout(() => setShowPaymentSuccess(false), 2500);
        return () => window.clearTimeout(timer);
    }, [showPaymentSuccess]);

    const finishFailedPayment = () => {
        localStorage.removeItem(PAYMENT_STORAGE_KEY);
        playPosSound('/sound/unsucces_payment.wav');
        activePaymentRef.current = null;
        setPayment(null);
        setShowQR(false);
        setPaymentStage('METHOD');
        setPaymentError('');
    };

    const cancelPayment = async () => {
        const current = activePaymentRef.current;
        if (!current || isProcessing) return;
        setIsProcessing(true);
        try {
            await api.post(`/payments/phajay/${current.paymentId}/cancel`, { deviceId });
            localStorage.removeItem(PAYMENT_STORAGE_KEY);
            activePaymentRef.current = null;
            setPayment(null);
            setPaymentError('');
            setPaymentStage('METHOD');
            setShowQR(false);
        } catch (error: unknown) {
            setPaymentError((isAxiosError(error) ? error.response?.data?.message : undefined) || 'ບໍ່ສາມາດຍົກເລີກຄິວຊຳລະເງິນໄດ້');
        } finally {
            setIsProcessing(false);
        }
    };

    useEffect(() => () => stopPosSound(), []);

    useEffect(() => {
        const previous = lastObservedTagsRef.current;
        const current = [...scannedTagIds].sort();
        const previousKey = previous.join('|');
        const currentKey = current.join('|');
        if (previousKey === currentKey) return;

        if (previous.length === 0 && current.length > 0) {
            playPosSound('/sound/1.wav');
        } else if (current.length > 0 || previous.length > 0) {
            playPosSound('/sound/product-change.mp3');
        }
        lastObservedTagsRef.current = current;
    }, [scannedKey, scannedTagIds]);

    useEffect(() => {
        if (isReadyToPay && !readySoundPlayedRef.current) {
            readySoundPlayedRef.current = true;
            playPosSound('/sound/2.wav');
        } else if (scannedTagIds.length === 0) {
            readySoundPlayedRef.current = false;
        }
    }, [isReadyToPay, scannedKey, scannedTagIds.length]);

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

    const createBioPayment = async () => {
        if (activePaymentRef.current?.status === 'WAITING' || isProcessing) return;
        setIsProcessing(true);
        setPaymentError('');
        try {
            const response = await api.post('/payments/phajay/bio/intent', { deviceId }, { timeout: 20000 });
            const nextPayment = response.data as PhaJayPayment;
            if (!nextPayment.paymentId || !nextPayment.intentId) throw new Error('Bio Payment did not return intentId');
            activePaymentRef.current = nextPayment;
            localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify({ deviceId, payment: nextPayment }));
            setPayment(nextPayment);
            setPaymentStage('BIO');
            setShowQR(true);
        } catch (error: unknown) {
            setPaymentError((isAxiosError(error) ? error.response?.data?.message : undefined) || 'ບໍ່ສາມາດເປີດການຈ່າຍຜ່ານ Bio Payment ໄດ້');
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
                    finishFailedPayment();
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
                    <button onClick={() => { playPosClick(); void handleClearCart(); }} aria-label="ລ້າງກະຕ່າ" className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-100 px-3 text-sm font-bold text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" /> ລ້າງ
                    </button>
                    <Link to="/admin" className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Admin</Link>
                </div>
            </header>

            <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                {DEV_MODE && <section className="shrink-0 rounded-xl border border-amber-300 bg-amber-50 p-3" aria-label="ໂໝດຈຳລອງ dev">
                    <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-black text-amber-800">DEV MODE · ບໍ່ມີ RFID Hub</p><span className="text-[11px] font-semibold text-amber-700">ກົດເພື່ອຈຳລອງການວາງສິນຄ້າ</span></div>
                    <div className="flex flex-wrap gap-2">
                        {devProducts.map(product => <button key={product._id} onClick={() => { playPosClick(); void simulateDevProduct(product._id); }} disabled={devProductLoading || !rfid.ready} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-xs font-black text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />{product.name}</button>)}
                        {devProducts.length === 0 && <span className="text-xs font-semibold text-amber-800">ຍັງບໍ່ມີສິນຄ້າໃນລະບົບ</span>}
                    </div>
                </section>}
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
                                <button id="checkout-payment-button" onClick={() => { if (canCheckout) playPosClick(); handleCheckout(); }} disabled={!canCheckout} className={cn("flex h-20 w-full items-center justify-center gap-3 rounded-xl px-3 text-xl font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600", canCheckout ? "pos-pay-ready bg-emerald-600 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700" : "cursor-not-allowed bg-slate-100 text-slate-400")}>
                                    {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : <CreditCard className="h-6 w-6" />}
                                    {isProcessing ? 'ກຳລັງເປີດຊຳລະ' : 'ກົດຊຳລະເງິນ'}
                                    {!isProcessing && <ArrowRight className="pos-pay-arrow h-5 w-5" />}
                                </button>
                            </div>
                        </div>
                        <button onClick={() => { playPosClick(); void handleClearCart(); }} className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50">
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
                <button onClick={() => { playPosClick(); setPaymentStage(payment.provider === 'bio' ? 'BIO' : 'QR'); setShowQR(true); }} className="fixed bottom-12 right-5 z-40 rounded-xl bg-[#7b2db5] px-5 py-3 font-bold text-white shadow-lg">
                    {payment.provider === 'bio' ? 'ສະແດງໜ້າສະແກນຝ່າມື' : 'ສະແດງ QR ຊຳລະເງິນ'}
                </button>
            )}
            {showQR && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
                    <div role="dialog" aria-modal="true" aria-label="PhaJay Payment" className="flex w-full max-w-[860px] max-h-[calc(100dvh-32px)] flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                            <div>
                                <h3 className="text-xl font-black text-[#7b2db5]">{paymentStage === 'METHOD' ? 'ເລືອກວິທີຊຳລະເງິນ' : paymentStage === 'BANK' ? 'ເລືອກທະນາຄານ' : paymentStage === 'BIO' ? 'ຊຳລະດ້ວຍຝ່າມື' : 'ສະແກນ QR ເພື່ອຊຳລະເງິນ'}</h3>
                                <p className="mt-1 text-sm font-semibold text-slate-500">PhaJay · {paymentStage === 'BIO' ? 'BIO Payment' : paymentStage === 'QR' ? bankName : 'Online Payment'}</p>
                            </div>
                            <button autoFocus disabled={isProcessing} onClick={() => { playPosClick(); paymentStage === 'BANK' ? setPaymentStage('METHOD') : setShowQR(false); }} className="min-h-11 rounded-lg border border-slate-200 px-4 font-bold text-slate-600 hover:bg-slate-50">ກັບຄືນ</button>
                        </header>
                        <div className="border-b border-slate-100 bg-slate-50 px-6 py-3">
                            <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-black">
                                {[
                                    ['METHOD', '1', 'ວິທີຈ່າຍ'],
                                    ['BANK', '2', 'ເລືອກທະນາຄານ'],
                                    ['QR', '3', 'ສະແກນ QR'],
                                ].map(([stage, number, label]) => <div key={stage} className={cn('rounded-lg px-2 py-2 transition-colors', ((paymentStage === 'BIO' && stage === 'QR') || paymentStage === stage) ? 'bg-purple-100 text-[#7b2db5]' : 'text-slate-400')}><span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white">{number}</span>{label}</div>)}
                            </div>
                            <p className="mt-2 text-center text-xs font-semibold text-slate-500">
                                {paymentStage === 'METHOD' ? 'ເລືອກວິທີຈ່າຍເງິນ' : paymentStage === 'BANK' ? 'ເລືອກແອັບທະນາຄານ ແລ້ວກົດ ສ້າງ QR' : paymentStage === 'BIO' ? 'ເບິ່ງເຄື່ອງສະແກນ ແລະ ສະແກນຝ່າມືເພື່ອຢືນຢັນ' : 'ເປີດແອັບທະນາຄານ ແລ້ວສະແກນ QR'}
                            </p>
                        </div>
                        {paymentStage === 'METHOD' ? (
                            <div className="space-y-5 p-6">
                                <div className="text-center"><p className="text-sm font-bold text-slate-500">ຍອດຊຳລະທັງໝົດ</p><p className="mt-2 text-3xl font-black text-[#7b2db5]">{formatCurrency(totalPrice)}</p></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => { playPosClick(); setPaymentStage('BANK'); }} className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-purple-200 bg-purple-50 p-5 text-[#7b2db5] hover:border-purple-500 focus-visible:outline-2 focus-visible:outline-purple-600">
                                        <Wallet className="h-12 w-12" /><span className="text-xl font-black">Online Payment</span><span className="text-sm font-semibold">ເລືອກທະນາຄານ ແລະ ສະແກນ QR</span>
                                    </button>
                                    <button onClick={() => { playPosClick(); void createBioPayment(); }} disabled={isProcessing || !isReadyToPay} className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5 text-emerald-700 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
                                        <Fingerprint className="h-12 w-12" /><span className="text-xl font-black">PhaJay BIO Payment</span><span className="text-sm font-semibold">ສະແກນຝ່າມືທີ່ເຄື່ອງ Bio POS</span>
                                    </button>
                                </div>
                            </div>
                        ) : paymentStage === 'BANK' ? (
                            <div className="space-y-4 p-6">
                                <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-500">ຊຳລະອອນລາຍ</p><p className="text-2xl font-black text-[#7b2db5]">{formatCurrency(totalPrice)}</p></div>
                                <div className="grid grid-cols-3 gap-3" role="group" aria-label="Payment bank">
                                    {PAYMENT_BANKS.map(bank => <button key={bank.id} aria-pressed={selectedBank === bank.id} disabled={isProcessing} onClick={() => { playPosClick(); setSelectedBank(bank.id); }} className={cn("flex min-h-28 items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-50", selectedBank === bank.id ? 'border-purple-600 bg-purple-50 text-[#7b2db5]' : 'border-slate-200 text-slate-600 hover:border-purple-300')}>
                                        <BankLogo bank={bank} size="md" /><span className="min-w-0"><span className="block text-lg font-black">{bank.name}</span><span className="block text-xs font-semibold">{bank.detail}</span></span>
                                    </button>)}
                                </div>
                                <p className="text-sm font-semibold text-slate-500">{selectedBank === 'bcel' ? 'BCEL QR ໃຊ້ໄດ້ກັບແອັບ BCEL One ເທົ່ານັ້ນ' : `ສະແກນ QR ຜ່ານແອັບ ${PAYMENT_BANKS.find(bank => bank.id === selectedBank)?.name}`}</p>
                                {paymentError && <p role="alert" className="max-h-20 overflow-y-auto rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{paymentError}</p>}
                                <button onClick={() => { if (!isProcessing && isReadyToPay) playPosClick(); void createQrPayment(); }} disabled={isProcessing || !isReadyToPay} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-emerald-600 px-5 font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}{isProcessing ? 'ກຳລັງສ້າງ QR...' : 'ສ້າງ QR'}</button>
                            </div>
                        ) : paymentStage === 'BIO' ? (
                        <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-6 p-6">
                            <div className="bio-scan-stage relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5" aria-label="ຮູບຈຳລອງການສະແກນຝ່າມື">
                                <div className="bio-terminal-pulse absolute right-7 top-1/2 flex h-32 w-24 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border-4 border-emerald-500 bg-white text-emerald-600 shadow-lg">
                                    <Fingerprint className="h-12 w-12" /><span className="mt-1 text-[10px] font-black tracking-widest">BIO POS</span>
                                </div>
                                <div className="absolute right-[78px] top-1/2 h-1 w-20 -translate-y-1/2 rounded-full bg-emerald-300/40"><div className="bio-scan-glow h-full w-full rounded-full bg-emerald-500 shadow-[0_0_12px_4px_rgb(16_185_129_/_0.45)]" /></div>
                                <Hand className="bio-hand-tap absolute left-7 top-1/2 h-28 w-28 -translate-y-1/2 text-[#7b2db5] drop-shadow-lg" strokeWidth={1.7} />
                                <p className="absolute bottom-4 left-0 right-0 text-center text-xs font-black text-emerald-700">ຍົກຝ່າມືແຕະເຄື່ອງສະແກນ</p>
                            </div>
                            <div className="flex min-w-0 flex-col justify-center gap-5">
                                <div><p className="text-sm font-bold text-slate-500">ຍອດຊຳລະທັງໝົດ</p><p className="mt-2 break-words text-3xl font-black text-[#7b2db5]">{formatCurrency(payment?.amount ?? totalPrice)}</p>{payment?.orderNo && <p className="mt-3 break-all text-xs font-semibold text-slate-400">Order: {payment.orderNo}</p>}</div>
                                <ol className="space-y-3 text-sm font-semibold leading-6 text-slate-600"><li>1. ລໍຖ້າໜ້າສະແກນເປີດຢູ່ເຄື່ອງ Bio POS</li><li>2. ໃຫ້ລູກຄ້າສະແກນຝ່າມື ແລະ ຢືນຢັນການຈ່າຍ</li><li>3. ລໍຖ້າ POS ຢືນຢັນຜົນການຊຳລະ</li></ol>
                                <div role="status" className={cn("flex items-center gap-3 rounded-xl p-4 text-sm font-bold", paymentFailed ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700')}>{paymentFailed ? <XCircle className="h-5 w-5" /> : <Loader2 className="h-5 w-5 motion-safe:animate-spin" />}{paymentFailed ? 'ການຊຳລະບໍ່ສຳເລັດ' : 'ລໍຖ້າການສະແກນຝ່າມື · ກວດອັດຕະໂນມັດ'}</div>
                                {paymentError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{paymentError}</p>}
                                {payment && <button onClick={() => { playPosClick(); void checkPaymentStatus(); }} className="min-h-12 rounded-xl border border-slate-300 px-4 font-bold text-slate-700 hover:bg-slate-50">ກວດສະຖານະ</button>}
                                {payment?.status === 'WAITING' && <button onClick={() => { if (!isProcessing) playPosClick(); void cancelPayment(); }} disabled={isProcessing} className="min-h-12 rounded-xl border border-red-200 bg-red-50 font-bold text-red-600 hover:bg-red-100 disabled:opacity-50">{isProcessing ? 'ກຳລັງຍົກເລີກ...' : 'ຍົກເລີກ'}</button>}
                            </div>
                        </div>
                        ) : (
                        <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-6 p-6">
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                {payment?.bank && <BankLogo bank={PAYMENT_BANKS.find(bank => bank.id === payment.bank) || PAYMENT_BANKS[0]} size="lg" />}
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
                                {payment && <button onClick={() => { playPosClick(); void checkPaymentStatus(); }} className="min-h-12 rounded-xl border border-slate-300 px-4 font-bold text-slate-700 hover:bg-slate-50">ກວດສະຖານະ</button>}
                                {payment?.status === 'WAITING' && <button onClick={() => { if (!isProcessing) playPosClick(); void cancelPayment(); }} disabled={isProcessing} className="min-h-12 rounded-xl border border-red-200 bg-red-50 px-4 font-bold text-red-600 hover:bg-red-100 disabled:opacity-50">{isProcessing ? 'ກຳລັງຍົກເລີກ...' : 'ຍົກເລີກ ແລະ ລ້າງຄິວຊຳລະ'}</button>}
                            </div>
                        </div>
                        )}
                        <p className="border-t border-slate-100 px-6 py-3 text-center text-xs font-semibold text-slate-500">{paymentStage === 'BIO' ? 'ລະບົບຈະປິດໜ້າຫຼັງຢືນຢັນການສະແກນສຳເລັດ' : paymentStage === 'QR' ? 'ລະບົບຈະປິດໜ້າ QR ຫຼັງຢືນຢັນການຊຳລະສຳເລັດ' : 'ຊຳລະເງິນຜ່ານ PhaJay'}</p>
                    </div>
                </div>
            )}
            {showPaymentSuccess && <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-emerald-950/25 p-6" role="status" aria-live="polite">
                <div className="payment-success-pop flex w-full max-w-md flex-col items-center rounded-3xl border border-emerald-200 bg-white px-8 py-10 text-center shadow-2xl">
                    <div className="payment-success-ring flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white"><CheckCircle className="h-14 w-14" strokeWidth={2.5} /></div>
                    <h2 className="mt-5 text-3xl font-black text-emerald-700">ຊຳລະເງິນສຳເລັດ</h2>
                    <p className="mt-2 text-base font-bold text-slate-500">ຂອບໃຈທີ່ໃຊ້ບໍລິການ 4B-easy-POS</p>
                    <p className="mt-4 text-sm font-semibold text-slate-400">ກຳລັງກຽມລະບົບສຳລັບລາຍການຕໍ່ໄປ...</p>
                </div>
            </div>}
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

function BankLogo({ bank, size }: { bank: typeof PAYMENT_BANKS[number]; size: 'md' | 'lg' }) {
    const [failed, setFailed] = useState(false);
    const dimensions = size === 'lg' ? 'h-16 w-28' : 'h-12 w-16';

    return (
        <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1', dimensions)}>
            {failed ? <Landmark className={cn(size === 'lg' ? 'h-9 w-9' : 'h-6 w-6', 'text-slate-300')} /> : (
                <img src={bank.logo} alt={`${bank.name} logo`} className="max-h-full max-w-full object-contain" onError={() => setFailed(true)} />
            )}
        </span>
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
