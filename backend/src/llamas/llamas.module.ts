import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlamasTransaction } from '../database/entities/llamas-transaction.entity.js';
import { LlamasService } from './llamas.service.js';
import { LlamasController } from './llamas.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([LlamasTransaction])],
  controllers: [LlamasController],
  providers: [LlamasService],
  exports: [LlamasService],
})
export class LlamasModule {}
