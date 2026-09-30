import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminAuthGuard } from './admin-auth.guard';
import { AuthService } from './auth.service';
import { AdminLoginDto, AdminLoginResponseDto, AdminProfileDto } from './dto/auth.dto';

@ApiTags('Admin Auth')
@Controller('auth/admin')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({
    summary: 'Admin login',
    description: 'Login ສຳລັບ admin ເພື່ອເຂົ້າໜ້າຈັດການສິນຄ້າ ແລະຜູກ RFID tags.',
  })
  @ApiBody({ type: AdminLoginDto })
  @ApiResponse({ status: 201, type: AdminLoginResponseDto })
  async login(@Body() data: AdminLoginDto) {
    return this.authService.login(data.username, data.password);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin-token')
  @ApiOperation({ summary: 'Current admin profile' })
  @ApiResponse({ status: 200, type: AdminProfileDto })
  async me(@Req() request: Request & { admin?: AdminProfileDto }) {
    return request.admin;
  }
}
