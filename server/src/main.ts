import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import morgan from 'morgan';
import { AppModule } from './app.module';
import { loadEnvFile } from './env';

loadEnvFile();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(
    morgan((tokens, request, response) =>
      JSON.stringify({
        type: 'http',
        timestamp: new Date().toISOString(),
        ip: tokens['remote-addr'](request, response),
        method: tokens.method(request, response),
        path: tokens.url(request, response),
        status: Number(tokens.status(request, response) || 0),
        responseTimeMs: Number(tokens['response-time'](request, response) || 0),
        contentLength: tokens.res(request, response, 'content-length'),
        userAgent: tokens['user-agent'](request, response),
      }),
    ),
  );
  app.enableCors();
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('4B-easy-POS API')
    .setDescription(
      [
        'API ສຳລັບ 4B-easy-POS, RFID hub, POS frontend, inventory ແລະ checkout flow.',
        '',
        'RFID hub test flow ຜ່ານ Swagger:',
        '1. POST /session/set-mode ເພື່ອຕັ້ງ mode ຂອງ deviceId. ຕົວຢ່າງ CHECKOUT ສຳລັບຈຸດຊຳລະເງິນ.',
        '2. POST /tags/capture ເພື່ອຈຳລອງ RFID hub ສົ່ງ tagIds ເຂົ້າ server.',
        '3. POST /tags/confirm-sale ຫຼັງຈາກທົດສອບ checkout ສຳເລັດ.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addTag('RFID Hub', 'Endpoint ທີ່ RFID hub ໃຊ້ສົ່ງ tag id ເຂົ້າ server')
    .addTag('Admin Auth', 'Login ແລະ token ສຳລັບ admin')
    .addTag('Session', 'ຕັ້ງ mode ແລະ clear session ຂອງເຄື່ອງ RFID/POS')
    .addTag('Products', 'ຈັດການຂໍ້ມູນສິນຄ້າ')
    .addTag('Inventory', 'ສະຫຼຸບ stock ຈາກ RFID tags')
    .addTag(
      'Payments',
      'PhaJay payment link, webhook, and local transaction status',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Signed admin token',
        description: 'Token ຈາກ POST /auth/admin/login',
      },
      'admin-token',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
