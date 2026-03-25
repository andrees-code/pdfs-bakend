import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PresentationsService } from './presentations.service';
import { PresentationsController } from './presentations.controller';
import { Presentation, PresentationSchema } from './schemas/presentation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Presentation.name, schema: PresentationSchema }])
  ],
  controllers: [PresentationsController],
  providers: [PresentationsService],
  exports: [PresentationsService],
})
export class PresentationsModule {}