import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDeviceSession } from '@/hooks/useDeviceSession';
import { isAxiosError } from 'axios';
import { Plus, Package, Search, Loader2, Tag, Pencil, Trash2, X, Wifi, WifiOff } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';

interface Product {
    _id: string;
    name: string;
    sku: string;
    basePrice: number;
    category: string;
    imageUrl?: string;
}

interface ProductForm extends Omit<Product, '_id'> {
    rfidTags: string;
    expectedTagCount: number;
}

const emptyProductForm: ProductForm = {
    name: '',
    sku: '',
    basePrice: 0,
    category: '',
    imageUrl: '',
    rfidTags: '',
    expectedTagCount: 0,
};

const parseTagIds = (value: string | string[] | undefined): string[] => {
    if (!value) return [];
    const values = Array.isArray(value) ? value : value.split(/[,\n\r\s]+/);
    return values.map((id) => String(id).trim()).filter(Boolean);
};

const uniqueTagIds = (tags: string[]) => Array.from(new Set(tags));

const serializeTagIds = (tags: string[]) => tags.join('\n');

export const ProductsPage = () => {
    const queryClient = useQueryClient();
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<ProductForm>(emptyProductForm);
    const [duplicateTagIds, setDuplicateTagIds] = useState<string[]>([]);
    const editRequest = useRef(0);
    const lastSeenTags = useRef(new Set<string>());
    const scannedTagIds = parseTagIds(formData.rfidTags);
    const tagTarget = formData.expectedTagCount;
    const remainingTagCount = tagTarget > 0 ? Math.max(tagTarget - scannedTagIds.length, 0) : 0;
    const hasTooManyTags = tagTarget > 0 && scannedTagIds.length > tagTarget;
    const tagKey = scannedTagIds.join('|');

    useEffect(() => {
        let cancelled = false;
        if (!showAddModal || scannedTagIds.length === 0) {
            setDuplicateTagIds([]);
            return () => { cancelled = true; };
        }
        const timer = window.setTimeout(async () => {
            try {
                const response = await api.post('/tags/check-duplicates', { tagIds: scannedTagIds });
                if (cancelled) return;
                const currentProductId = editingProduct?._id;
                const duplicates = (response.data.duplicates || [])
                    .filter((tag: { productId?: string }) => !currentProductId || String(tag.productId) !== currentProductId)
                    .map((tag: { tagId: string }) => tag.tagId);
                setDuplicateTagIds(duplicates);
            } catch (error) {
                if (!cancelled) console.error('Could not check duplicate RFID tags:', error);
            }
        }, 250);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [editingProduct?._id, showAddModal, tagKey]);

    const rfid = useDeviceSession(showAddModal ? 'CHECK' : 'IDLE', data => {
        if (!showAddModal) return;
        const newTags = uniqueTagIds([
            ...parseTagIds(data.tagIds),
            ...parseTagIds(data.result?.tagIds),
            ...parseTagIds(data.result?.unknownTagIds),
            ...(data.result?.found || []).map(tag => tag.tagId),
        ]);
        const arrivingTags = newTags.filter(tag => !lastSeenTags.current.has(tag));
        lastSeenTags.current = new Set(newTags);
        if (arrivingTags.length === 0) return;
        setFormData(prev => {
            const existing = parseTagIds(prev.rfidTags);
            const combined = uniqueTagIds([...existing, ...arrivingTags]);
            return combined.length === existing.length ? prev : { ...prev, rfidTags: serializeTagIds(combined) };
        });
    });
    const isConnected = rfid.ready;

    const { data: products, isLoading } = useQuery<Product[]>({
        queryKey: ['products'],
        queryFn: async () => {
            const resp = await api.get('/products');
            return resp.data;
        },
    });

    const addProductMutation = useMutation({
        mutationFn: async (newProduct: ProductForm) => {
            const { rfidTags, ...productDataWithUiState } = newProduct;
            const { expectedTagCount, ...productData } = productDataWithUiState;
            void expectedTagCount;
            const resp = await api.post('/products', productData);
            const createdProduct = resp.data;

            if (rfidTags && rfidTags.trim()) {
                const tagIds = uniqueTagIds(parseTagIds(rfidTags));
                console.log('Final Tags to save (New Product):', JSON.stringify(tagIds));
                if (tagIds.length > 0) {
                    await api.post('/tags/sync', {
                        deviceId: rfid.deviceId,
                        tagIds,
                        mode: 'add',
                        productId: createdProduct._id,
                    });
                }
            }
            return createdProduct;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            closeModal();
        },
    });

    const updateProductMutation = useMutation({
        mutationFn: async (updatedProduct: ProductForm & { _id: string }) => {
            const { rfidTags, _id, ...productDataWithUiState } = updatedProduct;
            const { expectedTagCount, ...productData } = productDataWithUiState;
            void expectedTagCount;
            await api.put(`/products/${_id}`, productData);

            // Always sync tags (even if empty) to ensure they match the input
            const tagIds = uniqueTagIds(parseTagIds(rfidTags));
            console.log('Final Tags to save (Update Product):', JSON.stringify(tagIds));
            await api.post('/tags/sync', {
                deviceId: rfid.deviceId,
                tagIds,
                mode: 'replace',
                productId: _id,
            });
            return { _id };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            closeModal();
        },
    });

    const deleteProductMutation = useMutation({
        mutationFn: async (id: string) => {
            if (confirm('Are you sure you want to delete this product?')) {
                await api.delete(`/products/${id}`);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
        },
    });

    const closeModal = () => {
        editRequest.current++;
        lastSeenTags.current.clear();
        setShowAddModal(false);
        setEditingProduct(null);
        setDuplicateTagIds([]);
        setFormData(emptyProductForm);
    };

    const removeTag = (tagId: string) => {
        setFormData(prev => ({
            ...prev,
            rfidTags: serializeTagIds(parseTagIds(prev.rfidTags).filter((id) => id !== tagId)),
        }));
    };

    const handleEdit = async (product: Product) => {
        const requestId = ++editRequest.current;
        setEditingProduct(product);
        setFormData({
            name: product.name,
            sku: product.sku,
            basePrice: product.basePrice,
            category: product.category,
            imageUrl: product.imageUrl || '',
            rfidTags: '', // Will fetch below
            expectedTagCount: 0,
        });
        setShowAddModal(true);

        try {
            const resp = await api.get(`/tags/product/${product._id}`);
            if (requestId !== editRequest.current) return;
            const tags = (resp.data as Array<{ tagId: string }>).map((t) => t.tagId);
            setFormData(prev => ({
                ...prev,
                rfidTags: serializeTagIds(uniqueTagIds([...parseTagIds(prev.rfidTags), ...tags])),
                expectedTagCount: tags.length,
            }));
        } catch (err) {
            console.error('Failed to fetch tags:', err);
        }
    };

    return (
        <div className="space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">ຈັດການສິນຄ້າ</h2>
                    <p className="text-muted-foreground">ເພີ່ມ ແກ້ໄຂ ແລະ ຈັດການລາຄາສິນຄ້າ</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-primary text-primary-foreground flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                    <Plus className="w-5 h-5" />
                    ເພີ່ມສິນຄ້າ
                </button>
            </header>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: 'ສິນຄ້າທັງໝົດ', value: products?.length || 0, icon: Package, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                    { label: 'ໝວດໝູ່ສິນຄ້າ', value: new Set(products?.map((p) => p.category)).size, icon: Tag, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                    { label: 'ລາຄາສະເລ່ຍ', value: formatCurrency((products?.reduce((acc, p) => acc + p.basePrice, 0) ?? 0) / (products?.length || 1)), icon: Search, color: 'text-green-500', bg: 'bg-green-500/10' },
                ].map((stat, i) => (
                    <div key={i} className="bg-card border border-border p-6 rounded-2xl shadow-sm flex items-center gap-4">
                        <div className={cn("p-4 rounded-xl", stat.bg)}>
                            <stat.icon className={cn("w-6 h-6", stat.color)} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                            <p className="text-2xl font-bold">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Products Table */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden text-sm">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-muted/50 border-b border-border">
                        <tr>
                            <th className="px-6 py-4 font-bold">ສິນຄ້າ</th>
                            <th className="px-6 py-4 font-bold">SKU</th>
                            <th className="px-6 py-4 font-bold">ໝວດໝູ່</th>
                            <th className="px-6 py-4 font-bold text-right">ລາຄາ</th>
                            <th className="px-6 py-4 font-bold text-center">ຈັດການ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                                </td>
                            </tr>
                        ) : (products?.length ?? 0) > 0 ? (
                            products?.map((p) => (
                                <tr key={p._id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <ProductThumbnail imageUrl={p.imageUrl} name={p.name} />
                                            <div>
                                                <p className="font-bold text-foreground">{p.name}</p>
                                                <p className="text-xs font-medium text-muted-foreground">
                                                    {p.imageUrl ? 'ມີຮູບສິນຄ້າ' : 'ຍັງບໍ່ມີຮູບ'}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-muted-foreground">{p.sku}</td>
                                    <td className="px-6 py-4">
                                        <span className="bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider">
                                            {p.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-primary">
                                        {formatCurrency(p.basePrice)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleEdit(p)}
                                                className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => deleteProductMutation.mutate(p._id)}
                                                className="p-2 hover:bg-destructive/10 rounded-lg transition-colors text-destructive"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="px-6 py-24 text-center text-muted-foreground">
                                    <Package className="w-12 h-12 mx-auto opacity-20 mb-2" />
                                    <p>ຍັງບໍ່ມີສິນຄ້າ ກົດ “ເພີ່ມສິນຄ້າ” ເພື່ອເລີ່ມຕົ້ນ</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Product Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-border pb-4">
                            <h3 className="text-2xl font-bold">{editingProduct ? 'ແກ້ໄຂສິນຄ້າ' : 'ເພີ່ມສິນຄ້າໃໝ່'}</h3>
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-[10px] font-bold uppercase tracking-wider">
                                {isConnected ? (
                                    <>
                                        <Wifi className="w-3 h-3 text-green-500" />
                                        <span className="text-green-500">Server ພ້ອມຮັບ Tag</span>
                                    </>
                                ) : (
                                    <>
                                        <WifiOff className="w-3 h-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">Server ຍັງບໍ່ພ້ອມ</span>
                                    </>
                                )}
                            </div>
                        </div>
                        {rfid.error && <p role="alert" className="text-sm text-destructive">{rfid.error}</p>}
                        {(addProductMutation.error || updateProductMutation.error) && <p role="alert" className="text-sm text-destructive">{(() => {
                            const error = addProductMutation.error || updateProductMutation.error;
                            return isAxiosError(error) ? String(error.response?.data?.message || error.message) : 'ບັນທຶກສິນຄ້າບໍ່ສຳເລັດ';
                        })()}</p>}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">ຊື່ສິນຄ້າ</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Premium RFID Card"
                                    className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow"
                                />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">SKU</label>
                                    <input
                                        type="text"
                                        value={formData.sku}
                                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                        placeholder="SKU-123"
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">ລາຄາ (LAK)</label>
                                    <input
                                        type="number"
                                        value={formData.basePrice}
                                        onChange={(e) => setFormData({ ...formData, basePrice: Number(e.target.value) })}
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">ຈຳນວນ Tag</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={formData.expectedTagCount}
                                        onChange={(e) => setFormData({ ...formData, expectedTagCount: Math.max(0, Number(e.target.value)) })}
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">ໝວດໝູ່</label>
                                <input
                                    type="text"
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    placeholder="Electronics, Office, etc."
                                    className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow"
                                />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">ຮູບສິນຄ້າ (URL)</label>
                                    <input
                                        type="url"
                                        value={formData.imageUrl || ''}
                                        onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                                        placeholder="https://placehold.co/600x400?text=4B+Product"
                                        className="w-full bg-background border border-border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow"
                                    />
                                </div>
                                <ProductThumbnail imageUrl={formData.imageUrl} name={formData.name || 'Product'} size="large" />
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <label className="text-sm font-medium">ເລກ RFID Tag</label>
                                        <p className="text-[11px] text-muted-foreground">
                                            {scannedTagIds.length} tag{tagTarget > 0 ? ` / ${tagTarget}` : ''} {remainingTagCount > 0 ? `· ຍັງຂາດ ${remainingTagCount}` : ''}
                                            {hasTooManyTags ? `· ເກີນ ${scannedTagIds.length - tagTarget}` : ''}
                                        </p>
                                    </div>
                                    {scannedTagIds.length > 0 && (
                                        <button
                                            onClick={() => setFormData({ ...formData, rfidTags: '' })}
                                            className="text-[10px] font-bold text-destructive hover:underline flex items-center gap-1"
                                        >
                                            <X className="w-3 h-3" />
                                            ລ້າງ Tag
                                        </button>
                                    )}
                                </div>

                                <div className={cn(
                                    "min-h-32 rounded-xl border bg-background p-3 transition-colors",
                                    duplicateTagIds.length > 0 ? "border-red-500 bg-red-50/40" : hasTooManyTags ? "border-destructive/60" : remainingTagCount === 0 && tagTarget > 0 ? "border-green-500/50" : "border-border"
                                )}>
                                    {scannedTagIds.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {scannedTagIds.map((tagId) => (
                                                <div
                                                    key={tagId}
                                                    className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs", duplicateTagIds.includes(tagId) ? "border-red-500 bg-red-100 text-red-700" : "border-border bg-muted")}
                                                >
                                                    <span>{tagId}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeTag(tagId)}
                                                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                                                        aria-label={`Remove RFID tag ${tagId}`}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex h-24 items-center justify-center text-center text-sm text-muted-foreground">
                                            {isConnected ? "ວາງ tag ໃສ່ເຄື່ອງອ່ານ ລາຍການຈະຂຶ້ນທີ່ນີ້" : "ເຊື່ອມຕໍ່ເຄື່ອງອ່ານກ່ອນ"}
                                        </div>
                                    )}
                                </div>
                                {duplicateTagIds.length > 0 && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Tag ຊ້ຳ: {duplicateTagIds.join(', ')} — ກະລຸນາເອົາ Tag ນີ້ອອກກ່ອນບັນທຶກ</p>}

                                <div className="relative">
                                    <textarea
                                        value={formData.rfidTags}
                                        onChange={(e) => {
                                            const tags = uniqueTagIds(parseTagIds(e.target.value));
                                            setFormData({ ...formData, rfidTags: serializeTagIds(tags) });
                                        }}
                                        placeholder="Paste RFID tags here, one per line"
                                        rows={3}
                                        className="w-full resize-none bg-background border border-border rounded-xl px-4 py-3 font-mono text-xs focus:ring-2 focus:ring-primary outline-none transition-shadow pr-10"
                                    />
                                    <Tag className="absolute right-4 top-4 w-4 h-4 text-muted-foreground opacity-20" />
                                </div>
                                <p className="text-[10px] text-muted-foreground italic">
                                    {isConnected ? "ກຳລັງລໍຖ້າອ່ານ tag... ວາງ tag ຫຼາຍອັນໄດ້ ລະບົບຈະກັນຊ້ຳໃຫ້" : "ເຊື່ອມຕໍ່ເຄື່ອງອ່ານເພື່ອຮັບ tag ອັດຕະໂນມັດ"}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-border">
                            <button
                                onClick={closeModal}
                                className="px-6 py-2 bg-muted text-muted-foreground rounded-lg font-medium hover:bg-muted/80"
                            >
                                ຍົກເລີກ
                            </button>
                            <button
                                onClick={() => {
                                    if (editingProduct) {
                                        updateProductMutation.mutate({ ...formData, _id: editingProduct._id });
                                    } else {
                                        addProductMutation.mutate(formData);
                                    }
                                }}
                                disabled={addProductMutation.isPending || updateProductMutation.isPending || duplicateTagIds.length > 0}
                                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-bold shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-2"
                            >
                                {(addProductMutation.isPending || updateProductMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editingProduct ? 'ບັນທຶກການແກ້ໄຂ' : 'ບັນທຶກສິນຄ້າ'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

function ProductThumbnail({
    imageUrl,
    name,
    size = 'default',
}: {
    imageUrl?: string;
    name: string;
    size?: 'default' | 'large';
}) {
    const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
    const showImage = Boolean(imageUrl && failedImageUrl !== imageUrl);
    const sizeClass = size === 'large' ? 'h-24 w-24 rounded-2xl' : 'h-14 w-14 rounded-xl';
    const iconClass = size === 'large' ? 'h-10 w-10' : 'h-6 w-6';

    return (
        <div className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-border bg-muted", sizeClass)}>
            {showImage ? (
                <img
                    src={imageUrl}
                    alt={`ຮູບສິນຄ້າ ${name}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() => setFailedImageUrl(imageUrl || null)}
                />
            ) : (
                <Package className={cn("text-muted-foreground opacity-50", iconClass)} />
            )}
        </div>
    );
}
