import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin', description: 'Admin username.' })
  username: string;

  @ApiProperty({ example: 'admin', description: 'Admin password.' })
  password: string;
}

export class AdminProfileDto {
  @ApiProperty({ example: '66f0c2d4b7f1c9a001234111' })
  id: string;

  @ApiProperty({ example: 'admin' })
  username: string;

  @ApiProperty({ example: 'Administrator' })
  displayName: string;

  @ApiProperty({ example: 'admin' })
  role: string;
}

export class AdminLoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 86400, description: 'Token TTL in seconds.' })
  expiresIn: number;

  @ApiProperty({ type: AdminProfileDto })
  admin: AdminProfileDto;
}
