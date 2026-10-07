"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminLoginResponseDto = exports.AdminProfileDto = exports.AdminLoginDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class AdminLoginDto {
    username;
    password;
}
exports.AdminLoginDto = AdminLoginDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'admin', description: 'Admin username.' }),
    __metadata("design:type", String)
], AdminLoginDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'admin', description: 'Admin password.' }),
    __metadata("design:type", String)
], AdminLoginDto.prototype, "password", void 0);
class AdminProfileDto {
    id;
    username;
    displayName;
    role;
}
exports.AdminProfileDto = AdminProfileDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '66f0c2d4b7f1c9a001234111' }),
    __metadata("design:type", String)
], AdminProfileDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'admin' }),
    __metadata("design:type", String)
], AdminProfileDto.prototype, "username", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Administrator' }),
    __metadata("design:type", String)
], AdminProfileDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'admin' }),
    __metadata("design:type", String)
], AdminProfileDto.prototype, "role", void 0);
class AdminLoginResponseDto {
    accessToken;
    expiresIn;
    admin;
}
exports.AdminLoginResponseDto = AdminLoginResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
    __metadata("design:type", String)
], AdminLoginResponseDto.prototype, "accessToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 86400, description: 'Token TTL in seconds.' }),
    __metadata("design:type", Number)
], AdminLoginResponseDto.prototype, "expiresIn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: AdminProfileDto }),
    __metadata("design:type", AdminProfileDto)
], AdminLoginResponseDto.prototype, "admin", void 0);
//# sourceMappingURL=auth.dto.js.map