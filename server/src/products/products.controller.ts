import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin-token')
  @ApiOperation({
    summary: 'Create product',
    description: 'ສ້າງສິນຄ້າໃໝ່ກ່ອນນຳ RFID tags ໄປຜູກກັບ productId.',
  })
  @ApiBody({ type: CreateProductDto })
  @ApiResponse({ status: 201, description: 'Product created.' })
  async create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Get()
  @ApiOperation({ summary: 'List products', description: 'ດຶງລາຍການສິນຄ້າທັງໝົດ.' })
  @ApiResponse({ status: 200, description: 'Product list.' })
  async findAll() {
    return this.productsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by id' })
  @ApiParam({ name: 'id', example: '66f0c2d4b7f1c9a001234567', description: 'MongoDB product _id.' })
  @ApiResponse({ status: 200, description: 'Product detail or null.' })
  async findById(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Put(':id')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin-token')
  @ApiOperation({ summary: 'Update product' })
  @ApiParam({ name: 'id', example: '66f0c2d4b7f1c9a001234567', description: 'MongoDB product _id.' })
  @ApiBody({ type: UpdateProductDto })
  @ApiResponse({ status: 200, description: 'Updated product or null.' })
  async update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin-token')
  @ApiOperation({ summary: 'Delete product' })
  @ApiParam({ name: 'id', example: '66f0c2d4b7f1c9a001234567', description: 'MongoDB product _id.' })
  @ApiResponse({ status: 200, description: 'Deleted product or null.' })
  async delete(@Param('id') id: string) {
    return this.productsService.delete(id);
  }
}
