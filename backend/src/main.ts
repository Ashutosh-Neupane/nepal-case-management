import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export function configureApp(app: INestApplication) {
  app.enableCors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',') });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api');
  return app;
}

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production.');
  }
  const app = configureApp(await NestFactory.create(AppModule));
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}/api`);
}

if (require.main === module) {
  bootstrap();
}
