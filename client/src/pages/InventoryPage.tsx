import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDeviceSession } from '@/hooks/useDeviceSession';
import { ClipboardList, Radio, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface InventoryItem {
    productId: string;
    name: string;
    sku: string;
    availableCount: number;
}

export const InventoryPage = () => {
    const { deviceId } = useDeviceSession('CHECK');

    const { data: inventory, isLoading } = useQuery<InventoryItem[]>({
        queryKey: ['inventory'],
        queryFn: async () => {
            const resp = await api.get('/inventory/summary');
            return resp.data;
        },
        refetchInterval: 5000, // Poll every 5s
    });

    return (
        <div className="space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">ສາງສິນຄ້າ</h2>
                    <p className="text-muted-foreground">ກວດເບິ່ງຈຳນວນສິນຄ້າແບບ realtime ຜ່ານ RFID</p>
                </div>
                <div className="flex items-center gap-3 bg-green-500/10 text-green-600 px-4 py-2 rounded-full font-bold animate-pulse text-sm">
                    <Radio className="w-4 h-4" />
                    ກຳລັງອ່ານ RFID
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-48 bg-muted rounded-2xl animate-pulse" />
                    ))
                ) : inventory && inventory.length > 0 ? (
                    inventory.map((item) => (
                        <div key={item.productId} className="bg-card border border-border p-6 rounded-2xl shadow-sm space-y-4 hover:border-primary/50 transition-colors group">
                            <div className="flex justify-between items-start">
                                <div className="bg-primary/10 p-3 rounded-xl group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                    <ClipboardList className="w-6 h-6" />
                                </div>
                                <span className="text-3xl font-black text-primary">{item.availableCount}</span>
                            </div>
                            <div>
                                <h4 className="font-bold text-lg leading-tight">{item.name}</h4>
                                <p className="text-sm text-muted-foreground font-mono mt-1">{item.sku}</p>
                            </div>
                            <div className="pt-2 flex items-center gap-2 text-xs font-bold text-green-500 uppercase tracking-tighter">
                                <CheckCircle className="w-3 h-3" />
                                ມີສິນຄ້າໃນສາງ
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full py-20 text-center space-y-4">
                        <AlertCircle className="w-16 h-16 opacity-20 mx-auto" />
                        <p className="text-xl font-medium text-muted-foreground">ສາງ RFID ຍັງວ່າງ</p>
                        <p className="text-muted-foreground max-w-md mx-auto">
                            ໄປທີ່ “ຈັດການສິນຄ້າ” ແລະ ໃຊ້ເຄື່ອງອ່ານໃນໂໝດ ADD ເພື່ອເພີ່ມສິນຄ້າ
                        </p>
                    </div>
                )}
            </div>

            <section className="mt-12 space-y-6">
                <h3 className="text-xl font-bold">ສະຖານະລະບົບ</h3>
                <div className="bg-card border border-border rounded-2xl p-6 flex flex-wrap gap-8 items-center divide-x-0 divide-border lg:divide-x">
                    <div className="flex items-center gap-3 flex-1">
                        <Clock className="w-6 h-6 text-muted-foreground" />
                        <div>
                            <span className="text-xs font-bold uppercase text-muted-foreground block">ຊິງຄ໌ຫຼ້າສຸດ</span>
                            <span className="font-medium">ຫາກໍ່ຊິງຄ໌</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-1 lg:pl-8">
                        <Radio className="w-6 h-6 text-primary" />
                        <div>
                            <span className="text-xs font-bold uppercase text-muted-foreground block">ສະຖານະ Hub</span>
                            <span className="font-medium text-green-500">ເຊື່ອມຕໍ່ແລ້ວ ({deviceId})</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-1 lg:pl-8">
                        <AlertCircle className="w-6 h-6 text-orange-500" />
                        <div>
                            <span className="text-xs font-bold uppercase text-muted-foreground block">Tag ທີ່ຫາຍ</span>
                            <span className="font-medium text-orange-500">0 ລາຍການ</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};
