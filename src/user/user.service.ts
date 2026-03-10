import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
// 👇 1. IMPORTAR MAILER SERVICE
import { MailerService } from '@nestjs-modules/mailer';

import { User } from './interfaces/user/user.interface';
import { UserDocument } from './interfaces/user/user-document';
import { UserDto } from './dto/user.dto/user.dto';
import { CreateUserDto } from './dto/user.dto/CreateUserDto';
import { LoginUserDto } from './dto/user.dto/LoginUserDto';

@Injectable()
export class UserService {
  constructor(
    @InjectModel('User') private userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    // 👇 2. INYECTARLO AQUÍ
    private readonly mailerService: MailerService,
  ) {}

  // ➕ Crear usuario manual/admin
  async addUser(userDto: UserDto): Promise<User> {
    if (userDto.password) {
      userDto.password = await bcrypt.hash(userDto.password, 10);
    }
    const user = new this.userModel(userDto);
    const savedUser = await user.save();
    const { password, ...rest } = savedUser.toObject();
    return { ...rest, _id: savedUser._id.toString() } as User;
  }

  // 🔐 Registro
  async register(data: CreateUserDto) {
    const existing = await this.userModel.findOne({ email: data.email });
    if (existing) throw new BadRequestException('Email ya registrado');

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const newUser = await this.userModel.create({
      ...data,
      password: hashedPassword,
    });

    const token = this.jwtService.sign({ id: newUser._id.toString(), role: newUser.role });

    const { password, ...userWithoutPassword } = newUser.toObject();
    return { user: { ...userWithoutPassword, _id: newUser._id.toString() }, token };
  }

  // 🔑 Login
  async login(data: LoginUserDto) {
    const user = await this.userModel.findOne({ email: data.email }).select('+password');
    if (!user) throw new BadRequestException('Usuario o contraseña incorrecta');

    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) throw new BadRequestException('Usuario o contraseña incorrecta');

    const token = this.jwtService.sign({ id: user._id.toString(), role: user.role });

    const { password, ...userWithoutPassword } = user.toObject();
    return { user: { ...userWithoutPassword, _id: user._id.toString() }, token };
  }

  // 📄 Obtener todos los usuarios
  async getUsers(): Promise<User[]> {
    const users = await this.userModel.find().exec();
    return users.map(u => {
      const { password, ...rest } = u.toObject();
      return { ...rest, _id: u._id.toString() } as User;
    });
  }

  // 🔍 Obtener por ID
  async getUser(id: string): Promise<User> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    const { password, ...rest } = user.toObject();
    return { ...rest, _id: user._id.toString() } as User;
  }

  // 🔍 Buscar por username
  async getUserByUsername(username: string): Promise<User[]> {
    const regex = new RegExp(username, 'i');
    const users = await this.userModel.find({ username: { $regex: regex } }).exec();
    return users.map(u => {
      const { password, ...rest } = u.toObject();
      return { ...rest, _id: u._id.toString() } as User;
    });
  }

  // 🔄 Update completo con hash de password si existe
  async updateUser(id: string, userDto: UserDto): Promise<User> {
    if (userDto.password) {
      userDto.password = await bcrypt.hash(userDto.password, 10);
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, { $set: userDto }, { new: true })
      .exec();

    if (!updatedUser) throw new NotFoundException('User not found');

    const { password, ...rest } = updatedUser.toObject();
    return { ...rest, _id: updatedUser._id.toString() } as User;
  }

  // 🩹 Patch parcial
  async patchUser(id: string, partialUserDto: Partial<UserDto>): Promise<User> {
    if (partialUserDto.password) {
      partialUserDto.password = await bcrypt.hash(partialUserDto.password, 10);
    }

    const patchedUser = await this.userModel
      .findByIdAndUpdate(id, { $set: partialUserDto }, { new: true })
      .exec();

    if (!patchedUser) throw new NotFoundException('User not found');

    const { password, ...rest } = patchedUser.toObject();
    return { ...rest, _id: patchedUser._id.toString() } as User;
  }

  // ❌ Eliminar
  async deleteUser(id: string): Promise<User> {
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
    if (!deletedUser) throw new NotFoundException('User not found');
    const { password, ...rest } = deletedUser.toObject();
    return { ...rest, _id: deletedUser._id.toString() } as User;
  }

  // 📧 Forgot Password (CON ENVÍO REAL)
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.userModel.findOne({ email });

    if (!user) {
      // Retardo artificial para evitar enumeración de usuarios (timing attacks)
      // await new Promise(resolve => setTimeout(resolve, 500)); 
      return { message: 'Si el correo existe, se ha enviado un enlace de recuperación.' };
    }

    // 2. Generar Token aleatorio
    const resetToken = crypto.randomBytes(20).toString('hex');

    // 3. Guardar token y expiración (1 hora)
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); 

    await user.save();

    // 4. ENVÍO DE EMAIL
    // Ajusta esta URL al puerto donde corre tu Frontend (Vite suele ser 5173)
    const resetUrl = `https://www.ponteaprobados.es/reset-password?token=${resetToken}`;

    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Recuperación de contraseña 🔒',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #3978D7;">Solicitud de restablecimiento</h2>
            <p>Hola,</p>
            <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>
            <p>Haz clic en el siguiente botón para continuar:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #3978D7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Restablecer contraseña</a>
            </div>
            <p style="font-size: 12px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
            <p style="font-size: 12px; color: #666; word-break: break-all;">${resetUrl}</p>
            <p>Este enlace expirará en 1 hora.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 11px; color: #999;">Si no has solicitado este cambio, puedes ignorar este correo.</p>
          </div>
        `,
      });
      console.log(`[Email enviado] Recuperación para: ${user.email}`);
    } catch (error) {
      console.error('Error enviando email:', error);
      // No lanzamos error al cliente para no romper el flujo, pero lo logueamos
    }

    return { 
      message: 'Si el correo existe, se ha enviado un enlace de recuperación.' 
    };
  }
  // 🔄 Reset Password (Validar token y cambiar contraseña)
  async resetPassword(token: string, newPassword: string): Promise<User> {
    // 1. Buscar usuario por token Y verificar que la fecha no haya expirado ($gt = greater than)
    const user = await this.userModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new BadRequestException('El enlace es inválido o ha expirado');
    }

    // 2. Encriptar nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 3. Actualizar usuario y limpiar el token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    const { password, ...rest } = user.toObject();
    return { ...rest, _id: user._id.toString() } as User;
  }
}