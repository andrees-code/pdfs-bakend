import { Module } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { OllamaController } from './ollama.controller';
import { PresentationsModule } from '../../presentations/presentations.module';

@Module({
  imports: [PresentationsModule],
  controllers: [OllamaController],
  providers: [OllamaService],
  exports: [OllamaService]
})
export class OllamaModule {}
