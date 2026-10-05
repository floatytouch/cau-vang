import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { resolvePort } from './port.js';

const port = resolvePort(process.env.PORT);

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(port);
new Logger('Bootstrap').log(`backend listening on http://localhost:${port}`);
