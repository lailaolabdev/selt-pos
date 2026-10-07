import { Request } from 'express';
import { AuthService } from './auth.service';
import { AdminLoginDto, AdminProfileDto } from './dto/auth.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(data: AdminLoginDto): Promise<{
        accessToken: string;
        expiresIn: number;
        admin: {
            id: string;
            username: string;
            displayName: string;
            role: string;
        };
    }>;
    me(request: Request & {
        admin?: AdminProfileDto;
    }): Promise<AdminProfileDto | undefined>;
}
