import { Model } from 'mongoose';
import { Product } from './schemas/product.schema';
export declare class ProductsService {
    private productModel;
    constructor(productModel: Model<Product>);
    create(createProductDto: any): Promise<Product>;
    findAll(): Promise<Product[]>;
    findById(id: string): Promise<Product | null>;
    update(id: string, updateProductDto: any): Promise<Product | null>;
    delete(id: string): Promise<any>;
}
