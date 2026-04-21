import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { JwtAuthGuard } from '../user/jwt-auth.guard';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Get('public')
  getPublicTemplates() {
    return this.templatesService.getPublicTemplates();
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  getUserTemplates(@Param('userId') userId: string) {
    return this.templatesService.getUserTemplates(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getById(@Param('id') id: string) {
    return this.templatesService.getTemplateById(id);
  }

  @Post('save')
  @UseGuards(JwtAuthGuard)
  saveToGallery(@Body() body: { templateId: string; userId: string }) {
    return this.templatesService.saveToGallery(body.templateId, body.userId);
  }

  @Post('remove')
  @UseGuards(JwtAuthGuard)
  removeFromGallery(@Body() body: { templateId: string; userId: string }) {
    return this.templatesService.removeFromGallery(body.templateId, body.userId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  updateTemplate(@Param('id') id: string, @Body() dto: CreateTemplateDto) {
    return this.templatesService.updateTemplate(id, dto.userId, dto);
  }

  @Post('publish')
  @UseGuards(JwtAuthGuard)
  publishTemplate(@Body() body: { templateId: string; userId: string }) {
    return this.templatesService.publishTemplate(body.templateId, body.userId);
  }

  @Post('delete')
  @UseGuards(JwtAuthGuard)
  deleteTemplate(@Body() body: { templateId: string; userId: string }) {
    return this.templatesService.deleteTemplate(body.templateId, body.userId);
  }
}
