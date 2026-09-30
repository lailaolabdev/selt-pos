import { ApiProperty } from '@nestjs/swagger';

export class TtsRequestDto {
  @ApiProperty({
    example: 'ລາຍການພ້ອມແລ້ວ ກະລຸນາກົດປຸ່ມສີແດງເພື່ອຊຳລະເງິນ',
    description: 'Lao text to synthesize with the configured TTS model.',
  })
  text: string;
}
