import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    create(createProductDto: CreateProductDto): Promise<import("./schemas/product.schema").Product>;
    findAll(): Promise<import("./schemas/product.schema").Product[]>;
    findById(id: string): Promise<import("./schemas/product.schema").Product | null>;
    update(id: string, updateProductDto: UpdateProductDto): Promise<import("./schemas/product.schema").Product | null>;
    delete(id: string): Promise<any>;
}
