import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { Template, TemplateSchema } from './schemas/template.schema';
import { UserSchema } from '../user/schemas/user.schema/user.schema';
import { ProjectVersion, ProjectVersionSchema } from '../shared/schemas/project-version.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Template', schema: TemplateSchema },
      { name: 'User', schema: UserSchema },
      { name: ProjectVersion.name, schema: ProjectVersionSchema },
    ]),
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
