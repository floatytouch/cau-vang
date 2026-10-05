import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app-config.js';

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
const config = app.get(ConfigService<AppConfig, true>);
const port = config.getOrThrow('port', { infer: true });
await app.listen(port);
new Logger('Bootstrap').log(`backend listening on http://localhost:${port}`);
