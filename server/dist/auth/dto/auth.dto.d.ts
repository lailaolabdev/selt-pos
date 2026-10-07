export declare class AdminLoginDto {
    username: string;
    password: string;
}
export declare class AdminProfileDto {
    id: string;
    username: string;
    displayName: string;
    role: string;
}
export declare class AdminLoginResponseDto {
    accessToken: string;
    expiresIn: number;
    admin: AdminProfileDto;
}
