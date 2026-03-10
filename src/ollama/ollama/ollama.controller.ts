import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OllamaService } from './ollama.service';

@Controller('api')
export class OllamaController {
  constructor(private readonly ollamaService: OllamaService) {}

  @Post('chat')
  async chat(@Body('messages') messages: any[]) {
    return await this.ollamaService.chat(messages);
  }
}
