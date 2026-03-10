import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { UserService } from './user.service';
import { UserDto } from './dto/user.dto/user.dto';
import { CreateUserDto } from './dto/user.dto/CreateUserDto';
import { LoginUserDto } from './dto/user.dto/LoginUserDto';
import { ForgotPasswordDto } from './dto/user.dto/ForgotPasswordDto';
import { ResetPasswordDto } from './dto/user.dto/ResetPasswordDto';

@Controller('api/v1/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ➕ Registro
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    try {
      const { user, token } = await this.userService.register(createUserDto);
      return { status: true, user, token };
    } catch (e: any) {
      throw new BadRequestException({ status: false, message: e.message });
    }
  }

  // 🔑 Login
  @Post('login')
  async login(@Body() loginUserDto: LoginUserDto) {
    try {
      const { user, token } = await this.userService.login(loginUserDto);
      return { status: true, user, token };
    } catch (e: any) {
      throw new BadRequestException({ status: false, message: e.message });
    }
  }

  // ➕ Crear usuario (admin)
  @Post()
  async addUser(@Body() userDto: UserDto) {
    try {
      await this.userService.addUser(userDto);
      return { status: true, message: 'User successfully created' };
    } catch (e: any) {
      throw new BadRequestException({ status: false, message: e.message });
    }
  }

  // 📧 Endpoint para solicitar recuperación
  @Post('auth/forgot-password') // Nota: ajusta la ruta si prefieres 'forgot-password' directo
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    try {
      const result = await this.userService.forgotPassword(forgotPasswordDto.email);
      return { status: true, ...result };
    } catch (e: any) {
      // Incluso si falla algo interno, intentamos no dar muchas pistas por seguridad,
      // a menos que sea error crítico de servidor.
      throw new InternalServerErrorException({ status: false, message: e.message });
    }
  }
  @Post('auth/reset-password')
  async resetPassword(@Body() resetDto: ResetPasswordDto) {
    try {
      await this.userService.resetPassword(resetDto.token, resetDto.newPassword);
      return { status: true, message: 'Contraseña actualizada correctamente' };
    } catch (e: any) {
      throw new BadRequestException({ status: false, message: e.message });
    }
  }

  // 📄 Obtener todos
  @Get()
  async getUsers() {
    try {
      const data = await this.userService.getUsers();
      return { status: true, data };
    } catch (e: any) {
      throw new BadRequestException({ status: false, message: e.message });
    }
  }

  // 🔍 Obtener por ID
  @Get('user/:id')
  async getUser(@Param('id') id: string) {
    try {
      const data = await this.userService.getUser(id);
      return { status: true, data };
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new InternalServerErrorException({ status: false, message: e.message });
    }
  }

  // 🔍 Buscar por username
  @Get('byUsername')
  async getUserByUsername(@Query('username') username: string) {
    try {
      const data = await this.userService.getUserByUsername(username);
      return { status: true, data };
    } catch (e: any) {
      throw new InternalServerErrorException({ status: false, message: e.message });
    }
  }

  // 🔄 Update completo con avatar (compatible Vercel)
  @Put('update/:id')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
    }),
  )
  async updateUser(
    @Param('id') id: string,
    @Body() userDto: UserDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    try {
      if (avatar) {
        // Aquí deberías subir avatar.buffer a S3, Cloudinary o Firebase
        // y luego guardar la URL resultante en userDto.avatar
        // Ejemplo: userDto.avatar = await this.userService.uploadAvatar(avatar);
        userDto.avatar = `data:${avatar.mimetype};base64,${avatar.buffer.toString('base64')}`; // temporal
      }
      const updatedUser = await this.userService.updateUser(id, userDto);
      return { status: true, data: updatedUser };
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new InternalServerErrorException({ status: false, message: e.message });
    }
  }

  // 🩹 Patch parcial
  @Patch('update/:id')
  async patchUser(@Param('id') id: string, @Body() partialUserDto: Partial<UserDto>) {
    try {
      const updated = await this.userService.patchUser(id, partialUserDto);
      return { status: true, data: updated };
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new InternalServerErrorException({ status: false, message: e.message });
    }
  }

  // ❌ Eliminar usuario
  @Delete('delete/:id')
  async deleteUser(@Param('id') id: string) {
    try {
      await this.userService.deleteUser(id);
      return { status: true, message: 'User deleted' };
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new InternalServerErrorException({ status: false, message: e.message });
    }
  }
}
