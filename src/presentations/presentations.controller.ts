import { Controller, Get, Post, Body, Param, Put, Delete, Query, HttpException, HttpStatus } from '@nestjs/common';
import { PresentationsService } from './presentations.service';
import { CreatePresentationDto } from './dto/create-presentation.dto';

@Controller('presentations')
export class PresentationsController {
  constructor(private readonly presentationsService: PresentationsService) {}

  @Post()
  create(@Body() createPresentationDto: CreatePresentationDto) {
    return this.presentationsService.create(createPresentationDto);
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
  update(@Param('id') id: string, @Body() updatePresentationDto: CreatePresentationDto) {
    return this.presentationsService.update(id, updatePresentationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.presentationsService.remove(id);
  }
}