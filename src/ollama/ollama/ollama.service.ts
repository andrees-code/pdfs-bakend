import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OllamaService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // 🔹 MODO NORMAL (equivalente a tu chat actual)
  async chat(messages: any[]) {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,       // estable para exámenes
      max_tokens: 1500,       // control de coste
    });

    const content =
      completion.choices[0]?.message?.content || '';

    return {
      message: { content },
    };
  }
}
