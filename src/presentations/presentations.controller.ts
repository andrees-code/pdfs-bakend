import { Controller, Get, Post, Body, Param, Put, Delete, Query, HttpException, HttpStatus } from '@nestjs/common';
import { PresentationsService } from './presentations.service';
import { CreatePresentationDto } from './dto/create-presentation.dto';

@Controller('presentations')
export class PresentationsController {
  constructor(private readonly presentationsService: PresentationsService) {}

  @Post()
  async create(@Body() createPresentationDto: CreatePresentationDto) {
    console.log('📥 [POST /presentations] Iniciando guardado...');
    console.log('   userId:', createPresentationDto.userId);
    console.log('   title:', createPresentationDto.title);
    console.log('   docType:', createPresentationDto.docType);
    console.log('   pdfBase64 size:', createPresentationDto.pdfBase64?.length || 0, 'caracteres (~', Math.round((createPresentationDto.pdfBase64?.length || 0) / 1048576), 'MB)');
    console.log('   coverImage size:', createPresentationDto.coverImage?.length || 0, 'caracteres (~', Math.round((createPresentationDto.coverImage?.length || 0) / 1048576), 'MB)');
    
    try {
      const result = await this.presentationsService.create(createPresentationDto);
      console.log('✅ [POST /presentations] Guardado exitoso. ID:', result._id);
      return result;
    } catch (error) {
      console.error('❌ [POST /presentations] Error:', error.message);
      throw error;
    }
  }

  // 👇 AQUÍ ESTÁ LA MAGIA 👇
 // En presentations.controller.ts (modifica el findAll)
  @Get()
  async findAll(@Query('userId') userId: string) {
    return this.presentationsService.findAll(userId);
  }
  // 👆 FIN DE LA MAGIA 👆

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.presentationsService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updatePresentationDto: CreatePresentationDto) {
    console.log('📥 [PUT /presentations/:id] Iniciando actualización...', id);
    console.log('   pdfBase64 size:', updatePresentationDto.pdfBase64?.length || 0, 'caracteres (~', Math.round((updatePresentationDto.pdfBase64?.length || 0) / 1048576), 'MB)');
    
    try {
      const result = await this.presentationsService.update(id, updatePresentationDto);
      console.log('✅ [PUT /presentations/:id] Actualización exitosa');
      return result;
    } catch (error) {
      console.error('❌ [PUT /presentations/:id] Error:', error.message);
      throw error;
    }
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.presentationsService.remove(id);
  }
}