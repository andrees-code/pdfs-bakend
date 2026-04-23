import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PresentationsService } from './presentations.service';
import { PresentationsController } from './presentations.controller';
import { Presentation, PresentationSchema } from './schemas/presentation.schema';
import { ProjectVersion, ProjectVersionSchema } from '../shared/schemas/project-version.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Presentation.name, schema: PresentationSchema },
      { name: ProjectVersion.name, schema: ProjectVersionSchema },
    ]),
  ],
  controllers: [PresentationsController],
  providers: [PresentationsService],
  exports: [PresentationsService],
})
export class PresentationsModule {}