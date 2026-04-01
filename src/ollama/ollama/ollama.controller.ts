import { Controller, Post, Body, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OllamaService } from './ollama.service';

@Controller()
export class OllamaController {
  constructor(private readonly ollamaService: OllamaService) {}

  @Post('chat')
  async chat(
    @Body('messages') messages: any[],
    @Body('userId') userId: string,
    @Body('currentPage') currentPage?: number,
    @Body('documentState') documentState?: any,
    @Body('slideConfigs') slideConfigs?: any,
    @Body('numPages') numPages?: number,
  ) {
    return await this.ollamaService.chat(messages, userId, currentPage, documentState, slideConfigs, numPages);
  }
}
