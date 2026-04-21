import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PresentationsModule } from './presentations/presentations.module';
import { UserModule } from './user/user.module';
import { OllamaModule } from './ollama/ollama/ollama.module';
import { NotesModule } from './notes/notes.module';
import { SubscriptionsModule } from './user/subscriptions/subscriptions.module';
import { UploadController } from './upload/upload.controller';
import { TemplatesModule } from './templates/templates.module';

console.log('🔧 Inicializando AppModule...');
console.log('📊 Variables de entorno:');
console.log('  URI:', process.env.URI ? '✅ Configurada' : '❌ Faltante');
console.log('  JWT_SECRET:', process.env.JWT_SECRET ? '✅ Configurada' : '❌ Faltante');
console.log('  NODE_ENV:', process.env.NODE_ENV || 'development');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.URI as string, {
      // Opciones de conexión simplificadas para compatibilidad
    }),
    ScheduleModule.forRoot(),
    UserModule,
    PresentationsModule,
    OllamaModule,
    NotesModule,
    SubscriptionsModule,
    TemplatesModule,
  ],
  controllers: [AppController, UploadController],
  providers: [AppService],
})
export class AppModule {
  constructor() {
    console.log('✅ AppModule inicializado correctamente');
  }
}
